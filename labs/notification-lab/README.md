# CleanFlow Notification Lab V1

> **SIMULATED.** This lab sends no real notifications and does not change any schedule.
> Every person, device, property, Job and Offer is fictitious. Nothing here talks to
> Firebase, Firestore, Functions, Auth, FCM, OneSignal, WhatsApp, SMS, e-mail, the
> browser Notifications API, the Push API or any network service.

An interactive, deterministic simulator of how CleanFlow notifications **should** behave
for the manager (Gabi) and cleaners (Ana, Bia, Carla, plus Dora in another organization).
It exists to explore states, find UX bugs, discuss which alerts make sense with the
manager, and export evidence. It is **not** the product and proves nothing about real
push delivery on a physical phone.

## Run it

```bash
cd labs/notification-lab
npm install --legacy-peer-deps   # isolated deps; npm 10 needs the flag for a peer-resolution bug
npm run dev                      # http://127.0.0.1:5317  (local only)
```

| Command | What it does |
|---|---|
| `npm test` | Vitest: engine, 33 scenarios, isolation, idempotency, UI buttons, export, snapshot, i18n, offline-only source guard |
| `npm run typecheck` | TypeScript `strict` (+ `noUncheckedIndexedAccess`) |
| `npm run test:e2e` | Builds, then Playwright on Chromium desktop (1600×1000) and WebKit iPhone 13 |
| `npm run evidence` | Synthetic QA screenshots a–f into `test-results/evidence/` |
| `npm run test:all` | All of the above |

Internal links encode only scenario, seed and step count, e.g.
`http://127.0.0.1:5317/#s=F04&seed=7&n=3`.

## What you can do

- **Two modes.** *Visão da Gabi*: curated scenarios, plain language, one big "Ver acontecer"
  button, and what each person received. *Lab avançado*: everything below.
- **Catalog** of 33 scenarios (M01–M11, C01–C12, F01–F10) with search, filters
  (Manager / Cleaner / Offer / Checklist / Access / Push / Offline / Reminders) and the
  canonical-map status chips (published / in app / pending / to discuss), always next to
  "In the Lab: simulation". Anything not published shows **PROPOSTA — NÃO EXISTE NA PRODUÇÃO**.
- **Three phones at once** (Gabi iPhone PWA, Ana iPhone PWA, Bia Android PWA) plus a 4th
  slot (Carla Safari tab, Gabi's iPad, Dora other org). Each phone has a lock screen (only
  *explicitly displayed* pushes), a Novu-style inbox (unread / all / archived, read,
  archive, read all), and the app (cleaner schedule + offers, manager pending items).
  Every button in a phone really changes the simulation. Each phone can be expanded.
- **Event trail** EVENT_CREATED → RECIPIENT_SELECTED → INBOX_STORED → PUSH_ATTEMPTED →
  PROVIDER_ACCEPTED / REJECTED / UNKNOWN → DISPLAYED (explicit only) → OPENED / READ,
  per-recipient counts, "why not sent" reasons and a details panel with eventId,
  idempotencyKey, delivery levels CREATED / TARGETED / ACCEPTED / UNKNOWN / DISPLAYED /
  OPENED and the sanitized payload. Provider ACCEPTED carries the tooltip
  "O provedor aceitou o pedido; isto não comprova que a tela exibiu".
- **Controls**: Run, Step (exactly one transition), Pause, Replay exactly (rebuilds from
  the seed and re-applies the recorded operations, then compares the state fingerprint),
  Reset, Next, Generate evidence, speed (slow / normal / fast / instant), simulated clock,
  channel (in-app + simulated push / in-app only), language PT / EN / ES.
