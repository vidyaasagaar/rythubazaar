# RythuBazaar

_Your harvest. Your price. Your market._

A farmer-first produce marketplace (MERN + TypeScript) with a keypad-phone IVR demo, six launch languages,
server-enforced RBAC, and an operations console with a call audit center.

> **Demo mode.** Payments, payouts, telephony, AI interpretation and SMS/email run through clearly labelled
> demo/mock adapters. No real money moves and no telephone-network call is placed. See
> [docs/PROVIDERS.md](docs/PROVIDERS.md) for what a real integration needs.

## Repository layout

| Path              | What it is                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Single source of truth: roles & permissions, state machines, pricing, Zod API contracts, the six-language registry (UI strings, IVR prompts, crop names, speech locales, sample utterances). |
| `apps/api`        | Express + Mongoose API: auth, RBAC, marketplace, checkout, operations, payouts, returns, demo IVR engine, audit & exports.                                                                   |
| `apps/web`        | React + Vite + Tailwind web app: customer marketplace, farmer dashboard, operations console, keypad phone simulator.                                                                         |
| `docs/`           | Implementation status, API reference, deployment and provider notes.                                                                                                                         |

## Requirements

- **Node.js 20.19+ (tested on 24.14.0)** and npm 10+ (tested on 11.9.0). `.nvmrc` pins major 24.
- **MongoDB 7+ as a replica set** (needed for multi-document transactions). For local development you can use
  the bundled dev database (below), Docker, or a MongoDB Atlas cluster.

## Quick start (development)

```bash
npm install
```

Copy the API environment file and set a real `JWT_SECRET`:

```bash
cp apps/api/.env.example apps/api/.env
```

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Start each process in its own terminal:

```bash
npm run dev:db
```

```bash
npm run seed
```

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Open <http://localhost:5173>. The web dev server proxies `/api` and `/uploads` to the API on port 4000 so the
session cookie stays first-party.

- `npm run dev:db` starts a real single-node MongoDB **replica set** on `127.0.0.1:27017` via
  `mongodb-memory-server` (it downloads the official `mongod` binary on first run) and persists data in
  `apps/api/.data/mongo`. Use it only when you have no local MongoDB/Docker. With Docker instead:
  `docker run -d -p 27017:27017 mongo:7 --replSet rb-dev` then `docker exec <id> mongosh --eval "rs.initiate()"`.
- `npm run seed` is **development-only** and **non-destructive** (never deletes, skips existing records, refuses
  to run with `NODE_ENV=production`). It uses `SEED_PASSWORD` if set, otherwise it generates a random password
  and writes it to `apps/api/.data/seed-credentials.local.md` (git-ignored). There is no default password in the
  code. Seed accounts: admin, operations, support, three farmers, two customers (`*@rythubazaar.test`).

## Everyday commands

| Command                           | What it does                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm test`                        | Shared unit tests, API integration tests (real in-memory MongoDB replica set), web component tests. |
| `npm run typecheck`               | `tsc --noEmit` for every workspace.                                                                 |
| `npm run lint`                    | ESLint (flat config, typescript-eslint, react-hooks).                                               |
| `npm run format` / `format:check` | Prettier.                                                                                           |
| `npm run build`                   | API bundle (`apps/api/dist`, tsup) and web production build (`apps/web/dist`).                      |
| `npm start -w @rythubazaar/api`   | Run the built API (`node dist/index.js`).                                                           |

## Trying the keypad phone demo

1. Open **Call demo** (`/phone`). Dial **12908** (the code comes from `DEMO_DIAL_CODE`, served by
   `GET /api/config`; it is not hard-coded in the web app) and press the green key (or Enter).
2. Pick a language on the IVR menu (keys 1–6) or preselect one before calling.
3. Signed in as a **farmer**: 1 → 1 → choose a crop → choose a unit → type quantity then `#` → type price then
   `#` → review → 1 to save a **draft**. Nothing is written before that confirmation. Publish it later from the
   farmer dashboard.
4. Signed in as a **customer**: 2 → type a 6-digit order number then `#` (only your own orders are found), or
   3 → 1 → 1 to request a support callback.
5. Hang up (red key / Escape) to see the call summary and session ID. Staff can inspect the full timeline in
   **Operations console → Call audit**.

Keyboard: digits, `*`, `#`, Backspace, Enter (call), Escape (hang up). Voice input/TTS use the browser's speech
APIs when available for that language; the keypad and on-screen text always work.

## Documentation

- [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) — what is built, verified results, limitations.
- [docs/API.md](docs/API.md) — endpoint reference, response format, permissions.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — environment variables, MongoDB, security, backups, launch checklist.
- [docs/PROVIDERS.md](docs/PROVIDERS.md) — adapter interfaces and what real telephony/payment/payout/AI need.
