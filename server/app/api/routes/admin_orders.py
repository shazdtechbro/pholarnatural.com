from uuid import UUID
from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, get_current_admin, get_payment_gateway
from app.models.admin import AdminUser
from app.schemas.order import AdminOrderResponse, OrderStatusUpdate
from app.services import order_service

router = APIRouter()


@router.get("/", response_model=List[AdminOrderResponse])
def list_orders(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """List all orders, optionally filtered by status (Admin only)."""
    return order_service.get_orders(db, status)


@router.get("/{order_id}", response_model=AdminOrderResponse)
def get_order_detail(
    order_id: UUID,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Get full details of a specific order."""
    return order_service.get_order_detail(db, order_id)


@router.put("/{order_id}/status")
def update_order_status(
    order_id: UUID,
    status_in: OrderStatusUpdate,
    payment_gateway=Depends(get_payment_gateway),
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Advance an order through the fulfilment pipeline."""
    order = order_service.update_order_status(db, order_id, status_in, payment_gateway)
    return {"ok": True, "status": order.status}
