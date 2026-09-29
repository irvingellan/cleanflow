# CleanFlow — Current State

- **Updated:** 2026-09-29
- **Repository:** `main` remains the release source of truth. Manager Fast
  Path V1 (`d2f9a98`) is deployed to Hosting; the earlier photo-diagnostics
  and Cleaner-language release (`766883b`) remains deployed.
- **Production:** Firebase project `clean-flow-prototipo`; live app at
  <https://clean-flow-prototipo.web.app>.

## Current pilot phase

CleanFlow is in a real, gradual Gabi pilot. Gabi uses it for real Jobs while
still keeping her existing operational source in parallel. CleanFlow is not yet
the sole system of record for upcoming work. The immediate goal is learning and
adoption: reduce double entry, represent upcoming work reliably, observe a real
cleaning end to end, and agree with Gabi on an explicit pilot exit criterion.

## Production baseline

- The P0 manager authorization boundary is live. Direct manager access requires
  active organization `MANAGER` membership; the two pilot manager memberships
  were provisioned before release. The live manager smoke test passed and
  anonymous protected access was denied.
- Manager Fast Path V1 is deployed to Hosting from `d2f9a98` (2026-09-29):
  Jobs opens the existing creation form directly with local active-Property
  name/address search, an editable 11:00 time default and Property price
  suggestions; Property Directory has local search. The Job payout prefills an
  editable Offer proposal, with manager confirmation required because it may
  be a team total; an existing Offer snapshot remains authoritative. No
  Functions or Rules changed. Gabi has not yet validated this faster flow on
  her device.
- Production release records confirm manager checklist review, report-link and
  completion paths; public cleaner checklist/offer paths; and the approved
  cleaner-offer compensation snapshot. This confirms availability, not that a
  complete real photo-backed cleaning/report journey has succeeded.
- Hosting includes the deployed cleaner name search, Job guest/notes editing,
  manager-preview/manual-copy Property reminder, mobile photo retry target, and
  audited pre-start rescheduling. Rescheduling is deployed with its Rules and
  `rescheduleJob` Function. Any initial Checklist Run locks schedule changes.
- Cleaner Assignment acknowledgment v0 is deployed. The existing public Offer
  link can record a cleaner's attendance
  acknowledgment on the exact current Assignment; managers see awaiting or
  confirmed. Link possession is not identity verification. This does not alter
  Offer/Job/Assignment lifecycle, payment, or start/completion gates, and legacy
  Jobs without a safe Offer-to-Assignment relationship are not retrofitted.
- The review-handoff notification Function is deployed. Scheduled manager
  reminders use FCM; Irving has received a real reminder on a phone. Gabi's
  delivery/device-registration result remains unresolved and must be checked
  separately. Page-load telemetry is diagnostic only, not an adoption metric.
- OneSignal remains a frozen experiment. Do not resume cutover or delete its
  existing browser integration unless a concrete FCM limitation is observed.
