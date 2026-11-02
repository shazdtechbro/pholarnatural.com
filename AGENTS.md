<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


## Pholar engineering standards

- Payments remain in sandbox until the owner explicitly approves a live switch. Keep keys server-side and validate provider, key prefix, environment and currency together.
- Treat browser returns as navigation only. Fulfil only after signed, replay-protected webhooks and independent server verification of purchase reference, amount, currency and provider state.
- Preserve exact idempotent write payloads and stable request keys through uncertain provider failures. Never blindly retry a charge or refund with a new reference.
- Use integer minor units and explicit currencies. Calculate prices, shipping, tax, deposits and discounts on the server; retain historical purchase currency.
- Authorize every protected API operation on the server. Use expiring single-use hashed account tokens, strong password hashing, session revocation, reauthentication for sensitive admin changes and rate limits.
- Persist operational email and payment jobs. Enqueue core payment WhatsApp jobs in the same transaction as business changes. Retry transient failures with backoff; surface terminal failures for review. Do not promise exactly-once delivery when a provider lacks idempotency.
- Do not log credentials, account links, card data, message bodies or private customer data. Use request references and structured, privacy-conscious audit records.
- Preserve customer cart data through declines, cancellations, offline operation and refresh. Clear purchased units only after a verified payment.
- Test meaningful failure and concurrency cases, including declines, insufficient funds, underpayment, network ambiguity, duplicate and reordered webhooks, expired links, unauthorized access, refunds, and inventory or booking conflicts.
- Back up before schema changes, test migrations with PostgreSQL, run appropriate regression checks and dependency audits, verify readiness after deployment, and keep handover documentation accurate.
- Report limitations and external provider delays honestly. Never describe an audit as proof that all attacks or all failures are impossible.
