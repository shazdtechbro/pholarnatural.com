# Audit evidence

The JSON files capture this audit's local observations, not production mutation tests.

- `backend-probes.json`: business-rule observations against a temporary schema on
  the disposable local PostgreSQL instance. All payment operations were fake.
- `backend-probes.py`: corresponding reproduction script. It requires the installed
  server dependencies and environment variables. Run from `server` with
  `PYTHONPATH=.`; it connects only to `127.0.0.1:5432/pholar_db`, creates a unique
  `audit_<uuid>` schema, and drops that schema in `finally`. Never retarget it to
  production. It prints observations rather than treating defects as passing tests.
- `browser.json`: local production-server route, cart-persistence and mobile-width
  observations. Admin pages are visited without credentials; redirects do not
  validate authenticated management features.
- `browser-probes.mjs`: reproduction script, requiring `playwright-core` and system
  Chromium at `/usr/bin/chromium`, with the local production server on port 3000.
  Its output goes to `/tmp/pholar-browser-audit.json`. Install the browser driver
  in a temporary location; no application dependency changes are needed.

Production read-only checks: API root/products/services returned 200; admin
unauthenticated dashboard returned 401; requested settings URL returned 404,
actual `/api/v1/admin/settings/public` returned 200. No production responses
containing customer information were stored.

Production build passed. Lint reported 2 errors/3 warnings. Pytest reported 3
setup errors (SQLite JSONB incompatibility), not 3 passing tests. These runner
outputs remain in `/tmp/pholar-audit-{build,lint,tests}.log` on this machine.