- **State editor**: per device OS, PWA installed, running from icon or tab, permission
  default / denied / granted, subscription missing / active / stale, online / offline,
  foreground / background, provider accepted / rejected / timeout / UNKNOWN; active
  persona, Job, offer mode manual / automatic (#86), invited cleaners, clock, time zone
  (Los Angeles by default), quiet hours, reminder lead time.
- **Lab actions**: Generate event, Send fictitious offer, Accept as Ana / Bia, Change job
  time, Cancel fictitious job, Disconnect / reconnect, Revoke device subscription, Switch
  account, Simulate display, Simulate push tap, Mark as read, Archive, End access.
  Manual actions are recorded and replayed.
- **Evidence**: Export JSON (real local download), Copy Markdown report (real clipboard),
  Generate summary for Gabi, Copy internal link, Save / restore a local snapshot
  (`localStorage`, prefix `cleanflow-notification-lab:v1:`), Clear all (asks first and
  removes only that prefix), seed input. The persona table shows user / org / role,
  devices, permission, token valid / failed, last sync and unread.

## Architecture

```text
src/engine/types.ts      typed model: Scenario, Job, Offer, User, Device, NotificationEvent,
                         InboxEntry, DeliveryAttempt, TimelineRecord, Command
src/engine/world.ts      fictitious starting world + preconditions
src/engine/engine.ts     SimulationEngine: applyCommand (business rules) and stepPipeline
                         (EventReducer: one queued transition at a time), NotificationAttempt
src/engine/session.ts    Step / Run / Replay / manual ops, FNV-1a state fingerprint
src/engine/selectors.ts  Presenter read models with the DEMO isolation rules
src/engine/evidence.ts   JSON / Markdown / Gabi summary, automatic inconsistency checks,
                         rules for Codex
src/engine/clock.ts      seeded PRNG (mulberry32), time-zone math, quiet hours
src/scenarios/           ScenarioRegistry: 33 scenarios with preconditions, script, expected
                         recipients and executable expected-vs-observed checks
src/i18n/messages.ts     all user-facing strings in PT / EN / ES
src/ui/                  React UI (Catalog, Phone = MockDevices, Trail, State, Evidence)
```

Determinism: no `Date.now()` or `Math.random()` in the engine; IDs come from counters,
the race order (F04) from the seed, time from a simulated clock (+1 s per transition).

## Scenarios

| ID | Scenario | Canonical-map status | Lab label | Checks |
|---|---|---|---|---|
| M01 | Cleaner is interested in a manual offer | PUBLISHED | published | 4/4 |
| M02 | First cleaner accepts an automatic offer (#86) | PENDING | proposal | 4/4 |
| M03 | Cleaner confirms “I'll be there” | PUBLISHED | published | 3/3 |
| M04 | Checklist ready for review | PUBLISHED | published | 3/3 |
| M05 | 7 pm reminder: tomorrow's jobs | PUBLISHED | published | 3/3 |
| M06 | 7 am reminder: today's jobs | PUBLISHED | published | 3/3 |
| M07 | Cleaner declines the offer | NO_PUSH + DISCUSS | proposal | 3/3 |
| M08 | Offer expires or job is cancelled | DISCUSS | proposal | 3/3 |
| M09 | Cleaner reports damage or missing supplies | DISCUSS | proposal | 2/2 |
| M10 | Upcoming job without a cleaner | DISCUSS | proposal | 3/3 |
| M11 | Access revoked or push registration failed | DISCUSS | proposal | 3/3 |
| C01 | Gabi sends an offer to eligible cleaners | IN_APP + PENDING | proposal | 4/4 |
| C02 | Cleaner accepts and wins the automatic offer | PENDING | proposal | 3/3 |
| C03 | Gabi assigns a job manually | IN_APP + PENDING | proposal | 3/3 |
| C04 | Gabi reschedules date or time | IN_APP + PENDING | proposal | 3/3 |
| C05 | Gabi cancels, removes or replaces the cleaner | IN_APP + PENDING | proposal | 4/4 |
| C06 | Another cleaner wins the offer | PENDING | proposal | 4/4 |
| C07 | Day-before reminder | DISCUSS | proposal | 2/2 |
| C08 | Reminder close to start | DISCUSS | proposal | 2/2 |
| C09 | Checklist available | IN_APP + DISCUSS | proposal | 2/2 |
| C10 | Gabi asks for a special confirmation | DISCUSS | proposal | 2/2 |
| C11 | Cleaner finds a missed notice again | PENDING | proposal | 2/2 |
| C12 | New phone, revoked access, blocked push | PENDING | proposal | 3/3 |
| F01 | Permission denied | LAB | proposal | 3/3 |
| F02 | iPhone opened in Safari, not from the icon | LAB | proposal | 2/2 |
| F03 | Expired subscription/token | LAB | proposal | 2/2 |
| F04 | Two cleaners accept the same job | LAB | proposal | 5/5 |
| F05 | Three taps on the same offer | LAB | proposal | 3/3 |
| F06 | Gabi uses two devices | LAB | proposal | 3/3 |
| F07 | Account switched on the phone | LAB | proposal | 2/2 |
| F08 | Offline and reconnection | LAB | proposal | 3/3 |
| F09 | Provider timeout | LAB | proposal | 3/3 |
| F10 | Tap on a push for a cancelled job | LAB | proposal | 2/2 |

Sources (read for this build): the execution brief "CLAUDE — Notification Lab V1"
(Google Doc 19vFsvsezKmO_gHv2eBozOKykaXkF1kcIay5zQYaBux4), the canonical notification map
v0.1 (1TY3UIdHBZtRot_TSsdFrnfNg_FJ0Jnnqy2Im44T8tA0), the notification-projects research
(1dnxhtTGlG8FOYT0SXrhmv7cHGk1lIsL5Nxubbq2qEpE) and issues #84, #85, #86. Statuses follow
the canonical map; when it changes, update `src/scenarios/registry.ts` and the
`proposal` flag — never relabel a proposal as published.

## What the lab assumes (rules for Codex to confirm)

The simulator does **not** validate backend security. These are expectations to be
proven by Codex with emulator tests before anything ships (also exported in every
report as `businessRulesToConfirmByCodex`):

1. One persisted operational event per business change, unique idempotency key.
2. Recipients selected server-side from authorized, active, same-organization members.
3. Inbox entry stored per recipient regardless of push readiness, permission or connectivity.
4. Push only when iOS is standalone, permission granted and subscription active; one provider per logical notice.
5. ACCEPTED is not DISPLAYED; DISPLAYED/OPENED only from explicit client signals.
6. Timeout / ambiguous answer = UNKNOWN, no automatic resend through another provider.
7. A rejected/expired token cleans only that device.
8. Offers target only the selected cleaners; no broadcast.
9. Automatic first-accept = one server transaction, exactly one Assignment, others UNAVAILABLE without naming the winner.
10. Manual interest is never an Assignment.
11. Cleaners never read other cleaners' notices, offers, amounts or history; other organizations see nothing.
12. Revoked access blocks inbox reads immediately; push is not a security mechanism.
13. Opening an old push resolves the current authorized context without leaking details.
14. A late push for a previous account on a shared device is not shown to the current account.
15. Reminders skip cancelled/unassigned Jobs; dedupe per Job revision / day / organization.
16. Quiet hours hold normal/low push but still store the inbox entry.

### Contract for the future real integration

| Lab concept | Expected real counterpart (Codex) |
|---|---|
| `NotificationEvent {eventId, idempotencyKey, type, orgId, jobId, recipients, priority, channels, params, deepLink}` | server-written operational event, created in the same transaction as the business change (or by a trigger), never from browser input |
| `InboxEntry {userId, eventId, unread, openedAt, archivedAt}` | per-recipient durable inbox document; rules: read/update own only |
| `DeliveryAttempt {deviceId, providerResult, blockedReason, unknownReason, displayedAt, openedAt}` | per-device audit; `displayedAt`/`openedAt` only from client receipts |
| `Device {platform, standalone, permission, subscription, signedInUserId}` | per-device registration + readiness status engine (#85 Track D) |
| `OpenContext` | deep-link resolver that re-checks authorization and Job state at open time |
| `EventType` list | catalog of workflows; `OFFER_AUTO_ASSIGNED` must match the #86 transaction result once Codex hands it off |

## Reuse assessment (read-only)

- **Novu Inbox Playground** (`novuhq/inbox-playground`, MIT, Next.js + Chakra + `@novu/react`)
  — inspected via the GitHub API; **no code copied, no SDK added** (the SDK needs a Novu
  account/backend, which would break the offline rule). Patterns reused: bell with unread
  counter; status tabs Unread / All / Archived; per-item read / archive and "read all";
  localization dictionary per locale; workflow = trigger → in-app step with subject, body
  and primary / secondary actions; preferences as a separate concern; a playground layout
  of controls + live preview. Added beyond it: several simultaneous phones, delivery
  levels, provider outcomes, device readiness, races, failures and replay.
- **Novu docs** (inbox, workflow) — the workflow/step/channel vocabulary informed the
  event → recipients → channels pipeline.
- **Chatwoot** — inspiration only: notices are actionable and lead back to the task
  (here, "Abrir" resolves the current Job / Offer / checklist context).
- **ntfy** — inspiration only: history survives missed pushes; last-sync indicator.
- **Firebase messaging quickstart** — concepts only (permission, subscription/token,
  foreground/background) for the device editor; no code, no SDK.

Dependencies: React 19, Vite 8, TypeScript 5.9, Vitest 4, Testing Library, Playwright
1.62 — all MIT/Apache-2.0, versions pinned in `package.json`. No icon font or web font.

## Limits

- Fictitious, single-browser simulation. It does not prove physical display, iOS PWA push,
  FCM/OneSignal behaviour, Firestore rules or real authorization.
- "Authenticated" is only a lab flag; there is no login.
- Gabi's view copy has not yet been reviewed with Gabi; cleaner copy has not been tested with cleaners.
- #86 behaviour is a proposal mirrored from the issue text; the real transaction is Codex's.
- C10 shows a structured request preview only; there is no chat.
- Snapshots live only in this browser's `localStorage`.
