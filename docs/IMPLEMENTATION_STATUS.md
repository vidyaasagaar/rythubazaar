# Implementation status

_Last updated: 2026-10-10. Environment: Windows 11, Node 24.14.0, npm 11.9.0, MongoDB 7 (via
mongodb-memory-server replica set). Docker was installed but its daemon was not running; no local `mongod`._

## Summary

All phases 0–11 are implemented in a first complete pass. The three dashboards, server-enforced RBAC, the
marketplace flow, the `12908` keypad IVR journey, six-language structure, operations workflows, payouts and the
call audit trail work end to end in the running app (verified in a browser, see below). Payments, payouts,
telephony, AI and notifications are demo/mock only and labelled as such.

## Verification (commands actually run, final results)

| Command                | Result                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`          | OK. `npm audit`: **0 vulnerabilities** (see “Dependency decisions”).                                                                                                    |
| `npm run typecheck`    | Pass — shared, api, web.                                                                                                                                                |
| `npm run lint`         | Pass — 0 problems.                                                                                                                                                      |
| `npm run format:check` | Pass.                                                                                                                                                                   |
| `npm test`             | **88 passed**: shared 31, api 52 (real single-node replica set), web 5.                                                                                                 |
| `npm run build`        | Pass — API bundle (tsup) and web build (Vite). Web main chunk 468 kB / 128 kB gzip; CSS 48 kB / 9 kB gzip; routes are code-split.                                       |
| Runtime                | `npm run dev:db`, `npm run seed`, `npm run dev:api`, `npm run dev:web` all started. `GET /api/ready` → `{"status":"ready","database":"connected","transactions":true}`. |

### Browser verification (performed in this session against the running dev stack)

- **Phone (guest):** dialled 12908 → dialing/connecting → connected with DEMO CALL label and timer → six-language
  menu in native scripts → Telugu → farmer services refused safely for a guest → hang up → summary with session
  ID and outcome `ABANDONED`. TTS notice correctly reported no Telugu voice on this machine.
- **Phone (farmer, Telugu):** 1 → 1 → tomato → kg → 50# → 30# → review shown in Telugu → 1 (confirm) → draft
  saved (reference shown) → hang up → outcome `COMPLETED`. Transcript showed caller / interpretation / backend
  request / backend result / committed business event lanes. Draft appeared in the farmer dashboard with a
  “created by phone call” badge and was published from there.
- **Customer (Hindi):** market → listing → quantity 5 → cart (subtotal ₹150, delivery ₹30, service ₹3, total
  ₹183, each line separate) → checkout validation errors shown in Hindi → order placed (demo, not charged).
- **Operations:** order list → confirm → ready → assign agent → record collection (quantities verified, grade)
  → payout created `PENDING` → dispatch → delivered; history shows role/actor/time for every step.
- **Admin payouts:** initiate → simulate provider success → `SUCCEEDED`, labelled SIMULATED, with history
  `PENDING·SYSTEM → INITIATED·USER → SUCCEEDED·PROVIDER`.
- **Call audit center:** both browser calls listed with language, caller role, outcome and event counts.
- **Responsive:** every core page measured at 320 px for horizontal overflow (public, customer, farmer, all
  ops pages, phone): **0 px** after fixes. The phone simulator was checked visually at 320 px and 800 px.

Bugs found during browser verification and fixed (with regression tests where applicable): header overflow at
320/800 px (breakpoint and class conflict), number-entry IVR screens wrongly offering “0 main menu”, handset
labels not following the call language, end-of-call events missing from the transcript, locale-dependent
timestamps, misleading “Confirmed by farmer” label when operations confirmed, `Element.scrollTo` missing on
older WebViews.

## Acceptance tests (brief §15)

| #   | Journey                                                                                  | Status               | Evidence                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Customer register/login → browse → cart → checkout → confirmation → track                | **Pass**             | API tests (`auth-rbac`, `marketplace`); browser: login → checkout → confirmation. Order tracking page covered by API test; not opened visually.                                                                                                                                                                                                                                      |
| 2   | Farmer register/login → draft → edit → publish → incoming order & payout                 | **Pass**             | API tests (`marketplace`, `operations`); browser: login, draft via phone, publish. Edit form and payout page not exercised visually.                                                                                                                                                                                                                                                 |
| 3   | Operations: view → assign → collection metadata → dispatch/deliver → history             | **Pass**             | API `operations` test; browser end to end.                                                                                                                                                                                                                                                                                                                                           |
| 4   | Payout: create → validated transitions → success only via provider/mock action → audited | **Pass**             | API `payouts` tests incl. failed → retry; unsigned webhook rejected; browser initiate + simulate success.                                                                                                                                                                                                                                                                            |
| 5   | Phone: 12908 → each language → keypad → safe action → persisted → end → audit            | **Pass**             | API `calls` tests (all six languages, draft only after confirm, cancel writes nothing, order lookup ownership, callback, token required, interrupted, audit + export); browser Telugu farmer journey.                                                                                                                                                                                |
| 6   | RBAC denials                                                                             | **Pass**             | API `auth-rbac` tests: anonymous 401s; customer denied farmer/admin; farmer denied other farmers' listings/orders/payouts; customer denied other customers' orders; support denied payouts, role change, order/delivery writes, export, config; operations denied payout actions and role change; self role change denied; role change invalidates sessions.                         |
| 7   | Responsive at 320 px                                                                     | **Pass**             | Overflow measurement on all core pages; visual check of the phone. Tablet (768 px) and desktop checked visually on home, phone, cart, checkout, ops.                                                                                                                                                                                                                                 |
| 8   | Multilingual coverage                                                                    | **Pass (structure)** | Registry tests: every UI key and IVR prompt present in all six languages with matching placeholders; critical strings differ from English; IVR language switch tested for all six. Quality review by native speakers still required.                                                                                                                                                 |
| 9   | Failures                                                                                 | **Pass**             | MongoDB down → `503 DATABASE_UNAVAILABLE`, health still up, recovers; malformed/oversized input; insufficient stock; stale total; duplicate checkout (idempotent replay) and concurrent oversell race; interrupted call; failed payout → retry; fake image upload. Provider-unavailable path (`PROVIDER_UNAVAILABLE`) is implemented but not exercised because the mock never fails. |
| 10  | Audit search/export/redaction                                                            | **Pass**             | API test: phone numbers and emails in a spoken transcript are masked in detail view and exports; JSON/CSV/Markdown exports; each export creates an `EXPORT` audit record; append-only audit model rejects update/delete. Export buttons not clicked in the browser (downloads).                                                                                                      |

## Phase notes

- **0 Baseline:** empty folder (only an empty `.git` directory). Monorepo with npm workspaces created; nothing
  pre-existing was modified or deleted.
- **1 Foundation:** env validation with actionable errors; pino structured logs with request/correlation IDs
  and redaction; consistent error envelope; ESLint/Prettier/Vitest; Tailwind design tokens; responsive shell.
- **2 Auth & RBAC:** bcrypt (12 rounds), httpOnly JWT cookie with server-side role lookup and session
  versioning, double-submit CSRF, central permission matrix, ownership checks, audited denials.
- **3 Data & APIs:** 14 collections with indexes; Zod contracts shared by API and web; pagination everywhere;
  health/readiness; rate limits; transactions detected at startup.
- **4 Farmer:** profile, listing CRUD, photo upload (magic-byte checked), draft/publish/pause/archive, stock
  breakdown, certificate claim with staff verification (badge only after verification).
- **5 Customer:** search/filter/sort, detail with claim basis, persisted cart, per-farmer shipments with
  separate fees, idempotent atomic checkout, immutable snapshots, tracking, cancellation, returns, support.
- **6 Operations:** order state machine with actor/time history, agent assignment history, collection
  metadata, payout lifecycle, returns with no payout clawback, certificate review, users/roles, tickets.
- **7 Keypad IVR:** handset UI with all required states and controls; backend sessions, tokens, ordered
  events, allow-listed tools, confirmation before writes, idle sweeper, physical keyboard support.
- **8 Multilingual:** central registry (UI, IVR prompts, crop names, units, speech/TTS locales, sample
  utterances, capability flags, limitations); runtime speech capability detection with fallbacks.
- **9 Audit center:** filters, timeline lanes, correlated audit records, redacted JSON/CSV/Markdown exports.
- **10 Providers:** interfaces + mocks; see `docs/PROVIDERS.md`.
- **11 QA:** see verification above; deployment notes in `docs/DEPLOYMENT.md`.

## Dependency decisions

- Pinned the newest release in each chosen major line that was at least two weeks old at build time.
- Upgraded dev tooling to clear `npm audit` findings: Vitest 4.1.11 (older lines flagged), esbuild forced to
  0.28.2 via root `overrides` (tsup pins `^0.27`; verified tsup builds with it), Vite pinned to 7.3.6,
  Tailwind 3 → **4.3.3** (Tailwind 3's watcher/glob chain had unfixable `braces` advisories; v4 keeps the same
  token config via `@config`), React Router 6 → **7.18.4** (v6 open-redirect advisory; library-mode APIs
  unchanged). The post-login redirect also rejects `//`, `\` and control characters itself.
