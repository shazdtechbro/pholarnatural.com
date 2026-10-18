> Historical audit before the fixes in this working tree. See [current flow and security review](SECURITY-AND-FLOW-REVIEW.md) for implemented fixes and current verification.

# Feature completion audit

Date: 18 October 2026. Reviewed commit: `2032063` on the local `work` branch.
Scope: `IMPLEMENTATION-DOC.md`, the revised seven-service list in `CLAUDE.md`, frontend routes/components/API clients, backend routes/services/models, deployment workflow, production build, automated checks, local behavioral probes, and read-only public production API requests.

**Verdict: the application is not feature-complete.** Screens and API implementations exist for most major areas, but essential customer and admin workflows have confirmed defects. A working page or endpoint is not proof that its full business workflow works.

No production writes, payments, refunds, messages, uploads, or VPS changes were performed. Local mutation probes used a separate temporary PostgreSQL schema, fake payment gateway, and dependency overrides; the schema was dropped afterward. Application code was not changed during this audit.

## Checks

- Production build: PASS, including TypeScript and page generation, using the local API and bundled fonts.
- ESLint: FAIL, 2 errors and 3 warnings. Errors: synchronous effect-triggered state update in admin products; empty interface in `BookingFlow.tsx`.
- Existing pytest suite: 3 setup ERRORS, no tests pass. SQLite fixtures cannot compile `orders.shipping_address` JSONB. The test database must support the models; critical payment/admin paths have no existing coverage.
- Public production API: root, products and services return HTTP 200. Products count: 2. Active services count: 5. The documented revised catalogue has 7 services; reconcile deployed content with client-approved requirements rather than assuming seed data is authoritative.
- Public production admin dashboard without authentication: HTTP 401, as expected.
- Public production `/api/v1/settings/public`: HTTP 404. Actual public settings endpoint `/api/v1/admin/settings/public`: HTTP 200.
- Local business-rule probes reproduced the defects below. Payment provider behavior was simulated, not verified against Stripe. A fake provider accepting invalid totals does not establish Stripe would accept them.
- Chromium production-browser audit: 27 route requests checked (26 HTTP 200, custom missing page HTTP 404). Unauthenticated admin visits exercise login redirects, not authenticated features. Homepage add-to-cart stored `var_oil_30`, then the cart became empty after reload. At 320px, document widths were 324px on home, 494px on services and 361px on checkout. Four React #418 hydration errors were observed on home/about across the run, including a fresh server restart; root cause remains to be diagnosed. Detailed results: `docs/audit-evidence/browser.json`.

## Feature coverage

| Area | Implemented evidence | Completion status / remaining work |
|---|---|---|
| Global navigation, footer, cookie preferences, toasts, 404 | Components and routes exist; consent stores preferences; skip link and reduced-motion handling exist | Partial: footer settings URL is wrong; accessibility/device sign-off still needed |
| Homepage | Hero, product/service cards, story, testimonials and CTAs exist | Incomplete: product/service sections use static mock data; content settings are disconnected |
| Shop | API-backed catalogue, search, category filter, price/name sorting and empty state | Partial: newest sorting missing; categories fixed; error-as-empty behavior; larger catalogue pagination absent (P2) |
| Product detail | API data, gallery, variants, stock display, cart action, metadata and JSON-LD | Partial: zero-image product metadata can throw; cloud image structured-data URLs are malformed |
| Services | API-backed list, pricing, booking links, structured data | Partial: long descriptions/preparation fields are discarded by the adapter; live catalogue differs from revised scope |
| Booking | Service/date/time/customer steps, slot fetch, Payment Element, confirmation and public cancellation | Incomplete: closing-time validation, reservation expiry/concurrency, payment details, stable reference, cancellation ownership and policy gaps |
| Cart | localStorage, cross-tab sync, quantity adjustment, totals, empty state | Incomplete: homepage mock variant IDs do not persist; checkout clears cart before payment |
| Checkout | Guest address/email, discount validation, shipping/tax calculation, hosted Stripe Checkout | Incomplete: settings fetch fails, free-shipping promise not implemented, input/inventory validation and verified confirmation missing |
| Order confirmation | A full-details legacy page and a separate Stripe success page exist | Incomplete: actual Stripe success page does not verify payment or show purchased items/address/totals; legacy full-details page has no active writer |
| About / FAQ / policies | Routes, content, FAQ search/accordion, metadata exist | Partial: business contact placeholders and cancellation/shipping content need reconciliation and client sign-off |
| Contact | Form validation, persisted backend message, WhatsApp notification path | Incomplete: required email delivery not implemented |
| Admin authentication | JWT login, API protection, registration key, logout/client gate | Incomplete: registration prints password/key; password constraints missing server-side; single-admin restriction not enforced |
| Admin dashboard | API stats, recent orders, upcoming bookings | Defect: unpaid pending orders count toward revenue |
| Product/variant admin | API-backed create/edit/delete, stock and image upload/delete | Partial: no image reorder, SEO fields or persistent bestseller control |
| Service admin | API CRUD, image upload, future-booking deletion protection | Implemented in code; authenticated end-to-end and live upload behavior unverified |
| Booking admin | Month calendar, list, confirm/cancel, block/unblock dates | Incomplete: admin cancellation does not refund; confirm/cancel emails absent; week/day views and per-date slot override absent |
| Order admin | List/detail/status UI and protected API | Defects: arbitrary status transitions accepted; tax omitted by response serializer |
| Discount admin | Protected CRUD, code/minimum/expiry/use checks and checkout application | Partial: concurrent usage-limit enforcement lacks reservation/locking; real Stripe application unverified |
| Settings | Shipping/tax, social links, homepage image/featured IDs, WhatsApp QR/status/toggles/test | Partial: storefront does not consume homepage settings; bad public URL; email toggle/test missing |
| Email | Resend templates, order/booking webhook confirmations, order status notifications | Partial: contact and booking state-change emails missing; delivery/retries unverified |
| WhatsApp | Evolution API connection, per-event settings, notifier and test code | Implemented integration path; no live QR/session/delivery verification; differs from original Twilio/Cloud API proposal |
| SEO / performance | Local WOFF2 fonts, optimized images, metadata, product/service/business JSON-LD, sitemap | Partial: static sitemap catalogue, malformed cloud image schema, checkout success not noindexed; CWV and device/browser budgets unmeasured |
| Deployment | `main` pushes affecting `server/**` run SSH pull, compose build/up, Alembic | Present; no checks/health gate before deployment; VPS state, backups and deployment success not inspected |

