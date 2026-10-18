import json,uuid
from datetime import date,time,timedelta,datetime,timezone
from sqlalchemy import create_engine,text
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from app.main import app
from app.api.dependencies import get_db,get_current_admin,get_payment_gateway
from app.db.database import Base
from app.models import *
from app.models.service import Service
from app.models.product import Product,ProductVariant
from app.models.booking import Booking
from app.schemas.booking import BookingCreate
from app.schemas.order import OrderCreate,AdminOrderResponse
from app.services import booking_service,order_service
schema='audit_'+uuid.uuid4().hex
root=create_engine('postgresql://pholar@127.0.0.1:5432/pholar_db')
with root.begin() as c:c.execute(text('CREATE SCHEMA '+schema))
engine=create_engine('postgresql://pholar@127.0.0.1:5432/pholar_db',connect_args={'options':'-csearch_path='+schema})
class Gateway:
 def __init__(self):self.n=0;self.refunds=[]
 def create_checkout_session(self,**kw):self.n+=1;return {'session_id':'audit_session_'+str(self.n),'url':'https://example.test/checkout'}
 def create_payment_intent(self,**kw):self.n+=1;return {'payment_intent_id':'audit_pi_'+str(self.n),'client_secret':'not-a-real-key'}
 def create_refund(self,pi):self.refunds.append(pi)
gateway=Gateway(); results=[]
def record(name,value):results.append({'probe':name,'observed':value});print(name, json.dumps(value,default=str))
try:
 Base.metadata.create_all(engine)
 db=sessionmaker(bind=engine)()
 svc=Service(name='Audit Service',slug='audit-service',duration_minutes=180,price_cents=12000,is_active=True)
 product=Product(name='Audit Oil',slug='audit-oil',category='Hair Oil',description='Audit',is_active=True)
 db.add_all([svc,product]);db.flush()
 variant=ProductVariant(product_id=product.id,weight_label='100ml',weight_grams=100,price_cents=6000,stock_count=1,is_active=True,sku='AUDIT')
 db.add(variant);db.commit()
 future=date.today()+timedelta(days=1)
 while future.weekday()==6:future+=timedelta(days=1)
 slots=booking_service.get_available_slots(db,future,svc.id)
 record('180-min service at 16:00 advertised unavailable',next(s for s in slots if s['time']=='16:00'))
 booking,secret=booking_service.create_booking_with_payment_intent(db,BookingCreate(service_id=svc.id,customer_name='Audit',customer_email='audit@example.com',booking_date=future,start_time=time(16)),gateway)
 record('Same 16:00 booking accepted by creation',{'end_time':str(booking.end_time),'status':booking.status})
 address=dict(full_name='Audit',address_line1='Test',city='Toronto',province='ON',postal_code='M5V1A1',country='Canada')
 def order(items):return order_service.create_order_checkout(db,OrderCreate(customer_name='Audit',customer_email='audit@example.com',shipping_address=address,items=items),gateway)[0]
 o=order([dict(variant_id=variant.id,quantity=1)])
 record('Shipping on CAD 60 subtotal',{'subtotal':o.subtotal_cents,'shipping':o.shipping_cents,'tax':o.tax_cents})
 record('Admin response tax field',{'stored':o.tax_cents,'serialized':AdminOrderResponse.model_validate(o).tax_cents})
 second=order([dict(variant_id=variant.id,quantity=1)])
 record('Two pending orders for single stock unit accepted',{'first':str(o.id),'second':str(second.id),'stock':variant.stock_count})
 neg=order([dict(variant_id=variant.id,quantity=-1)])
 record('Negative quantity accepted',{'subtotal':neg.subtotal_cents,'total':neg.total_cents})
 empty=order([])
 record('Empty order accepted',{'subtotal':empty.subtotal_cents,'total':empty.total_cents})
 app.dependency_overrides[get_db]=lambda:db
 app.dependency_overrides[get_current_admin]=lambda:object()
 app.dependency_overrides[get_payment_gateway]=lambda:gateway
 with TestClient(app) as client:
  record('Checkout settings URL',{'requested':client.get('/api/v1/settings/public').status_code,'actual':client.get('/api/v1/admin/settings/public').status_code})
  r=client.put(f'/api/v1/admin/bookings/{booking.id}/cancel',json={'cancellation_reason':'Audit'})
  record('Admin cancellation skips refund',{'status':r.status_code,'gateway_refunds':len(gateway.refunds)})
  another=Booking(service_id=svc.id,customer_name='Audit',customer_email='audit@example.com',booking_date=future+timedelta(days=2),start_time=time(10),end_time=time(11),status='confirmed',deposit_cents=1000,created_at=datetime.now(timezone.utc)-timedelta(hours=1))
  db.add(another);db.commit()
  r=client.post(f'/api/v1/bookings/{another.id}/cancel',json={'cancellation_reason':'Audit without token'})
  record('Public cancellation without ownership check',{'status':r.status_code,'booking_status':r.json().get('status')})
  r=client.put(f'/api/v1/admin/orders/{o.id}/status',json={'status':'invented_status'})
  record('Arbitrary order status accepted',{'status':r.status_code,'stored':db.get(type(o),o.id).status})
finally:
 app.dependency_overrides.clear()
 if 'db' in locals():db.close()
 engine.dispose()
 with root.begin() as c:c.execute(text('DROP SCHEMA '+schema+' CASCADE'))
 root.dispose()
 open('/tmp/pholar-audit-probes.json','w').write(json.dumps(results,indent=2,default=str))
