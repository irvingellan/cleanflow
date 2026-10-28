# Visual Studio round — Codex integration handoff

Date: 2026-10-27. Branch `feature/gabi-visual-studio` (local, not pushed), based on
`feature/manager-workspace-v3-prototype` @ `1a0e38c`.

This round extends the synthetic Manager Workspace V3 prototype
(`src/prototypes/manager-workspace-v3/`). **Nothing here talks to Firebase.** Every
screen runs on one invented state (44 jobs, 15 properties, 10 cleaners). Port the
presentation into `src/features/*`; do not import the prototype from Production
code (a test enforces this).

Split of work: Claude owns the visual layer below. Codex owns persistence, rules,
Functions, push delivery and deploy.

## 1. What was added

| Area | Prototype files | Status |
|---|---|---|
| Co-design workshop ("massinha") | `studio/studioModel.js`, `studio/Studio.jsx` | Design tool only. Never ship to operators. |
| Notification Center | `flows/Inbox.jsx`, `model/notificationModel.js`, `contracts/notificationCenter.ts` | UI ready; **needs backend history** |
| Simulated push banner | `flows/Inbox.jsx` (`PushBanner`) | Demo only |
| Account & Settings | `flows/AccountSettings.jsx` | UI ready; sign-out/profile/feedback/support simulated |
| Cleaner batch photo upload | `cleaner/PhotoBatch.jsx`, `cleaner/CleanerViews.jsx` | UI ready; upload queue must call the real Storage path |
| Submission states stepper | `cleaner/PhotoBatch.jsx` (`SubmissionSteps`) | UI ready; needs `workDone` + approval fields |
| Returning cleaner on an answered offer | `cleaner/CleanerViews.jsx` (`CleanerOffer`) | UI ready; needs response time + assignment visibility rules |
| Sent offers: payout summary, reply status, WhatsApp | `flows/OperationalSheets.jsx` (`OfferComposer`) | WhatsApp open is simulated |
| Checklist template editor | `flows/SetupSheets.jsx` (`PropertySheet`, `TemplatePreview`) | **needs template versioning model** |
| Reminder message scope | `flows/OperationalSheets.jsx` (`ReminderSheet`) | Copy + rule proposal |
| Reservation Changes concept | `flows/ReservationChanges.jsx` | Future concept, not for implementation now |

## 2. Components and props

TypeScript props live in `contracts/notificationCenter.ts`. Summary:

- `NotificationCenter({ initialId?, split? })` — list + detail. `split` = side by side (desktop).
- `NotificationRow({ notification, selected?, onSelect })`
- `NotificationDetail({ notification, onBack?, onOpenJob })`
- `DeliveryTimeline({ notification })` — five steps: created, targeted, accepted, displayed, opened.
- `CategoryBadge({ category })` — "Live today" vs "Proposal".
- `DeviceStatusCard({ onSettings? })`
- `AccountSheet({ onClose, section? })` — sections `account | preferences | notifications | help | advanced`.
- `PhotoPicker({ lang, photos, future, onCancel, onAdd })`, `UploadQueue({ job, lang })`,
  `QuotaLine({ photos, lang, future, onToggleFuture? })`, `SubmissionSteps({ job, lang, missingCount })`.
- `TemplatePreview({ sections, lang })`.

Pure logic worth porting with its tests:

- `notificationModel.js`: `deliverySteps`, `filterNotifications`, `categoryOf`, `CATEGORIES`.
- `PhotoBatch.jsx`: `quotaOf`, `rejectReason`, `submissionSteps`, `LIMITS`.

## 3. Backend contract needed (Codex)

### 3a. Notification history (missing today)

Production sends three pushes (cleaner interested, assignment confirmed,
checklist received) and stores **no history**. The inbox needs one record per
notification per manager — see `ManagerNotification` in the contract file:

- organization-scoped, recipient-scoped, i18n keys + params (not rendered text);
- `jobId` deep link;
- `read`, plus an "opened from push" marker that does **not** mark it read;
- delivery evidence: targets, provider accepted, device-confirmed display, opened.

