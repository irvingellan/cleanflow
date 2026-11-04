# Cleaner Hub V1 — cleaner self-service schedule

Status: **PUBLISHED FOR CONTROLLED PILOT** at
[Minha agenda](https://clean-flow-prototipo.web.app/agenda). The release is
`a593daf636024d6830bf89c75bd7f6353b4b759f`, selectively ported onto deployed `b7b0eea`. Hosting version
`53fd5625bddc1d95` (2026-11-04T04:34:01.785Z). Physical iPhone/Android acceptance and
real Production code redemption have not yet been performed.

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
  invalidates the current session, unused codes and still-current Hub-issued
  checklist links. The open app shows "Seu acesso foi encerrado" and clears its
  data. Redeeming a replacement code also invalidates the old session; issuing
  the code alone only replaces unused codes.

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
  `respondToMyOffer` (active cleaner). 8 new Functions; 39 declared in this release tree.

### Identity

| Record | Path | Who writes | Notes |
|---|---|---|---|
| Access code | `cleanerAccessCodes/{sha256}` | server only | hash only; ACTIVE → USED/REPLACED/REVOKED; 72 h |
| Membership | `organizations/{org}/members/{uid}` | server only | `role: "CLEANER"`, `cleanerId`, `active`, first name, language, current session ID |
| Link status | `organizations/{org}/cleanerHubAccess/{cleanerId}` | server only | manager-readable; no code, no hash |
| Auth user | Firebase Auth `cleaner-<sha256(org/cleanerId)[0..28]>` | server only | custom token claims `{cleanerHub: {organizationId, cleanerId, sessionId}}` |

Authorization requires an active, unarchived Cleaner and the latest active
membership session to match the organization, cleaner and session claims. Existing manager checks require `role == "MANAGER"`, so a cleaner
account gets no manager data. No public Offer or checklist bearer token is used as a
cleaner account.

### Rules added (`firestore.rules`)

- `cleanerAgenda/{entryId}`: read only when the caller is an active CLEANER of that
  organization and `resource.data.cleanerId` equals her membership's `cleanerId`.
  No browser writes. Cleaner access to the own membership document requires
  the same current session.
- `cleanerHubAccess/{cleanerId}`: read for active managers. No browser writes.
- Codes and Hub checklist grant tracking stay under the global deny.

### Client choices found by the tests

- Separate named Firebase app (`cleanflow-cleaner-hub`): manager and cleaner sessions
  on one device never replace each other.
- Memory-only Firestore cache: nothing private stays on the phone after closing or
  signing out (the service worker does not make offline cold launches available).
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

## Earlier validation (original functional branch, 2026-11-03)

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

## Production pilot activation

1. The manager chooses one eligible cleaner and one legitimate assigned service,
   opens the cleaner record, and uses **Acesso à Minha agenda → Gerar código**.
   The code is private, single-use and expires after 72 hours. Deliver it
   privately and have the cleaner redeem immediately. Do not record it in QA.
2. On iPhone, open [Minha agenda](https://clean-flow-prototipo.web.app/agenda) in
   Safari, use Share → Add to Home Screen, then open the installed icon and
   redeem there. Android can use its browser install action where available.
3. Confirm the cleaner sees only her own services. Close and reopen the icon,
   open the assigned service and confirm an eligible checklist opens. No
   submission, photo upload, fake assignment, or lifecycle transition is needed.
4. For a lost device, the manager may end access immediately and issue a
   replacement. Redeeming the new code invalidates the prior session. Use
   **Encerrar acesso** before offboarding to revoke Hub-issued checklist links.

The production release verification is recorded in [Current State](CURRENT_STATE.md).
The Hub does not require push. Existing Offer interest and checklist submission
can still generate their normal manager notifications during legitimate use.

## Rollback

For a frontend regression, stop pilot activation and restore Hosting version
`ca43c4b8d74b4712` from the Firebase Hosting release history. Equivalent command
after confirming the live channel still points at the affected release:

```sh
firebase hosting:clone clean-flow-prototipo@ca43c4b8d74b4712 clean-flow-prototipo:live --project clean-flow-prototipo --non-interactive
```

Verify `/version.json` returns `b7b0eeac5374a8ffb072972c671f8803b680a1a0`.
If access isolation is affected, restore the exact prior Firestore ruleset
`229a642c-39e6-49fa-9666-62197de8db37` on `cloud.firestore`. Hosting rollback alone
does not disable callable URLs. A full Hub rollback disables/removes only the
eight new Hub Functions listed above, after exact inventory verification; the
31 existing Functions stay untouched. Remove only the added signer self-binding
after verifying the current policy and that no remaining workload depends on
it. Preserve all existing users and documents. Code rollback does not undo
legitimate operational actions.

## Known limits

- Cleaners do not get push notifications in V1; the app must be opened.
- Change notices and completed entries accumulate in `cleanerAgenda`; the screen shows
  7/30 days. A Firestore TTL policy (Production config) is a later clean-up.
- The redemption callable has no App Check or rate limit; the 59-bit single-use,
  72 h code is the control.
- Property address and access instructions are deliberately not shown.
- Copy is PT/EN/ES from the approved visual; not reviewed by cleaners yet.
