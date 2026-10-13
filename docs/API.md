# API reference

Base path: `/api`. JSON in, JSON out. All money is integer **paise** (₹1 = 100).

## Conventions

- **Success:** `{ "data": … }`, paginated lists add `"meta": { page, pageSize, total, pages }` (`pageSize` ≤ 50, or ≤ 48 for the public market).
- **Error:** `{ "error": { code, message, details?, requestId } }`. Codes are listed in
  `packages/shared/src/domain.ts` (`ERROR_CODES`) and translated in the web app. No stack traces or provider
  internals are returned.
- **Auth:** `rb_session` httpOnly cookie (HS256 JWT, `SameSite=Lax`, `Secure` in production). The role is
  always re-read from the database on each request; role changes bump a session version that signs the user out.
- **CSRF:** double-submit. `GET /api/auth/csrf` sets a readable `rb_csrf` cookie; every non-GET request must send
  the same value in `X-CSRF-Token`. Webhooks are exempt (they use provider signatures instead).
- **Correlation:** `X-Request-Id` and `X-Correlation-Id` are echoed on every response.
- **Status codes:** `400` validation, `401` not signed in, `403` permission/ownership denied (logged and audited),
  `404` not found, `409` conflict/invalid transition/stock/price changed, `413` too large, `415` bad file,
  `422` business rule, `429` rate limited, `502` provider rejected, `503` database unavailable.
- **Rate limits** (per IP, can be disabled with `RATE_LIMIT_ENABLED=false` for tests): auth 30/15 min,
  call creation 40/10 min, call input 120/min, sensitive admin/checkout actions 30/min, everything 300/min.

## Health

| Method | Path      | Notes                                                                                    |
| ------ | --------- | ---------------------------------------------------------------------------------------- |
| GET    | `/health` | Liveness. Works when MongoDB is down.                                                    |
| GET    | `/ready`  | `200` when MongoDB is connected, else `503`. Reports whether transactions are available. |
| GET    | `/config` | Public runtime config: demo dial codes, provider modes (all demo/mock), fees, languages. |

## Auth & account

| Method | Path             | Permission | Notes                                                                             |
| ------ | ---------------- | ---------- | --------------------------------------------------------------------------------- |
| GET    | `/auth/csrf`     | —          | Issues CSRF token.                                                                |
| POST   | `/auth/register` | —          | `role` must be `CUSTOMER` or `FARMER`. Staff accounts are created by role change. |
| POST   | `/auth/login`    | —          | Uniform `INVALID_CREDENTIALS` for unknown email and wrong password.               |
| POST   | `/auth/logout`   | —          |                                                                                   |
| GET    | `/auth/me`       | —          | `{ user: null }` when signed out.                                                 |
| PATCH  | `/auth/me`       | signed in  | `name`, `phone`, `preferredLanguage` only (strict schema).                        |

## Marketplace (public)

