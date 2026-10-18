# Application flow fixes and security review

18 October 2026. This report describes the local implementation and validation. It is not a claim that the VPS has been inspected, the changes have been deployed, or attacks are impossible. The original feature audit is historical; use this report for the changes implemented afterward.

## Customer and admin behavior

- The homepage, shop, product pages, services, hero counts, footer service links and sitemap read the database API. Static mock products/services no longer drive these surfaces. Existing seed products are ordinary admin-managed records. New active products appear automatically in the homepage and shop; deletion archives the record and removes it from public surfaces while preserving receipts and historical relationships. Inactive drafts remain in admin.
- Featured IDs prioritize display order; they do not hide other active newly added products. Deleted featured IDs are ignored. Hero/featured images, social links (footer and contact), shipping/tax/free-shipping settings and low-stock thresholds share the same public settings contract. The public endpoint is `/api/v1/admin/settings/public`.
- API fetches bypass persistent cache. Shared storefront layouts refresh on focus and every 30 seconds while visible, so an already-open page also picks up catalogue/settings edits. Cart records synchronize with active backend variants and current prices on navigation/focus. Checkout refuses payment while current rates are unavailable, and preserves configured zero values.
- Product image order, SEO title/description and bestseller controls are stored and read by the storefront. Categories come from the catalogue, including newly created categories; sorting includes newest. Service photo, full description and preparation/expectation content are editable and API-backed. Blank images have safe local fallbacks.
- Mobile booking progress fits narrow screens; the services pricing table scrolls within its container; fieldsets/grid children can shrink. Reduced-motion state is hydration-stable. The checkout waits for cart hydration before displaying totals. Admin calendar supports month, week and day views.
- The inactive newsletter form was removed from the shop instead of falsely reporting that a subscription was saved. There is no mailing-list subscription backend.

## Validation and payment integrity

- Order items require positive strict integers (1–100), a nonempty bounded cart, unique variant IDs, active records and available inventory. Names/addresses/metadata are bounded. Numeric product/service/discount fields have limits; percentages cannot exceed 100. Unknown input/settings fields and unsafe URLs are rejected.
- PostgreSQL constraints reject new negative inventory, invalid order totals/items and out-of-hours booking writes. Constraints are introduced `NOT VALID` so historical data can be reviewed before validation, rather than silently rewritten. Existing invalid rows must be investigated separately before `VALIDATE CONSTRAINT`.
- Booking creation and slot discovery use the same validator: Toronto studio time by default, Monday–Saturday, fixed hourly starts 10:00–16:00, future times within 90 days, service duration ending by 17:00, blocked dates and overlap checks. `tzdata` is bundled for slim containers.
- PostgreSQL transaction advisory locks serialize order/discount reservation decisions and appointment decisions across workers. Pending reservations count for 30 minutes; old abandoned holds stop consuming availability. Database row locks protect inventory and order state. Real PostgreSQL concurrency tests cover the last stock unit and conflicting appointment starts.
- Checkout computes prices, discounts, shipping and taxes from server records in CAD, using integer cents and consistent rounding. It never trusts client-supplied totals. The default free-shipping threshold is strictly above CAD $50, configurable in cents.
- Stripe calls use deterministic idempotency keys, bounded network retries/timeouts, and a 30-minute Checkout session expiry. Booking PaymentIntents disable redirect-only methods; the Payment Element supplies its required billing details and a return URL.
- Stripe webhook signatures are verified before business logic; missing verification secrets fail closed. Provider event objects are normalized for the installed SDK. Order/session/booking IDs, CAD currency and expected amounts are verified. Only verified paid events confirm payment. Duplicate success deliveries do not decrement stock or enqueue receipts twice.
- Late payments after cancellation or a conflicting reservation are refunded. Pending refunds are reported as pending, not completed. Inventory is restored only after a successful refund, once. Successful/failed refund events update records and notifications; direct full refunds in Stripe are reconciled. Partial dashboard refunds produce a notification but do not implement a separate net-revenue accounting ledger.
- Payment success pages fetch an authoritative record using a scoped signed confirmation token, poll pending state, show receipt details and clear the cart only after verified payment. Visiting a success URL alone never proves payment. The legacy order confirmation URL shares this implementation. Customer confirmation links work in a new browser tab and in email.
- Customer cancellation requires the booking-specific token. Admin cancellations refund paid deposits even beyond the customer's grace period, consistent with studio-caused cancellations. Customer cancellations within 30 minutes get a full refund; within 24 hours of the appointment outside that grace period forfeit the deposit. The unresolved middle window is explicitly sent for studio review, not assigned a fabricated refund rate.
- Fulfillment transitions are constrained; an unpaid booking cannot be manually marked paid. Paid-order cancellation requests a refund before changing state. Revenue excludes unpaid/expired/cancelled orders and fully refunded orders.

