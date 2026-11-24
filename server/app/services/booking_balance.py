"""Service completion and balance collection; all amounts are integer minor units."""
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException
from app.core.config import settings
from app.core.security import customer_token
from app.core.transactions import transaction_lock
from app.models.booking import Booking, BookingBalancePayment
from app.services.bachs_gateway import BachsGateway, BachsError, resource_id
from app.services.email import queue_email, queue_admin, message, cad
from app.services.email_design import frame, heading, paragraph, reference, details, action
from app.services.mail_delivery import utcnow


def summary(booking):
    deposit_paid = booking.deposit_cents if booking.status in ('confirmed', 'completed') else 0
    deposit_paid = max(0, deposit_paid - (booking.refunded_cents or 0))
    paid = sum(max(0, p.amount_cents - (p.refunded_cents or 0)) for p in booking.balance_payments if p.paid_at)
    total = booking.total_price_cents
    due = max(0, total - deposit_paid - paid) if total is not None else None
    review = bool(booking.refunded_cents or any(p.refunded_cents or p.status in ('needs_review', 'refund_pending', 'refunded') for p in booking.balance_payments))
    status = ('review_required' if review else 'price_unconfirmed' if total is None else
              'paid' if due == 0 and booking.status == 'completed' else
              'due' if booking.balance_requested_at else 'not_requested')
    return {'total_price_cents': total, 'deposit_paid_cents': deposit_paid,
            'balance_paid_cents': paid, 'balance_due_cents': due, 'balance_status': status,
            'service_completed_at': booking.service_completed_at,
            'balance_requested_at': booking.balance_requested_at}


def customer_url(booking):
    return settings.DOMAIN.rstrip('/') + f'/book/confirmation?id={booking.id}&token={customer_token("booking", booking.id)}'


def balance_email(booking, paid=False):
    info = summary(booking)
    title = 'Your service is fully paid' if paid else 'Your remaining service payment'
    content = heading(title) + paragraph('Thank you for choosing Pholar Natural.' if paid else 'Your service is complete. You can now pay the remaining balance securely online.')
    content += reference(f'PN-{str(booking.id)[:8].upper()}', 'Booking reference')
    content += paragraph(booking.service_name_snapshot or booking.service.name)
    content += details([('Original service price', cad(info['total_price_cents'], booking.currency)),
                        ('Deposit paid', cad(info['deposit_paid_cents'], booking.currency)),
                        ('Balance payments received', cad(info['balance_paid_cents'], booking.currency))],
                       total=('Remaining balance', cad(info['balance_due_cents'], booking.currency)))
    content += action(customer_url(booking), 'View your receipt' if paid else 'Pay remaining balance')
    return title, frame(title, content)


def request_balance(db, booking_id, original_total_cents=None):
    transaction_lock(db, 903)
    booking = db.query(Booking).filter_by(id=booking_id).populate_existing().first()
    if not booking:
        raise HTTPException(404, 'Booking not found.')
    if booking.status not in ('confirmed', 'completed') or not booking.payment_charge_id:
        raise HTTPException(409, 'A verified deposit is required before requesting the balance.')
    if settings.PAYMENT_PROVIDER != 'bachs' or booking.payment_provider != 'bachs' or booking.currency != 'USD' or booking.payment_environment != settings.BACHS_ENVIRONMENT:
        raise HTTPException(409, 'This older payment requires manual review before online balance collection.')
    from zoneinfo import ZoneInfo
    if datetime.combine(booking.booking_date, booking.start_time, ZoneInfo(settings.BUSINESS_TIMEZONE)) > utcnow():
        raise HTTPException(409, 'Request the balance after the service has been rendered, not before the appointment.')
    if booking.total_price_cents is None:
        if original_total_cents is None:
            raise HTTPException(409, 'Confirm the original agreed service price for this older booking. Do not use today’s catalogue price.')
        if original_total_cents < booking.deposit_cents or (original_total_cents + 5) // 10 != booking.deposit_cents:
            raise HTTPException(422, 'The original price must match the recorded 10% deposit. Check the original agreement.')
        booking.total_price_cents = original_total_cents
        booking.service_name_snapshot = booking.service.name
    elif original_total_cents is not None and original_total_cents != booking.total_price_cents:
        raise HTTPException(409, 'The original service price is locked for this booking.')
    info = summary(booking)
    if info['balance_status'] == 'review_required':
        raise HTTPException(409, 'A refund or exceptional payment requires review before further collection.')
    if booking.balance_requested_at:
        return booking  # Repeated taps do not duplicate requests or emails.
    booking.service_completed_at = utcnow()
    booking.balance_requested_at = utcnow()
    booking.status = 'completed'
    db.flush()
    queue_email(db, f'booking:{booking.id}:balance_requested', booking.customer_email, *balance_email(booking))
    queue_admin(db, f'booking:{booking.id}:balance_requested', message('Service completed; balance requested', [f'PN-{str(booking.id)[:8].upper()}', f'Remaining: {cad(summary(booking)["balance_due_cents"], booking.currency)}']))
    db.commit()
    db.refresh(booking)
    return booking


