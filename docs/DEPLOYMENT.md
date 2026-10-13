# Deployment & operations

## Build artefacts

- `npm run build` → `apps/api/dist/index.js` (single ESM bundle; the shared package is inlined) and
  `apps/web/dist/` (static files).
- Run the API with `NODE_ENV=production node --env-file=.env apps/api/dist/index.js` (or inject env vars).
- Serve `apps/web/dist` from a static host/CDN **on the same site** as the API, with a reverse proxy routing
  `/api` and `/uploads` to the API. The session cookie is `SameSite=Lax`; a different registrable domain would
  need `SameSite=None; Secure` plus CORS changes (not configured by default).
- SPA fallback: unknown paths must serve `index.html`.

## Environment variables (API)

Validated at startup by `apps/api/src/config/env.ts`; the process exits with a readable list of problems.

| Variable                                                                                          | Default                            | Notes                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                        | `development`                      | `production` enables secure cookies and placeholder-secret checks.                                                    |
| `PORT`                                                                                            | `4000`                             |                                                                                                                       |
| `MONGODB_URI`                                                                                     | — (required)                       | Must be a replica set / Atlas cluster for transactions.                                                               |
| `JWT_SECRET`                                                                                      | — (required)                       | ≥ 32 chars; placeholder values are rejected in production. Rotate to sign everyone out.                               |
| `CORS_ORIGINS`                                                                                    | `http://localhost:5173`            | Comma-separated allowlist; `*` rejected in production.                                                                |
| `SESSION_TTL_HOURS`                                                                               | `168`                              |                                                                                                                       |
| `COOKIE_SECURE`                                                                                   | prod: `true`                       |                                                                                                                       |
| `DEMO_DIAL_CODE`                                                                                  | `12908`                            | The single place the demo dial code is defined.                                                                       |
| `EXTRA_DEMO_ROUTES`                                                                               | empty                              | `code:RYTHUBAZAAR_DEMO_IVR,…` to add internal demo numbers.                                                           |
| `TELEPHONY_MODE` / `AI_INTERPRETER` / `PAYMENT_MODE` / `PAYOUT_PROVIDER`                          | `demo` / `rules` / `demo` / `mock` | Only demo/mock implementations exist; other values fail validation.                                                   |
| `DELIVERY_FEE_PAISE`, `FREE_DELIVERY_THRESHOLD_PAISE`, `SERVICE_FEE_BPS`, `SERVICE_FEE_CAP_PAISE` | 3000, 50000, 200, 2000             | Customer-paid fees per shipment. Farmer commission is fixed at zero.                                                  |
| `RETURN_WINDOW_HOURS`                                                                             | `48`                               |                                                                                                                       |
| `RATE_LIMIT_ENABLED`                                                                              | `true`                             | Behind a proxy, `trust proxy` is set to 1 hop.                                                                        |
| `CALL_IDLE_TIMEOUT_MINUTES`                                                                       | `10`                               |                                                                                                                       |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB`                                                                     | `uploads`, `2`                     | Local disk; use object storage for multi-instance deployments.                                                        |
| `LOG_LEVEL`                                                                                       | `info`                             | Structured JSON logs (pino) with request/correlation IDs; cookies, tokens, passwords, emails and phones are redacted. |
| `SEED_PASSWORD`                                                                                   | empty                              | Development seed only.                                                                                                |

Web: `VITE_API_PROXY` (dev only) overrides the proxy target.

## MongoDB

- **Replica set required for transactions.** At startup the API runs `hello` and logs whether transactions are
  available. Checkout, order transitions with stock/payout side effects, and listing creation from calls use
  transactions when available. Without a replica set checkout falls back to compensating writes (reservations
  are released on failure) — acceptable for local experiments only.
- Indexes are created explicitly at startup (`ensureIndexes`, non-destructive `createIndexes`; unknown indexes
  are never dropped). Key indexes: unique email, order number, ticket number, call ID, `(callId, seq)`, one payout
  per order, one return per order, `(userId, scope, key)` idempotency with 24 h TTL.
- **Backups:** enable continuous backup / point-in-time restore (Atlas) or scheduled `mongodump` with tested
  restores. The audit log collection is append-only at the application layer; also restrict its delete rights
  at the database-user level in production.
- Use a least-privilege database user for the API (readWrite on the app database only).

## Security checklist

- [ ] Real `JWT_SECRET` from a secret manager; `NODE_ENV=production`; HTTPS everywhere (`COOKIE_SECURE=true`).
- [ ] `CORS_ORIGINS` lists only the production web origin.
- [ ] Database user is least-privilege; network access restricted; backups tested.
- [ ] Seed script not run in production (it refuses) and no seed accounts exist there.
- [ ] Create the first admin deliberately (e.g. register, then promote via a one-off, audited DB operation) and
      remove any temporary access.
- [ ] Log shipping configured; alerts on 5xx rate, `ACCESS_DENIED` spikes, `WEBHOOK_SIGNATURE_REJECTED`.
- [ ] Upload directory on durable storage with antivirus scanning if user uploads are enabled.
- [ ] Native-speaker review of all six languages (see `LANGUAGES[*].knownLimitations`).

## Launch checklist (controlled demo)

- [ ] `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all green.
- [ ] `/api/ready` returns `200` with `transactions: true`.
- [ ] Walk the acceptance journeys in `docs/IMPLEMENTATION_STATUS.md` on a phone (320–430 px) and desktop.
- [ ] Demo labels visible: checkout (“no real payment”), payouts (“simulated”), phone (“DEMO CALL”).
- [ ] Real payments/payouts/telephony remain disabled until providers are integrated and verified (docs/PROVIDERS.md).