## Transactional emails

A durable `email_deliveries` outbox replaces daemon threads that could lose messages at process exit. Business changes and queue entries commit in the same transaction. Multiple API workers claim queue rows using `FOR UPDATE SKIP LOCKED`. Failures retain the message and retry with bounded backoff; retries use a stable Resend idempotency key. Missing provider credentials retain queued messages. Missing admin recipients retain admin alerts for later configuration.

| Event | Customer | Admin |
|---|---|---|
| Verified order payment | Itemized receipt, address, shipping/tax/discount/total | New paid-order alert |
| Confirmed / processing / shipped / delivered order | Status update | Status alert |
| Order cancellation / pending refund / completed refund | Matching status update | Matching alert |
| Failed payment attempt / asynchronous failure | Retry/help notice | Failure alert |
| Verified booking deposit | Appointment, canonical reference, policy and private manage link | New booking alert |
| Booking cancellation / studio cancellation | Reason and actual refund outcome | Cancellation alert |
| Late conflicting payment | Refund/cancellation explanation | Matching alert |
| Asynchronous refund completion/failure | Outcome or assistance notice | Matching alert |
| Contact submission | Acknowledgment | Message content and customer address |
| Admin account creation / password change | Security notice to the account owner | Account owner |
| Admin email test | Test goes to signed-in admin account | Same test |

Admin alert preferences do not suppress customer transactional receipts, account security notices, or incoming contact messages. Email templates HTML-escape untrusted values. Delivery errors store safe status/type information, not credentials, customer content or provider response bodies. Admin settings show queued/retrying/provider-accepted counts and offer a test action. Provider acceptance is not proof of inbox delivery; domain verification, spam/bounce handling and mailbox verification remain operational checks. Resend idempotency is provider-bounded, so no distributed email system should promise mathematically exact once-only inbox delivery after prolonged ambiguous failures.

## Security controls implemented

| Boundary | Control |
|---|---|
| Admin credentials | Removed plaintext registration logging; one initial administrator; 12-character minimum / bcrypt byte limit; bcrypt hashes; generic authentication failures |
| Sessions | Patched PyJWT, fixed HS256 allowlist, required claims, scoped tokens, 60-minute default admin expiry, database token versions; logout/password changes revoke sessions |
| Customer records | Purpose- and record-specific signed links; custom confirmation header for API access; no unauthenticated order lookup or cancellation by UUID alone |
| Requests | Exact CORS origins, loopback aliases only in local development, bounded request bodies, per-process IP/action rate limits including signed-webhook bursts; no reliance on attacker-supplied forwarding headers |
| API failures | Generic errors and safe conflict responses; no SQL parameters, provider credentials or provider response bodies returned by general handlers |
| SQL / data | ORM-bound values, server-side state/price validation, transactional locks, constraints, archive deletion preserving financial history |
| XSS / browser | React text escaping, JSON-LD `<` escaping, escaped email HTML, image/social URL allowlists, safe local image fallback, CSP without production `unsafe-eval`, frame/object restrictions, nosniff, no-referrer, HSTS and restricted browser permissions |
| Uploads | Authenticated, maximum 5 MB, PNG/JPEG/WebP signature check; re-encoded/size-limited by Cloudinary; no SVG or arbitrary URL uploads |
| Secrets / containers | `.dockerignore` excludes env files, Git metadata and caches; API image runs as a nonroot user, drops capabilities, disallows new privileges, read-only root with temporary storage |
| Exposure | Evolution API compose binding changed to loopback; database has no host-published port in production compose |
| Deployment | Tests gate deployment, serialized deploys, fast-forward-only pull, migrations before API restart, database-aware health probe, only API service is built/restarted; SSH action pinned to a commit and host-key fingerprint required |
| Dependencies | Next.js 16.4.2 and compatible lint config; patched image/transitive packages; removed obsolete/unused JWT/HTTP packages; patched cryptography/urllib3/PyJWT |

The CSP retains inline script/style compatibility for Next.js and Motion; it is not a nonce-based strict CSP. Admin bearer tokens remain in sessionStorage, so preventing XSS is especially important. Application limits are per process, not a distributed bot/DDoS service. Deployments with multiple instances need a trusted edge/shared rate limiter. These limitations are explicitly retained rather than presenting the controls as absolute protection.

## Verification evidence