- Runtime libraries stay on their established majors: Express 4, Mongoose 8, Zod 3, React 18.

## Known limitations / outstanding work

1. **Translations** are authored for the demo and need native-speaker review before launch.
2. **Staff console text is English-only** (staff navigation labels and console pages); customer, farmer and
   phone journeys are fully translated.
3. **Speech recognition and TTS are not verified per language.** They are detected at runtime; on this
   Windows machine no Telugu voice was available and the UI said so. Keypad and on-screen text always work.
4. **Caller identity in the IVR** is the signed-in web session (demo). A real phone line needs number + PIN/OTP.
5. **No real providers** (payments, payouts, telephony, AI, SMS/email). See `docs/PROVIDERS.md`.
6. **Uploads** go to local disk (`apps/api/uploads`); use object storage for multi-instance deployments.
7. **Call input serialisation** uses an in-process lock plus an optimistic version check; multi-instance
   deployments rely on the version check (a racing input gets `409` and can be retried).
8. **Without a replica set** checkout uses compensating writes; a crash mid-checkout could leave an order
   without its stock-movement records. Use a replica set (the dev DB is one).
9. **No automated browser E2E suite** (e.g. Playwright) yet; browser journeys above were run manually in this
   session. Recommended next step.
10. **Delivery agents** are seeded; there is no UI to add or edit them yet.
11. The web bundle ships all six UI dictionaries (~128 kB gzip main chunk); lazy-loading inactive languages
    would reduce first load on slow connections.
12. **Git:** the `.git` directory in the workspace is empty (not an initialised repository), so nothing has been
    committed. `.gitignore` already excludes `.env`, `.data/`, uploads and build output.