| Method | Path            | Notes                                                                                                                              |
| ------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/listings`     | `q, category, district, maxPricePaise, availableOnly, sort=newest\|price_asc\|price_desc, page, pageSize`. Only `ACTIVE` listings. |
| GET    | `/listings/:id` | `ACTIVE`/`PAUSED` only. Includes `claim.basis` (`FARMER_REPORTED` or `STAFF_VERIFIED_CERTIFICATE`).                                |

## Customer

| Method   | Path                     | Permission                    | Notes                                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET      | `/cart`                  | `cart:manage`                 | Server-priced quote: lines, per-farmer shipments with each fee, grand total, issues.                                                                                                                                                                                                                                                     |
| PUT      | `/cart/items`            | `cart:manage`                 | `{ listingId, quantity }` sets the quantity; checks availability.                                                                                                                                                                                                                                                                        |
| DELETE   | `/cart/items/:listingId` | `cart:manage`                 |                                                                                                                                                                                                                                                                                                                                          |
| POST     | `/checkout`              | `orders:create`               | Header `Idempotency-Key` (8–100 chars) required. Body `{ address, expectedTotalPaise, paymentMode: "DEMO_PAY_ON_DELIVERY" }`. Rejects with `PRICE_CHANGED` if the server total differs, `INSUFFICIENT_STOCK`/`LISTING_UNAVAILABLE` if stock moved. Atomic reservation; one order per farmer. Replays return `Idempotent-Replayed: true`. |
| GET      | `/orders`                | `orders:read:own`             | Own orders only.                                                                                                                                                                                                                                                                                                                         |
| GET      | `/orders/:id`            | `orders:read:own` + ownership | Includes return status and window.                                                                                                                                                                                                                                                                                                       |
| POST     | `/orders/:id/cancel`     | owner                         | Only while `PLACED`. Releases reserved stock.                                                                                                                                                                                                                                                                                            |
| POST     | `/returns`               | `returns:create:own`          | Delivered orders within `RETURN_WINDOW_HOURS`; one per order.                                                                                                                                                                                                                                                                            |
| GET      | `/returns`               | `returns:create:own`          | Own returns.                                                                                                                                                                                                                                                                                                                             |
| POST/GET | `/support/tickets`       | `support:create`              | Customers and farmers.                                                                                                                                                                                                                                                                                                                   |

## Farmer

| Method    | Path                            | Permission            | Notes                                                                                         |
| --------- | ------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| GET/PUT   | `/farmer/profile`               | `profile:farmer`      | Village, district, state and PIN are required before listing.                                 |
| GET       | `/farmer/overview`              | `listings:manage:own` | Counts, payout totals by status, recent orders.                                               |
| GET/POST  | `/farmer/listings`              | `listings:manage:own` | New listings are always `DRAFT`.                                                              |
| GET/PATCH | `/farmer/listings/:id`          | owner                 | Quantity cannot drop below reserved + sold. Changing a certificate claim resets verification. |
| POST      | `/farmer/listings/:id/status`   | owner                 | `DRAFT→ACTIVE`, `ACTIVE↔PAUSED`, any→`ARCHIVED` (terminal).                                   |
| GET       | `/farmer/orders`                | `orders:read:farmer`  | Own orders; customer identity and fees hidden, farmer payout shown.                           |
| POST      | `/farmer/orders/:id/transition` | owner                 | `PLACED→CONFIRMED`, `CONFIRMED→READY_FOR_COLLECTION`, cancel (`CONFIRMED` needs a reason).    |
| GET       | `/farmer/payouts`               | `payouts:read:own`    |                                                                                               |
| POST      | `/uploads/image`                | `uploads:create`      | Multipart `file`; JPG/PNG/WebP detected by magic bytes; `MAX_UPLOAD_MB`.                      |

## Demo IVR (keypad simulator)

| Method | Path                     | Notes                                                                                                                                                                                                      |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/calls`                 | `{ dialedCode, language? }`. Unknown codes → `404 NUMBER_NOT_AVAILABLE` (attempt is logged). Returns `callId`, a one-time `callToken`, and the first prompt. Caller identity = the signed-in user, if any. |
| POST   | `/calls/:callId/input`   | Header `X-Call-Token`. Body one of `{kind:"DTMF",value}`, `{kind:"SPEECH",value}` (browser speech or typed), `{kind:"LANGUAGE",value}`, `{kind:"REPEAT",value:"NORMAL"\|"SLOW"}`.                          |
| POST   | `/calls/:callId/end`     | `{ reason: "HANGUP" \| "INTERRUPTED" }` → summary + closing events.                                                                                                                                        |
| GET    | `/calls/:callId/summary` | Header `X-Call-Token`.                                                                                                                                                                                     |