- Backend regression suite, including new business/security tests and real PostgreSQL migrations/concurrency/constraints: **48 passed** at the documented run. The real PostgreSQL tests create/drop a unique schema only on a local database. Tests against non-loopback databases are refused.
- Production Next.js build and TypeScript: passed in local validation. ESLint: no errors after fixes; final runner logs accompany this work.
- Browser route/mobile audit: 27 public/unauthenticated routes plus 7 authenticated admin screens and day/week navigation, expected custom 404; no browser runtime/hydration errors in the corrected run. At 320px the document fits the viewport, and the services table uses its own scroll container. Decorative content can extend inside clipped containers.
- Browser admin/storefront journey: create a product, view on homepage/shop/category/PDP/admin, custom SEO and inert script-like description, update homepage/social/shipping/tax settings, delete product, verify it disappears from homepage/shop/sitemap: passed with no browser errors. No provider calls were made by this journey.
- Production JavaScript dependency audit: **0 known vulnerabilities**. Python environment audit: **0 known vulnerabilities** after dependency replacement/upgrades. A tracked-file private-key/Stripe-live-key/GitHub-token pattern scan found no matches (a pattern scan is not proof no secrets exist).
- Full JavaScript audit still reports **5 high development-only entries**, all through `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob`/`micromatch` → `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm). No patched upstream braces version is available at review time. Do not process untrusted repositories/glob patterns in privileged lint jobs. The framework was not downgraded or advisories suppressed to manufacture a clean scan.
- A Starlette test-client deprecation warning remains for the supported installed HTTPX compatibility path; tests execute successfully. Production does not use TestClient.

Evidence is stored under `docs/security-evidence/`. Old evidence under `docs/audit-evidence/` describes the initial broken state.

## Deployment and account configuration still required

1. Take and verify a database backup before migrations. Review new `NOT VALID` constraints against historical rows. Apply all migrations through `f6a7b8c9d0e1` before starting the new API. Deploy the backend before the updated storefront; checkout rejects old responses without a confirmation token and only redirects to Stripe HTTPS Checkout. Do not use the local development database or loopback frontend API URL for production.
2. Keep a strong, persistent `SECRET_KEY` (at least 32 random bytes) and registration key; changing the signing key invalidates links/sessions. Set `DOMAIN` to the real HTTPS frontend. Add exact production frontend origins (including www if used) to `CORS_ORIGINS`. `BUSINESS_TIMEZONE` defaults to America/Toronto.
3. Securely configure Stripe secret/publishable keys and the correct endpoint-specific webhook secret. Webhook URL: **`https://api.pholarnatural.com/api/v1/webhooks/payments/`**. Subscribe to `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `refund.created`, `refund.updated`, `refund.failed`, and `charge.refunded`.
4. Securely configure `RESEND_API_KEY`, a verified sender in `DEFAULT_FROM_EMAIL`, and comma-separated `ADMIN_EMAIL` recipients. Keep `EMAIL_WORKER_ENABLED=true` (default). Send the admin test email and verify an actual mailbox, then verify receipts, cancellation and refund messages. Inspect queued/retrying counts; do not assume absence of an HTTP error proves inbox delivery.
5. Configure Cloudinary credentials and the Evolution API session if those integrations are required, then verify real uploads and WhatsApp delivery. No live upload, QR pairing or notification was attempted here.
6. Set GitHub Actions secret **`VPS_SSH_FINGERPRINT`** from a trusted VPS console (for example, the SHA256 fingerprint from `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`). Deployment intentionally refuses a missing fingerprint. Existing VPS host/user/key/port secrets are preserved.
7. Verify HTTPS/reverse-proxy configuration, SSH key-only access/rotation of the previously disclosed root password, firewall rules, actual open ports, non-superuser database credentials, encrypted/restricted backups, backup restoration, monitoring and resource limits on the VPS. The compose hardening only takes effect when applied; changing source does not close a currently deployed port. Redact confirmation-link query tokens from proxy/access logs and restrict log access. Consider MFA or a trusted access gateway for administration. The Anything folder and unrelated VPS applications were not accessed or changed.
8. Run Stripe test-mode checkout, deposit, retry, abandoned hold, duplicate webhook, full refund and failed-refund scenarios against the deployed environment before switching to live keys. Test payment methods explicitly: this implementation supports card Checkout and non-redirect Payment Element methods. A key change alone is not a substitute for that integration verification.

Reusable installation/start instructions were updated in the cloud environment draft; this does not publish or deploy them. Review/save and publish that draft in environment settings when ready.

Existing admin sessions must sign in again after the scoped-token update. For historical paid orders without a saved PaymentIntent, reconcile/replay the verified Stripe event before attempting an admin refund. Rotate any application credentials exposed by prior registration logging, and the root password disclosed in chat.

No live Stripe payment, refund, email, VPS deployment or external security scan was performed. Safari/iOS/Android device testing, a full accessibility assessment, Core Web Vitals under real network conditions and an independent penetration test remain outside the evidence collected here. Optional offline/PWA features, per-date manual slot overrides and a mailing-list backend remain separate product work; this report does not declare every original PRD item shipped.
