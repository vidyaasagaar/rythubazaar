# Integration adapters

Every external capability sits behind an interface in `apps/api/src/adapters/` (or `apps/web/src/lib/speech.ts`
for browser speech). Only deterministic demo/mock implementations exist today, and the app labels them as such.
Nothing here claims a live integration.

| Capability                 | Interface                                     | Current implementation                                                                                                                                                                                           | Labelled in UI as                                             |
| -------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Telephony                  | `TelephonyProvider` (`adapters/telephony.ts`) | `DemoTelephony`: maps `DEMO_DIAL_CODE`/`EXTRA_DEMO_ROUTES` to the in-app IVR. `placesRealCalls: false`.                                                                                                          | “DEMO CALL”, “In-app simulation — no telephone network”       |
| AI / speech interpretation | `Interpreter` (`adapters/interpreter.ts`)     | `RulesInterpreter` (`RULES_DEMO`): matches keypad keys, crop/unit/language names and the registry's sample utterances to the options already offered at the current IVR node. It cannot call tools or read data. | “Interpreter: RULES_DEMO”                                     |
| Speech-to-text / TTS       | `lib/speech.ts` (browser)                     | Web Speech API when the browser exposes it; voices detected per language at runtime.                                                                                                                             | Notices when unavailable; keypad + on-screen text always work |
| Payment (checkout)         | —                                             | `DEMO_PAY_ON_DELIVERY`: no card/UPI data is collected; orders are recorded `NOT_CHARGED_DEMO`.                                                                                                                   | “Demo checkout — no real payment”                             |
| Payouts                    | `PayoutProvider` (`adapters/payouts.ts`)      | `MockPayoutProvider`: returns a `MOCKPAY-…` reference; has no state; rejects all webhook signatures. Results come only from the admin-only, audited “simulate provider result” action.                           | “SIMULATED” on every payout                                   |
| Notifications              | `Notifier` (`adapters/notifications.ts`)      | `LogNotifier`: logs the intent at debug level; sends nothing.                                                                                                                                                    | —                                                             |

## Adding a real provider (outline)

**Telephony (inbound IVR on a real number).** Choose a provider with Indian DID numbers and DTMF/speech
webhooks. Implement a `TelephonyProvider` that verifies the provider's request signature, maps the inbound
number to a route, and translates provider events into the existing `startCall` / `handleInput` / `endCall`
service calls (the IVR engine is transport-agnostic). Caller identity must come from a verified phone number
plus a PIN/OTP step — never from caller ID alone. Keep `DEMO CALL` labelling for the browser simulator.

**AI interpretation.** Implement `Interpreter` against the chosen model API. Keep the contract: input is the
utterance plus the options valid at this node; output is one of those keys (or digits) with a confidence. The
model must not receive database access or free-form tool calling; tools remain the three allow-listed functions
in `services/ivr/tools.ts`, and consequential ones keep the explicit confirmation step.

**Payouts.** Implement `PayoutProvider.initiate` (idempotent on payout ID), `fetchStatus`, and
`verifyWebhookSignature` (HMAC over the raw body with a provider secret from env). Register the webhook at
`POST /api/webhooks/payouts`. Only `applyProviderResult` may set `SUCCEEDED`/`FAILED`. Run reconciliation on a
schedule for `INITIATED` payouts older than the provider SLA. Never store bank account numbers in logs; store
only provider beneficiary tokens.

**Payments.** Add a payment intent step before order creation, confirm via signed webhook, and only then mark
orders paid. The current server-side pricing snapshot and idempotency key are already the inputs a payment
intent needs.

**SMS/email.** Implement `Notifier` with templates per language from the registry; respect opt-out and DLT
template registration rules for Indian SMS.

## Audio recording

Disabled (`audioRecording: "DISABLED"` on every call session). Enabling it requires explicit caller consent in
the IVR flow, a documented retention period, encrypted storage and access controls restricted to authorised
staff — none of which is implemented.