- Required-cleaner-count implementation `b4b35bf` is preserved on
  `hold/required-cleaner-count-2026-09-27`, tested but **not deployed** and
  removed from deployable main. Its hard full-team start policy awaits Gabi
  (see [DEC-039](DECISIONS.md#dec-039--enforce-a-bounded-required-cleaner-count-per-job)).

## Approved communication release

The WhatsApp click-to-chat handoff is integrated into deployable main for
manager-created Cleaner Offers and assigned-cleaner reminder previews. It uses
the existing reviewed message text, opens a prefilled draft for the manager to
manually send, and creates no sent/delivery state. It and Assignment
acknowledgment were deployed from `2630f7a` on 2026-09-27: only `publicOffer`,
Hosting, and the narrow server-owned acknowledgment-field Rules guard. The
existing roster path remains intact without required-count gates. HTTPS,
invalid-token behavior, Function ACTIVE state, and build/asset hashes passed
non-mutating smoke checks. Gabi/cleaner acknowledgment and actual WhatsApp
launch/manual-send behavior remain unvalidated. No WhatsApp API or automatic
sending is involved.

The Cleaner preferred-language boundary is deployed with `publicOffer`,
`publicChecklist`, and Hosting from `766883b` (2026-09-28), awaiting real
Gabi/cleaner validation. Generated Offer/reminder text and initial public
Offer/Checklist locale use only the allowlisted Cleaner preference, falling
back to English when missing or invalid; manager UI language remains
independent. Public projections include only the language code, and Property
free text remains verbatim.

## Real-use evidence

- Gabi has created real Jobs in CleanFlow. Selected real Properties from her
  Notion Property Directory were imported after explicit selection and preview;
  obvious duplicate Property records from that import were reconciled while
  preserving operational history. The broader upcoming-Job/Cleaner and
  system-of-record transition is incomplete. Do not describe the import as
  either “none” or a completed migration.
- Real cleaners have opened checklist links and entered checklist data. This is
  real use, but not proof of a reliable complete journey.
- The cleaner checklist supports JPEG, PNG, and WebP up to the current 5 MB
  limit; HEIC/HEIF is unsupported and the UI explains the supported formats.
  Token-free photo failure diagnostics are deployed, but the real mobile
  photo-upload failure remains unresolved. Do not claim resizing, retry
  guidance, or diagnostics resolved it.
- Irving's scheduled FCM receipt is confirmed; Gabi's reminder delivery remains
  a separate device/registration validation question.
- Astra read-only Runs A, D, and E and the Project X-Ray review are candidate
  audit evidence preserved in Issue #27. They are **not** a consolidated,
  approved implementation plan.

## Unresolved blockers / validation

- Capture the real photo-upload failure stage and safe error details, then
  observe one real cleaning through saved checklist, required evidence,
  manager review, report use, and completion. Until then, the full pilot flow
  is not proven reliable.
- Photo diagnostics correlate bounded browser/server stages and outcomes
  without checklist tokens or file contents. Browser-side evidence cannot be
  delivered while offline, and no real failure has yet been captured after
  this deployment; the cause remains unknown.
- Reduce double entry by reconciling upcoming work against Gabi's authoritative
  source. Define an explicit pilot exit criterion with her; do not assume the
  parallel-use period ends automatically.
- Validate Gabi's FCM device registration/delivery separately from Irving's
  successful reminder receipt. Do not force-run reminders or send test pushes.
- The owner report is a product hypothesis with external interest, not a
  roadmap commitment. Test value by using reports with owners and observing
  whether they value/open them.
- If Gabi is blocked in real work because a Checklist Run was created before a
  schedule change, revisit the current rescheduling lock with the smallest safe
  change. Otherwise keep the lock.
- Legacy and Assignment-aware Job paths are maintenance debt, not a reason for
  immediate cleanup. Before migration/removal, inventory real records, verify
  backup, identify history/monetary dependencies, and validate real operation
  for a short period.
- Consider resizing only if captured errors point to size/format; add more
  owner-report photos only after one-photo reliability; revisit capability
  consolidation before adding another link type. Do not treat these as current
  implementation tasks.

## Deployment holds

- **Required cleaner count (`b4b35bf`):** implemented/tested and preserved on
  `hold/required-cleaner-count-2026-09-27`, not in deployable main or production.
  Reviewed **KEEP AS-IS** technically. Ask Gabi: “If a
  cleaning needs 3 cleaners and only 2 are available/show up, should CleanFlow
  block starting the service, or warn you and allow a manager override?” The
  hard-block policy is awaiting her validation, not rejected. Do not reintegrate
  it until that decision and any needed adjustment are reviewed.
- No OneSignal reminder-provider cutover is approved. FCM remains the scheduled
  reminder default.

## Pilot Evidence Gate

Pilot learning/adoption, not feature count, is the optimization target
([DEC-040](DECISIONS.md#dec-040--pilot-evidence-gate)). Build
now for a real production blocker, a direct repeated Gabi workflow need, or a
validated requirement with a bounded implementation. For hypotheses, run the
cheapest useful experiment first; park speculative expansion until real-use
evidence supports it. Keep necessary privacy/security boundaries; do not weaken
them to ship faster, and do not add proactive hardening without a concrete
failure or risk.

An implementation review does not validate a product rule. Track
**implemented**, **deployed**, **validated by Gabi**, and **proven in real use**
as distinct states.

Manager page-load events remain useful diagnostics but do not measure adoption
or product success. Pilot Evidence V0 is available as the one-cleaning
[observation checklist](PILOT_OBSERVATION_CHECKLIST.md) and the local,
read-only `scripts/pilotScorecard.mjs` aggregate command. Example:
`node scripts/pilotScorecard.mjs --project <project-id> --from YYYY-MM-DD --to YYYY-MM-DD [--expected-jobs N] [--allow-production-read]`.
It includes only Jobs with explicit `dataProvenance: REAL`; absent/UNKNOWN and
DEMO Jobs are excluded. Timestamp events use UTC dates, while `scheduledDate`
uses its stored date-only value. Completion requires `completedAt`; older
completed Jobs without it cannot be dated. Report opens are not recorded, and
report-link replacement history is not fully measurable. The command was not
run against production while implementing this slice; it performs reads only
and requires the existing Application Default Credentials plus an explicit
production-read acknowledgement for `clean-flow-prototipo`.

Experiment before building persistent Cleaner Hub/My Jobs, owner-as-customer or
report-value assumptions, iCal versus AI intake, and deeper team-Job execution.
Park advanced financial/payroll and invoice/payment architecture,
payout-provider research, marketplace/network, broad AI assistant, and
speculative integrations.

Current evidence priorities:

1. Capture the real photo failure and complete one observed real cleaning.
2. Reconcile upcoming work and agree the pilot exit criterion with Gabi.
3. Resolve the required-cleaner start policy and Gabi's reminder-delivery
   validation.
4. Test the owner-report hypothesis and gather only the scorecard signals
   needed to evaluate adoption.

## Fresh-session resume

1. Read this checkpoint, then the active GitHub Issue.
2. Read only the relevant source-of-truth docs and current implementation.
3. Prefer current code, deployment records, and recent pilot evidence over
   stale issue text or chat memory.
4. Preserve `.maestri/`, the Issue #36 import-preview stash, and local real
   export files. Do not access or alter production unless explicitly scoped.
