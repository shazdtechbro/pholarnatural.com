"""Create sample USD inventory only in the explicitly isolated Bachs sandbox."""
from app.core.config import settings
from app.db.database import SessionLocal
from app.models.product import Product, ProductVariant, ProductImage
from app.models.service import Service
from app.models.order import Discount
from app.models.system import AdminSetting


def main():
    if not settings.PAYMENT_SANDBOX_INSTANCE or settings.PAYMENT_PROVIDER != "bachs" or settings.BACHS_ENVIRONMENT != "sandbox" or not settings.DATABASE_URL.split('?')[0].endswith('/pholar_sandbox'):
        raise RuntimeError("Sample seed is restricted to the isolated pholar_sandbox database.")
    with SessionLocal() as db:
        if not db.query(Product).filter_by(slug="sandbox-hair-oil").first():
            oil = Product(name="Sample Hair Oil (sandbox)", slug="sandbox-hair-oil", category="Hair Oil", description="Sample product for simulated payments only.", tagline="Not a live listing")
            oil.variants = [ProductVariant(weight_label="100ml", price_cents=1200, stock_count=100, is_active=True), ProductVariant(weight_label="200ml", price_cents=2000, stock_count=100, is_active=True)]
            oil.images = [ProductImage(url="/images/products/restorative-hair-oil.webp", alt="Sample oil", sort_order=0)]
            db.add(oil)
        if not db.query(Service).filter_by(slug="sandbox-consultation").first():
            db.add(Service(name="Sample consultation (sandbox)", slug="sandbox-consultation", description="Not a real appointment", duration_minutes=30, price_cents=5000, image_url="", is_active=True))
        if not db.query(Discount).filter_by(code="SANDBOX10").first():
            db.add(Discount(code="SANDBOX10", discount_type="percentage", value=10, used_count=0, is_active=True))
        for key, value in {"shipping_rate_domestic_cents": "200", "shipping_rate_us_cents": "300", "shipping_rate_uk_cents": "400", "shipping_rate_international_cents": "500", "tax_rate_percent": "13", "free_shipping_threshold_cents": "10000"}.items():
            if not db.query(AdminSetting).filter_by(key=key).first():
                db.add(AdminSetting(key=key, value=value))
        db.commit()
    print("Isolated sandbox catalog ready: sample USD prices, test stock and test appointments.")


if __name__ == "__main__":
    main()
