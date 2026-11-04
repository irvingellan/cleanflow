# Cleaner Hub V1 — cleaner self-service schedule (local candidate)

Status: **LOCAL CANDIDATE, NOT DEPLOYED.** Branch `feature/cleaner-hub-real-v1`,
based on `codex/development` @ `19d7faa` (Production-compatible `b7b0eea` plus the
local notification-reliability work). No Production, Sandbox, billing, IAM or
real-data change was made. Everything below was validated on isolated local
emulators with fictitious records.

## Problem

Cleaners ask the operations manager by message which Jobs they have; she searches,
takes screenshots and answers. The Hub lets each cleaner open **her own** current
assignments on her phone, without asking, while the manager keeps using the
existing assignment screens.

## What a cleaner gets (`/agenda`)

- One-time sign-in with a manager-issued access code; afterwards the session stays
  on that phone (Firebase Auth, IndexedDB persistence of a separate named app).
- **Hoje / Próximas / Concluídas** from real Assignments; **Ofertas** in its own
  tab. An `INTERESTED` Offer is never shown as confirmed work.
- Card and detail: property display name, date, time, assignment status, her own
  acknowledgment. Offers also show her own offered amount (same rule as the public
  Offer link). No client prices, Job payouts, notes, guest names, access codes,
  addresses or other cleaners.
- Live updates (Firestore listener): assigned, rescheduled, removed, replaced,
  cancelled (archived) and completed Jobs change on screen without a message.
  "Mudanças recentes" keeps honest notices; removed/cancelled notices carry no Job ID.
- Answering an Offer (`Tenho interesse` / `Não posso`) through the existing public
  Offer service, including the manager notification it already creates.
- **Abrir checklist** opens the existing public checklist for an assigned Job, using
  the existing capability rules; it never takes over a teammate's active link.
- Freshness is explicit: "Atualizada" only after a server-confirmed snapshot;
  offline/cached/failed reads keep the last confirmed list labelled as not confirmed.
- Install guide (iPhone/Android) and visual structure reuse the approved Cleaner Hub
  V1 visual (`feature/cleaner-hub-v1-visual` @ `08390b6`, `hub/*`), scoped under
  `.hb-root`. Notifications are out of scope: the schedule works without push.

## What the manager gets

Nothing changes in creating, assigning, offering, rescheduling or removing. The
existing **Cleaner detail** page gains one explicit panel, "Acesso à Minha agenda":

- **Gerar código de acesso** — single-use, 12 characters (`XXXX-XXXX-XXXX`, no
  ambiguous letters), valid 72 h, shown once with a ready-to-send message in the
  cleaner's language. Sending is manual (for example WhatsApp); nothing is sent.
- **Gerar código novo** replaces any unused earlier code (new phone, lost session).
- **Encerrar acesso** — deactivates the cleaner membership (rules deny at once),
  revokes refresh tokens and unused codes. The open app shows "Seu acesso foi
  encerrado" and clears its data.

## Architecture

```text
Manager UI (unchanged services)            Cleaner Hub UI (/agenda, own Firebase app)
  jobs / assignments / offers writes          │  onSnapshot(cleanerAgenda where cleanerId == mine)
            │                                 │  callables: redeem / openMyChecklist / respondToMyOffer
            ▼                                 ▼
Firestore source of truth ──triggers──► syncCleanerAgendaForJob (one transaction)
  jobs/{id}, assignments, offers               │ writes cleaner-safe entries + notices
                                                ▼
                                organizations/{org}/cleanerAgenda/{cleanerId}__{jobId}
```

- `functions/src/cleanerAgenda.js` — pure projection (`computeAgendaEntries`,
  `planAgendaChanges`) plus `syncCleanerAgendaForJob` (re-reads Job, Offers and
  active Assignments inside one transaction, so out-of-order triggers converge) and
  `rebuildCleanerAgenda` (backfill when a cleaner links).
- Roster rule = checklist capability rule: `assignedCleanerIds` for schema ≥ 2,
  legacy `assignedCleanerId` while ASSIGNED/IN_PROGRESS/COMPLETED. Archived = cancelled.
- Offer rule = public Offer rule (`publicOfferState(...) === "available"`) and status
  PENDING/INTERESTED; Offers never sent as a link are not shown.
- `functions/src/cleanerHubAccess.js` — codes, redemption, revocation, cleaner
  authorization, checklist opening and Offer answers.
- Triggers: `syncCleanerAgendaOnJobWrite`, `…OnAssignmentWrite`, `…OnOfferWrite`.
  Callables: `issueCleanerAccessCode` and `revokeCleanerHubAccess` (manager),
  `redeemCleanerAccessCode` (public, code only), `openMyChecklist` and
  `respondToMyOffer` (active cleaner). 8 new Functions; 40 declared in total.

### Identity

| Record | Path | Who writes | Notes |
|---|---|---|---|
| Access code | `cleanerAccessCodes/{sha256}` | server only | hash only; ACTIVE → USED/REPLACED/REVOKED; 72 h |
| Membership | `organizations/{org}/members/{uid}` | server only | `role: "CLEANER"`, `cleanerId`, `active`, first name, language |
| Link status | `organizations/{org}/cleanerHubAccess/{cleanerId}` | server only | manager-readable; no code, no hash |
| Auth user | Firebase Auth `cleaner-<sha256(org/cleanerId)[0..28]>` | server only | custom token claims `{cleanerHub: {organizationId, cleanerId}}` |

