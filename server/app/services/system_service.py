from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.booking import Booking
from app.models.order import Order


def get_dashboard_stats(db: Session) -> dict:
    today = date.today()
    tomorrow = today + timedelta(days=1)

    orders_today: int = (
        db.query(func.count(Order.id))
        .filter(func.date(Order.created_at) == today)
        .scalar()
        or 0
    )

    revenue_today_cents: int = (
        db.query(func.sum(Order.total_cents))
        .filter(
            func.date(Order.created_at) == today,
            Order.status.in_(
                ["paid", "confirmed", "processing", "shipped", "delivered"]
            ),
        )
        .scalar()
        or 0
    )

    revenue_total_cents: int = (
        db.query(func.sum(Order.total_cents))
        .filter(
            Order.status.in_(
                ["paid", "confirmed", "processing", "shipped", "delivered"]
            )
        )
        .scalar()
        or 0
    )

    bookings_today: int = (
        db.query(func.count(Booking.id)).filter(Booking.booking_date == today).scalar()
        or 0
    )

    recent_orders_raw = (
        db.query(Order).order_by(Order.created_at.desc()).limit(10).all()
    )
    recent_orders = [
        {
            "id": str(o.id),
            "order_number": f"PN-{str(o.id)[:8].upper()}",
            "customer_name": o.customer_name,
            "total_cents": o.total_cents,
            "status": o.status,
            "created_at": o.created_at.isoformat() if o.created_at else "",
        }
        for o in recent_orders_raw
    ]

    upcoming_raw = (
        db.query(Booking)
        .options(joinedload(Booking.service))
        .filter(
            Booking.booking_date.in_([today, tomorrow]),
            Booking.status.in_(["pending", "confirmed"]),
        )
        .order_by(Booking.booking_date, Booking.start_time)
        .all()
    )
    upcoming_bookings = [
        {
            "id": str(b.id),
            "customer_name": b.customer_name,
            "service_id": str(b.service_id),
            "service_name": b.service.name if b.service else "—",
            "booking_date": b.booking_date.isoformat(),
            "start_time": b.start_time.strftime("%H:%M"),
            "status": b.status,
        }
        for b in upcoming_raw
    ]

    return {
        "orders_today": orders_today,
        "revenue_today_cents": revenue_today_cents,
        "revenue_total_cents": revenue_total_cents,
        "bookings_today": bookings_today,
        "recent_orders": recent_orders,
        "upcoming_bookings": upcoming_bookings,
    }
