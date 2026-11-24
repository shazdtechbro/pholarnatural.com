# Collecting the remaining service payment

Payments remain in Bachs sandbox until a separately approved live switch.

1. Open https://pholarnatural.com/admin/bookings and select **List view**.
2. After rendering the service, choose **Complete service & request balance** on the confirmed booking.
3. Check the original service price, verified deposit and remaining amount, then confirm. The customer receives a branded email with a secure payment link. Administrators receive a notification too.
4. The customer can also open their booking from their account and choose **Pay remaining balance**. Guest customers use their secure booking link.
5. After Bachs verifies payment, the booking shows fully paid, and receipts are queued for the customer and administrators. WhatsApp follows the existing booking-notification setting.

## Exact calculation

All calculations use integer cents. Remaining amount = original booked price − verified deposit − verified balance payments. A $99.99 service with a $10.00 deposit leaves $89.99. Changing the catalogue price does not change an existing booking's saved price.

Older bookings without a saved original price require the owner to enter the originally agreed price. It must match the recorded rounded 10% deposit. Historical CAD or other-provider bookings require manual review; they are not silently converted to USD.

## Payment recovery

Browser redirects never mark a booking paid. Signed webhooks and independent provider checks must agree on the reference, amount, currency and booking. Declines leave the deposit intact. A failed network request preserves the payment payload and reference for retry. Repeated owner clicks do not enqueue duplicate requests. Payments already received but awaiting verification cannot be charged again through the normal flow. Unexpected additional payments are recorded and flagged for review.

Completion means the service was rendered; the remaining-payment status separately shows whether the customer has paid. Refund handling is unchanged; exceptional refunds require review before collecting more money.

## Verification

The regression suite includes deposit rounding, original-price snapshots, authorization, legacy-price confirmation, concurrent requests, frozen retry payloads, expired sessions, mismatched and underpaid collections, duplicate and reordered webhooks, and success arriving before checkout identity is persisted. PostgreSQL tests run migrations in isolated schemas. Sandbox provider behavior still depends on Bachs and should be checked using the owner's sandbox checkout before live activation.