## Confirmed defects and missing functionality

### Fix before launch

1. **Homepage cart uses invalid backend identifiers.** `components/Products.tsx` imports `getProducts` from `lib/data.ts`, which returns static `var_*` identifiers. `context/CartContext.tsx` discards non-UUID variant IDs on reload, and backend order requests require UUIDs. Homepage cart items disappear on reload and cannot create a valid backend order. `components/Services.tsx` similarly uses the static catalogue. Use the API-backed catalogue consistently.
2. **Registration logs credentials.** `server/app/api/routes/admin_auth.py:81` prints the Pydantic input containing plaintext password and registration key. Remove the log; investigate exposure in deployment logs through authorized administration. Do not dump those logs into chat.
3. **Public cancellation has no ownership verification.** POST `/api/v1/bookings/{booking_id}/cancel` requires only the booking UUID and a reason. Local HTTP probe cancelled a confirmed booking without authentication/token. Require a scoped cancellation token or equivalent customer verification.
4. **Order input validation is incomplete.** `server/app/schemas/order.py` accepts negative quantities and an empty item list. Local active checkout-service probes produced subtotal -6000 for quantity -1, and a shipping-only order for an empty cart. Reject nonpositive/noninteger quantities, empty carts, and duplicate variant overcommit before calling Stripe.
5. **Bookings can run past closing.** Slot discovery rejects a three-hour service at 16:00, but the creation path accepts it and records end time 19:00. `check_availability` lacks the closing-time validation in slot discovery. Apply one authoritative validator, studio timezone, and same-day past-slot checks to both operations.
6. **Admin cancellations skip refunds and emails.** `admin_bookings.py` calls `cancel_booking` without a gateway. Local HTTP probe returned 200 with zero refund calls. Manual confirmation also updates status without customer email. Wire refund/notification behavior to explicit business rules and payment state.
7. **Payment success is asserted without verification.** `/checkout/success` renders “Payment confirmed” even without a session ID; it does not fetch authoritative order/payment state. It also does not show the required order details. Stripe's webhook must remain authoritative; add safe customer confirmation lookup and pending/failed handling.
8. **Cart is cleared before payment.** Checkout calls `clear()` before redirecting to Stripe; cancel redirects to `/cart`. A customer abandoning payment loses the cart. Preserve it until verified payment completion and handle repeated/failed redirects.
9. **Stock and booking reservations are not robust.** Stock is checked at checkout creation and decremented only after payment, without reservation. Two local pending orders were accepted for one stock unit. Pending bookings have no expiry and indefinitely block slots when customers abandon payment. Overlap checks have no database exclusion constraint/serialization, so concurrency can double-book. Add transactional reservations/expiry and concurrency checks, including discount limits.
10. **Settings URL mismatch is live.** Checkout and Footer request `/api/v1/settings/public`, but router registration exposes `/api/v1/admin/settings/public`. Live and local responses are 404 vs 200. Checkout silently falls back to defaults, footer hides configured social links. Defaults also use `value || default`, so configured zero tax/shipping values are discarded.
11. **Free-shipping promise is not enforced.** Requirements and displayed copy promise free shipping over CAD $50. Active checkout charges a fixed regional rate regardless of subtotal. Local CAD $60 order charged CAD $9.95 domestic shipping. Reconcile client-approved policy and calculate it consistently on the server and UI.
12. **Contact email is missing.** Contact route persists the message and invokes WhatsApp, but never emails the client. No admin message inbox replaces this requirement. Implement actual delivery and honest success/error behavior.
13. **Booking payment form has incomplete billing setup.** `PaymentElement` suppresses billing email collection (`email: 'never'`) while `stripe.confirmPayment` supplies neither `confirmParams.payment_method_data.billing_details.email` nor a return URL for redirect methods. Verify against the configured Stripe payment methods; complete the integration before declaring deposit payments functional.