The IVR can only reach three allow-listed, Zod-validated tools: `createListingDraft` (farmer only, draft only),
`getOrderStatus` (caller's own orders only) and `createSupportCallback`. Each tool re-loads the caller from the
database. Events are persisted in order with kinds `KEYPAD`/`SPEECH` (caller), `INTERPRETATION`,
`TOOL_REQUEST`, `TOOL_RESULT`, `BUSINESS_EVENT` (only after a confirmed write), `PROMPT`, `LANGUAGE_CHANGED`,
`ERROR`, `CALL_STARTED`, `CALL_ENDED`, `DIAL_FAILED`. Idle calls are closed as `ABANDONED` after
`CALL_IDLE_TIMEOUT_MINUTES`.

## Operations / admin (`/admin`)

| Method | Path                                          | Permission                                                                                                                                                           |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/overview`                                   | `orders:read:any`                                                                                                                                                    |
| GET    | `/orders`, `/orders/:id`                      | `orders:read:any` (contact details masked without `pii:read`)                                                                                                        |
| POST   | `/orders/:id/transition`                      | `orders:manage` (reason required for cancel/failed delivery)                                                                                                         |
| POST   | `/orders/:id/assign`                          | `deliveries:manage`                                                                                                                                                  |
| POST   | `/orders/:id/collect`                         | `deliveries:manage` — `{ quantitiesVerified: true, qualityGrade, weightKg?, notes?, evidencePhoto? }`; moves stock reserved→sold and creates the payout (`PENDING`). |
| GET    | `/delivery-agents`                            | `orders:read:any`                                                                                                                                                    |
| GET    | `/payouts`                                    | `payouts:read:any`                                                                                                                                                   |
| POST   | `/payouts/:id/initiate`                       | `payouts:manage` (`PENDING`/`FAILED` → `INITIATED`)                                                                                                                  |
| POST   | `/payouts/:id/simulate-result`                | `payouts:manage`, mock provider only — `{ outcome, failureReason? }`                                                                                                 |
| POST   | `/payouts/:id/reconcile`                      | `payouts:manage`                                                                                                                                                     |
| GET    | `/returns`                                    | `returns:read:any`                                                                                                                                                   |
| POST   | `/returns/:id/review`, `/returns/:id/refund`  | `returns:manage` (refund is recorded in demo mode; payout untouched)                                                                                                 |
| GET    | `/listings`                                   | `listings:read:any`                                                                                                                                                  |
| POST   | `/listings/:id/certification`                 | `listings:verify-certification`                                                                                                                                      |
| GET    | `/users`                                      | `users:read` (masked without `pii:read`)                                                                                                                             |
| PATCH  | `/users/:id/role`                             | `users:manage-roles` (not self; not the last admin)                                                                                                                  |
| GET    | `/tickets`, PATCH `/tickets/:id/status`       | `support:read:any` / `support:manage`                                                                                                                                |
| GET    | `/calls`, `/calls/:callId`                    | `calls:read`                                                                                                                                                         |
| GET    | `/calls/export?format=json\|csv\|md&…filters` | `audit:export` — redacted, max 200 calls, audited                                                                                                                    |
| GET    | `/audit`, `/audit/export?format=…`            | `audit:read` / `audit:export`                                                                                                                                        |
| GET    | `/config`                                     | `config:read` (admin)                                                                                                                                                |

## Webhooks

| Method | Path                | Notes                                                                                                                                                             |
| ------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/webhooks/payouts` | Provider webhook; the raw body's signature is verified before parsing. The mock provider rejects every signature, so this cannot mark a payout paid in demo mode. |

## Role → permission matrix

Defined once in `packages/shared/src/roles.ts`.

| Role       | Highlights                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| CUSTOMER   | cart, checkout, own orders/returns, support                                                                                       |
| FARMER     | own profile, listings, orders, payouts, uploads, support                                                                          |
| SUPPORT    | read users/listings/orders/returns/tickets/calls (PII masked), manage tickets — no writes to orders, deliveries, returns, payouts |
| OPERATIONS | support + order/delivery/return management, certificate verification, payouts read, audit read/export, PII                        |
| ADMIN      | operations + payout actions, role management, config                                                                              |