Rules: a manager reads only their own organization's notifications; cleaners
never read manager notifications; writes come from server code only.

### 3b. The two observed defects

1. **"New Notification" with no content** — the payload the device renders must
   always carry title and body. Record device-side display evidence so the UI can
   show "displayed" only when confirmed.
2. **Second manager phone goes silent after another device is enabled** — enabling
   a device must add a registration, never replace another one. Expose a per-device
   "last successful send" so the UI can show `silent`.

The UI only *surfaces* these. It does not fix them.

### 3c. Preferences and permission

`NotificationSettings.prefs` per category. Turning a category off stops the
push but **keeps** the inbox entry. Browser permission is per device and read
client-side. Diagnostics never return or show tokens.

### 3d. Checklist photos

Keep the current server limits (20 photos, 50 MiB total, 5 MiB each, no HEIC).
The UI's "simulate 50 photos" toggle is a design question, **not** a supported
limit. The queue uploads one photo at a time; each queued photo must count
against the limit; removing a draft photo must delete or release the stored
object. "Retry" re-queues only failed photos.

### 3e. Submission and completion states

The stepper keeps apart: draft saved, photos saved, evidence missing / ready,
submitted, physically done (cleaner's "work done" confirmation), formally
completed (manager). Formal completion stays a manager action; there is no
automatic completion.

### 3f. Offers

A returning cleaner sees her own answer and time, plus one of three live
statuses: still deciding / confirmed for you / filled. "Filled" must never
reveal who was assigned or who else was offered. Interest never assigns.

### 3g. Checklist templates

New per-item fields: `optional`, `allowNa`, `photo`, `photoHint` (per language),
`note` (per language). Saving creates a new version; a checklist that already
started stays pinned to its version. The cleaner runtime does **not** yet honour
`optional`/`allowNa` in the prototype — only the editor and preview do.

### 3h. Access codes

The reminder never includes the access code, full address or other offers. The
code shows only inside the checklist, to the assigned cleaner, from 2 hours
before the start (proposal), with each view audited.

## 4. States to implement

| Surface | States |
|---|---|
| Inbox | ready, loading, error (retry), empty, empty filter, offline (stale copy) |
| Notification detail | unread → read on open; "opened from push" kept until read; mark unread |
| Delivery step | done, failed, unknown, not tracked |
| Permission | granted, default (offer to enable), denied (explain) |
| Device | ok, silent |
| Photo | queued, uploading (progress), saved, failed (retry), removable while draft |
| Picker | rejected HEIC, rejected >5 MB, photo limit reached, MB limit reached |

## 5. Tests that exist

`npm run prototype:v3:test` — 51 tests, including:

- workshop model: move, step, hide/restore to original position, rename/un-rename,
  decisions, undo/redo, reset, export/import, import sanitising;
- notification model: categories, ordering, filters, delivery honesty, push-open keeps unread;
- batch upload: limits, rejections, quota, retry-only-failed, remove frees slot, state separation;
- UI journeys: tap push → job → reopen from inbox → job; returning cleaner; phone focus handling.

Full repository suite on this branch: 132 files, 1,462 tests passed.

## 6. Implemented vs simulated

| Real in Production today | Simulated in this prototype |
|---|---|
| 3 push types | Notification history, delivery evidence, push banner |
| Checklist photo limits 20 / 50 MiB / 5 MiB | 50-photo limit option |
| Offer links and interest response | Opening WhatsApp, "filled" status wording |
| — | Sign-out, profile edit, feedback, support, device test |
| — | Template optional/N/A/photo guidance/notes and versions view |
| — | Reservation changes inbox |

## 7. Not done

- Figma: the Figma connector was not authorised in this session, so no Figma file
  was written. See `FIGMA_HANDOFF.md`.
- No operator has reviewed this round. Nothing here is "approved".
- PT/ES copy not reviewed by native-speaking operators.
