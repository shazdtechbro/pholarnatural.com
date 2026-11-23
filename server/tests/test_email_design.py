from datetime import date, time
from html.parser import HTMLParser
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services.email import message, order_confirmation_email, booking_confirmation_email
from app.services.email_design import action, reference
from app.services.newsletter_mail import _base


class Links(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.links = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.links.append(dict(attrs)['href'])


def test_account_action_remains_intact_inside_branded_email():
    url = 'https://pholarnatural.com/admin/register#invite=abc123&email=person%40example.com'
    title, html = message('Verify your email', ['Hello <script>bad</script>', 'A & B'], action_url=url, action_label='Create account')
    assert title == 'Verify your email'
    assert Links(html).links.count(url) == 2  # Button plus fallback have the identical token.
    assert html.index('Create account') < html.index('Nature’s finest')
    assert '&lt;script&gt;' in html and '<script>' not in html
    assert 'A &amp; B' in html
    assert '/apple-touch-icon.png' in html and 'max-width:600px' in html
    with pytest.raises(ValueError):
        action('javascript:alert(1)', 'Bad link')


def test_newsletter_forms_and_unsubscribe_survive_brand_layout():
    html = _base('Confirm subscription', '<h1>Confirm</h1><form method="post" action="https://api.pholarnatural.com/confirm"><input type="hidden" name="token" value="a&amp;b"><button type="submit">Confirm</button></form><p><a href="https://example.com/?token=a&amp;b">Unsubscribe</a></p>')
    assert 'method="post"' in html and 'value="a&amp;b"' in html
    assert 'background:#334537' in html
    assert 'https://example.com/?token=a&b' in Links(html).links


def test_receipt_preserves_currency_totals_and_escapes_product_data():
    order = SimpleNamespace(id=uuid4(), currency='USD', shipping_address={'city': 'A & B'},
                            items=[SimpleNamespace(product_name='<img src=x onerror=alert(1)>', variant_label='Large', quantity=2, unit_price_cents=1250)],
                            subtotal_cents=2500, discount_cents=100, shipping_cents=500, tax_cents=200, total_cents=3100)
    title, html = order_confirmation_email(order)
    assert title == 'Order payment confirmed'
    assert 'USD $31.00' in html and 'USD $25.00' in html
    assert '&lt;img src=x' in html and '<img src=x' not in html
    assert 'Total paid' in html and 'View your order' in html
    assert any('/order-confirmation?id=' + str(order.id) + '&token=' in url for url in Links(html).links)


def test_booking_has_timezone_deposit_and_usable_confirmation_link():
    booking = SimpleNamespace(id=uuid4(), service=SimpleNamespace(name='Crown care'), booking_date=date(2026, 12, 1), start_time=time(10), end_time=time(11), deposit_cents=1500, currency='USD')
    _, html = booking_confirmation_email(booking)
    assert 'America/Toronto' in html and 'USD $15.00' in html
    assert any('/book/confirmation?id=' + str(booking.id) + '&token=' in url for url in Links(html).links)
    code = reference('PN-ABC12345')
    assert '>PN-ABC12345</span>' in code
    assert 'onclick' not in code and '<script' not in code  # Honest copy fallback in mail clients.