### Required completion / correctness work

14. **Cancellation policy differs between UI and backend.** Backend unconditionally forfeits deposit after 30 minutes, even when appointment is more than 24 hours away. Requirements explicitly leave this middle window unresolved; the frontend configuration keeps it null. Get the policy decision and implement it consistently; do not invent a percentage.
15. **Booking references disagree.** Customer confirmation generates a clock-based `PN-B-*` reference; backend/admin/email use UUID-derived `PN-*`. Fetch and display the canonical backend reference and status. Confirmation currently relies on same-tab sessionStorage, so it cannot support email links/new devices.
16. **Revenue includes unpaid orders.** `system_service.py` sums every order whose status is not cancelled, including pending/unpaid sessions. Restrict revenue to explicitly paid states, with refund accounting as appropriate.
17. **Admin order details lose tax.** `AdminOrderResponse._from_orm` omits `tax_cents`, yielding default 0. Local probe: stored tax 909, serialized tax 0.
18. **Order status changes are unconstrained.** The schema accepts arbitrary strings and service assigns them directly. Local HTTP probe stored `invented_status`. Enforce enum and legal transitions, keeping payment and fulfillment state separate.
19. **Homepage admin settings have no consumer.** Featured product/service IDs and hero/featured images are saved, but Hero/Products/Services do not read them. Saving these controls cannot update the displayed homepage.
20. **Required admin controls missing.** Product image reorder, product SEO fields, persistent bestseller flag, booking week/day views, manual slot overrides, admin email toggle and test email do not have complete UI/API implementations.
21. **Service detail fields are missing.** API adapter explicitly sets `long_description: ''` and `what_to_expect: []`; backend models do not store them. Complete the service detail/preparation content rather than presenting empty accordions.
22. **Failure states are swallowed.** Shop/services/book server pages catch API errors into empty arrays. Unreachable data appears as an empty catalogue rather than a recoverable error. PDP similarly treats API failures as 404s.
23. **SEO catalogue and image handling gaps.** Sitemap uses static `lib/data.ts` product slugs, omitting future admin-created products. Product JSON-LD blindly prefixes SITE_URL to image URLs, corrupting absolute Cloudinary URLs. Metadata assumes `product.images[0]` exists. `/checkout/success` lacks its own noindex metadata and inherits the homepage canonical.
24. **Newsletter is a local simulation.** It waits 500ms, clears the email, and shows a toast; no subscriber is stored or sent. This is an additional UI promise, not a completed subscription feature.
25. **API validation/auth hardening remains.** Registration accepts any password string and additional admins with the same registration key despite the single-admin requirement. Product/service/discount fields also lack meaningful numeric constraints. Login has no implemented throttling. Verify required boundaries and abuse controls before launch.
26. **Mobile and hydration defects remain.** Browser probes found horizontal overflow at 320px on home, services and checkout, and four React #418 hydration errors. Diagnose and fix before responsive sign-off.
27. **Frontend polish requirements remain unverified or absent.** Newest sorting, scroll-to-top button and fully-booked-day disabling are absent from the inspected implementations. Offline banner and catalogue pagination are optional P2 work. Real iOS/Safari/Firefox/Edge, keyboard/screen-reader, contrast and Core Web Vitals need dedicated validation.

## Integration and deployment limits

Public GETs demonstrate that the deployed API answers and its catalogue is readable; they do not prove the inspected local SHA is deployed. No SSH inspection was possible. No production admin credentials, Stripe test-mode setup, test mailbox, authorized upload, WhatsApp session, database restore, or browser/device matrix was available for live end-to-end verification. Do not call those integrations complete from source inspection alone.

The local build used `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`; production must use the public HTTPS API URL. This local setting must not be published as the deployed frontend URL.

The workflow `.github/workflows/deploy-backend.yml` deploys server changes directly without a test/build/health prerequisite. Font-only changes did not trigger backend deployment. Add automated checks and post-deploy health verification before treating the pipeline as a release gate. Confirm backups/restoration and migration rollback independently.

## Recommended order

1. Fix credential logging, cancellation ownership and backend input validation.
2. Unify API-backed homepage/catalogue/settings and repair cart/payment confirmation paths.
3. Make booking and inventory reservations transactional; finish refunds and notification delivery.
4. Complete remaining admin controls and content/SEO wiring.
5. Repair and expand automated coverage, then validate Stripe test checkout/deposit/webhooks/refunds, email, uploads, WhatsApp and mobile/accessibility behavior before release.

This audit identifies concrete blockers; it does not claim that every possible defect has been discovered or that missing features have been implemented.