def checkout(db, booking_id, gateway=None):
    transaction_lock(db, 903)
    booking = db.query(Booking).filter_by(id=booking_id).populate_existing().first()
    if not booking:
        raise HTTPException(404, 'Booking not found.')
    info = summary(booking)
    if booking.status != 'completed' or not booking.balance_requested_at or info['balance_status'] == 'review_required':
        raise HTTPException(409, 'The studio has not released this balance for payment, or the payment needs review.')
    if not info['balance_due_cents']:
        return {'checkout_url': None, 'fully_paid': True}
    gateway = gateway or BachsGateway()
    if settings.PAYMENT_PROVIDER != 'bachs' or booking.payment_provider != 'bachs' or booking.currency != 'USD' or booking.payment_environment != gateway.environment:
        raise HTTPException(409, 'Payment configuration does not match this booking.')
    attempt = db.query(BookingBalancePayment).filter_by(booking_id=booking.id, status='pending').first()
    if attempt and attempt.payment_checkout_id:
        try:
            state = gateway.request('GET', '/v1/checkout-sessions/' + resource_id(attempt.payment_checkout_id))
        except BachsError:
            raise HTTPException(502, 'Could not check the existing payment. Please retry; do not start another payment.') from None
        if state.get('checkout_id') != attempt.payment_checkout_id:
            raise HTTPException(502, 'The existing payment could not be verified. Please contact us.')
        if state.get('payment_status') == 'succeeded':
            raise HTTPException(409, 'Your payment is being verified. Please refresh shortly; do not pay again.')
        if state.get('status') == 'expired':
            attempt.status = 'expired'
            db.flush()
            attempt = None
        else:
            return {'checkout_url': attempt.payment_checkout_url, 'fully_paid': False}
    if not attempt:
        attempt = BookingBalancePayment(id=uuid4(), booking_id=booking.id, amount_cents=info['balance_due_cents'], currency=booking.currency, payment_provider='bachs', payment_environment=booking.payment_environment, status='pending')
        db.add(attempt)
        db.flush()
    if not attempt.payment_request_payload:
        metadata = {'type': 'booking_balance', 'balance_id': str(attempt.id), 'booking_id': str(booking.id)}
        url = customer_url(booking)
        attempt.payment_request_payload = gateway.checkout_payload(attempt.amount_cents, metadata, booking.customer_email, url + '&balance_return=1', url + '&balance_cancelled=1',
            methods=['USD_CARD', 'NGN_CARD', 'MOMO_GHS', 'MOMO_KES', 'MOMO_TZS', 'MOMO_UGX', 'MOMO_XAF', 'MOMO_XOF', 'MOMO_RWF', 'MOMO_MWK', 'MOMO_ZMW'])
    # Freeze the exact payload and identity before an ambiguous network write.
    db.commit()
    try:
        result = gateway.checkout(attempt.amount_cents, {}, booking.customer_email, '', '', frozen_body=attempt.payment_request_payload)
    except BachsError:
        raise HTTPException(502, 'Payment setup could not be confirmed. Retry here; your payment reference is preserved.') from None
    attempt.payment_checkout_id = result['session_id']
    attempt.payment_checkout_url = result['url']
    db.commit()
    return {'checkout_url': result['url'], 'fully_paid': False}


def confirm(db, attempt):
    transaction_lock(db, 903)
    db.refresh(attempt)
    if attempt.paid_at:
        return
    booking = db.query(Booking).filter_by(id=attempt.booking_id).populate_existing().one()
    db.expire(booking, ['balance_payments'])
    info = summary(booking)
    if booking.status != 'completed' or not booking.balance_requested_at or attempt.amount_cents != info['balance_due_cents']:
        attempt.status = 'needs_review'
        attempt.paid_at = utcnow()  # Money received is always recorded, even in an exceptional case.
        queue_admin(db, f'booking-balance:{attempt.id}:review', message('Service payment needs review', [f'PN-{str(booking.id)[:8].upper()}', 'An additional or unexpected balance payment was verified. Review it in Bachs before further action.']))
        db.commit()
        return
    attempt.status = 'paid'
    attempt.paid_at = utcnow()
    db.flush()
    db.expire(booking, ['balance_payments'])
    content = balance_email(booking, paid=True)
    queue_email(db, f'booking:{booking.id}:balance_paid', booking.customer_email, *content)
    queue_admin(db, f'booking:{booking.id}:balance_paid', content)
    from app.services.whatsapp import notify, NotificationEvent
    notify(NotificationEvent.BOOKING_BALANCE_PAID, f'Service fully paid: PN-{str(booking.id)[:8].upper()}. Balance received: {cad(attempt.amount_cents, booking.currency)}.', db, transactional=True)
    db.commit()
