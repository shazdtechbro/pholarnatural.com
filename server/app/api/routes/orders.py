from uuid import UUID
from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from app.api.dependencies import get_db, get_payment_gateway
from app.schemas.order import OrderCreate, OrderCheckoutResponse, AdminOrderResponse
from app.services import order_service
from app.core.security import customer_token, verify_customer_token

router = APIRouter()


@router.post("/", response_model=OrderCheckoutResponse, status_code=201)
def create_order(
    order_in: OrderCreate,
    db: Session = Depends(get_db),
    payment_gateway=Depends(get_payment_gateway),
):
    order, url = order_service.create_order_checkout(db, order_in, payment_gateway)
    return OrderCheckoutResponse(
        order_id=order.id,
        checkout_url=url,
        confirmation_token=customer_token("order", order.id),
        total_cents=order.total_cents,
        status=order.status,
    )


@router.get("/{order_id}", response_model=AdminOrderResponse)
def order_confirmation(
    order_id: UUID,
    x_confirmation_token: str = Header(...),
    db: Session = Depends(get_db),
):
    verify_customer_token(x_confirmation_token, "order", order_id)
    return order_service.get_order_detail(db, order_id)