Authorization always comes from the membership document (revocable), never from the
token claims alone. Existing manager checks require `role == "MANAGER"`, so a cleaner
account gets no manager data. No public Offer or checklist bearer token is used as a
cleaner account.

### Rules added (`firestore.rules`)

- `cleanerAgenda/{entryId}`: read only when the caller is an active CLEANER of that
  organization and `resource.data.cleanerId` equals her membership's `cleanerId`.
  No browser writes.
- `cleanerHubAccess/{cleanerId}`: read for active managers. No browser writes.
- Every other path is unchanged; codes stay under the global deny.

### Client choices found by the tests

- Separate named Firebase app (`cleanflow-cleaner-hub`): manager and cleaner sessions
  on one device never replace each other.
- Memory-only Firestore cache: nothing private stays on the phone after closing or
  signing out (the network-only service worker cannot open the app offline anyway).
- `experimentalForceLongPolling`: with transport auto-detection, WebKit kept a stalled
  stream that delivered nothing (and stale one-shot reads); forced long polling fixed it.
- Reconnect on `online` and on returning to the foreground, a 10 s reconnect watchdog
  while stale, and a 60 s server re-check of membership + agenda while visible.

### PWA

`/agenda` swaps the manifest to `public/agenda.webmanifest` (`id`/`start_url`
`/agenda`, scope `/`), so the Home Screen icon opens the cleaner schedule, not the
manager login. The existing service worker is reused (no second worker). iPhone
keeps Home Screen app storage separate from Safari, so the sign-in screen asks to
install first and then type the code inside the installed app (with an explicit
"sign in here in Safari anyway" path).

## Validation (local, 2026-11-03)

| Suite | Result |
|---|---|
| Unit + component (`npm test`) | 129 files / 1,484 tests passed (26 new) |
| Cleaner Hub security, real Firestore/Auth emulators (`security/cleanerHub.test.mjs`) | 9/9 passed |
| Existing manager security (`security/managerAuthorization.test.mjs`) | 84/84 passed |
| Build/runtime/Hosting guards (`node --test scripts/*.test.mjs`) | 42/42 passed |
| E2E, real Hosting/Auth/Firestore/Functions emulators, manager Chromium + cleaners **WebKit iPhone 13** | passed (4 consecutive runs) |
| Same E2E with cleaners on Chromium Pixel 7 | passed |

The E2E drives the **existing manager screens** (create service, assign cleaner,
change date/time, offer + public link, remove from roster, cleaner access panel) and
the Hub; triggers run in the Functions emulator. It covers the mandatory list:
assign → appears; Cleaner B isolated; cross-organization denial (security suite);
reschedule → live update; removal → revoked from agenda and Job view; Offer/interest
separate; reopen keeps session; sign-out clears data; checklist opens; manager
workflow unchanged; WebKit; offline → last confirmed list labelled, then recovers.

Run locally (isolated ports; never touches other running emulators):

```bash
npm run test:cleaner-hub:security
npm run test:cleaner-hub:e2e
```

Not validated: a physical iPhone/Android, Home Screen install on a device, real
Production Auth custom-token signing, Production Firestore listener behaviour.

## Production release requires explicit approval (not done)

The feature cannot be shared from Sandbox: Sandbox Functions are billing-gated, and
enabling billing is out of scope. A real pilot needs these Production changes on
`clean-flow-prototipo`, in this order:

1. **IAM (one binding):** the Functions runtime service account must be able to sign
   custom tokens (`iam.serviceAccounts.signBlob`, i.e. Service Account Token Creator
   on itself). Without it `redeemCleanerAccessCode` fails and no cleaner can sign in.
2. **Firestore rules** from this branch (adds the two read rules above only).
3. **Functions — only the 8 new names:**
   `firebase deploy --only functions:issueCleanerAccessCode,functions:redeemCleanerAccessCode,functions:revokeCleanerHubAccess,functions:openMyChecklist,functions:respondToMyOffer,functions:syncCleanerAgendaOnJobWrite,functions:syncCleanerAgendaOnAssignmentWrite,functions:syncCleanerAgendaOnOfferWrite`
   (Node 22, us-central1, max 20 instances). Existing Functions are not redeployed.
4. **Hosting** from an exact SHA via `npm run hosting:prepare -- <sha> prod`.
   Caution: this branch contains the unreleased notification-reliability client work
   from `codex/development`; either release that first (Codex) or build Hosting from
   a selective port of the Cleaner Hub commits onto the deployed source.
5. Pilot gate: one manager-chosen cleaner, one real Job, observe for a few days.

Rollback: revoke cleaner access in the panel (immediate), redeploy previous rules,
delete the 8 Functions, restore the previous Hosting version. Projection and code
documents are inert without the Functions and rules.

## Known limits

- Cleaners do not get push notifications in V1; the app must be opened.
- Change notices and completed entries accumulate in `cleanerAgenda`; the screen shows
  7/30 days. A Firestore TTL policy (Production config) is a later clean-up.
- The redemption callable has no App Check or rate limit; the 59-bit single-use,
  72 h code is the control.
- Property address and access instructions are deliberately not shown.
- Copy is PT/EN/ES from the approved visual; not reviewed by cleaners yet.
