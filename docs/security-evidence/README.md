# Verification evidence

These are local validation results, not production transaction records.

- Backend: from `server`, run `python -m pytest -p no:cacheprovider`. Set
  `TEST_POSTGRES_URL` to a disposable loopback PostgreSQL database to include
  migration, constraint and concurrency checks; those tests create and drop a
  unique temporary schema. Non-loopback targets are rejected. Current result:
  48 passed with PostgreSQL enabled; without it 2 checks are explicitly skipped.
- Frontend: `npm run lint`, `npx next typegen && npx tsc --noEmit`, `npm run build`.
  Production build and browser checks used the loopback development API.
- Dependency snapshots: `npm audit --omit=dev --json`, `npm audit --json` and
  pip-audit against the installed requirements. Full npm audit includes the
  development-only braces advisory; do not interpret the runtime-only result
  as a clean development dependency scan.
- Browser JSON records route responses, 320px document widths, persistent cart,
  authenticated admin screens/calendar views, and an actual local admin product
  create/settings/delete journey. Playwright drove system Chromium. Temporary
  accounts/data were cleaned and original local settings restored. Tokens and
  passwords are not stored here. The email provider and Stripe were not contacted.
- Test warning: Starlette's supported HTTPX compatibility path emits a
  deprecation warning. It does not skip or disable the tests.

See `../SECURITY-AND-FLOW-REVIEW.md` for exact boundaries and deployment steps.
