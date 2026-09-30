# CleanFlow — Pilot Legacy Compatibility & Migration Audit (2026-09-29)

- **Baseline:** `main` = `origin/main` = `d13194e` (clean). Audit branch:
  `audit/pilot-legacy-compatibility-2026-09-29`. The Notification Lab branch
  (`feature/notification-lab-v1-2026-09-29`, `e8d6f09`) was not read, modified,
  or merged.
- **Production access:** one bounded, read-only shape inventory of
  `clean-flow-prototipo` (organization `cleanflow-demo`) on 2026-09-29, plus one
  read-only run of the new aggregate command. No writes, deploys, link creation,
  token rotation, or migrations.
- **Privacy:** this document contains aggregate counts, dates, and record
  *shapes* only. It contains no document IDs, names, addresses, phone numbers,
  access information, tokens/hashes, checklist answers, notes, or photo data.
- **Question answered:** why do newer real Jobs appear to behave better than
  older real Jobs, and which data shapes must CleanFlow support, migrate, or
  retire?

---

## 1. Executive Summary

1. **The Job document is not the difference.** All 32 REAL Jobs are
   `schemaVersion: 2`, created with the same Job-document shape. There are
   **zero** REAL legacy/singular-cleaner Jobs, **zero** roster/Assignment
   mismatches, **zero** COMPLETED Jobs without `completedAt` (0 of 15 across all
   provenance), **zero** invalid/missing `checklistContextRevision` on REAL
   Jobs, and **zero** Jobs without a canonical, existing `propertyId`.
2. **The difference is workflow generation carried in child records.** Older
   REAL Jobs (created 2026-09-22/23) carry artifacts of pre-Fast-Path-V2
   operation that newer Jobs do not:
   - a Checklist Run created at assignment time on **9 of 9** operational Jobs
     (vs 4 of 10 created 09-28 and 0 of 4 created 09-29);
   - Offers without a compensation snapshot (16 of 17);
   - Assignments without the `source` field (handled correctly by code).
3. **An early Run changes which actions exist.** A Run closes the no-checklist
   completion path, locks rescheduling, and binds the cleaner link to the Job
   context revision at issue time. Until the DRAFT-abandonment release late on
   2026-09-29, a v2 Job whose Run never received the required photo **had no
   completion path at all**. That is exactly the older-Job population.
4. **Newer Jobs have mostly not been exercised yet.** Every operational Job
   created on 2026-09-29 is scheduled 2026-10-04 or later, has no Run, and has
   not reached checklist, photo, completion, or report. Gabi's observation is
   **supported but confounded**: part of "works better" is simply "has not
   reached the risky step."
5. **No P0 code compatibility defect was found.** Current code has an explicit
   path for every REAL record shape present. The P0 is operational: **5 REAL
   Jobs are past their service date, still `ASSIGNED`, with a DRAFT Run**
   (4 with 41–56 saved draft revisions but no photo; 1 never opened). A 6th,
   the confirmed stale-link Job, becomes past-due after its 2026-09-29 service
   date. These need a per-Job manager decision, not a migration.
6. **Nothing should be backfilled.** No backfill is required for correctness,
   and several are unsafe (compensation, `completedAt`, Assignment history).
7. **Real defects are in legacy-only read paths that hide current data**, not
   in old data breaking new code. Cleaner history queries only
   `assignedCleanerId`, so all REAL Jobs are invisible there. The pilot
   scorecard counts archived REAL Jobs.
8. **The confirmed stale-link incident** (DRAFT kept, answers preserved, link
   issued at revision 1, Job at revision 3 after the same Cleaner was removed
   and re-added) is **expected safety behavior with a missing warning**. The
   "Remove cleaner" action has no confirmation and does not mention that it
   invalidates an active checklist link.

---

## 2. Why newer Jobs differ from older Jobs

Operational (non-archived) REAL Jobs by creation cohort:

| Cohort (created) | Operational | With a Run | Open with a Run | Past-due open | Completed | Offers w/o amount snapshot | Assignments w/o `source` | Direct Assignments | Service dates |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 2026-09-22/23 | 9 | **9** | 6 | 4 (+1 on 09-29) | 3 | **16 / 17** | 10 / 12 | 0 | 09-22 → 09-30 |
| 2026-09-28 | 10 | 4 | 2 | 1 | 2 | 0 / 11 | 8 / 11 | 2 | 09-28 → 10-11 |
| 2026-09-29 | 4 | **0** | 0 | 0 | 0 | 0 / 3 | 0 / 4 | 2 | 10-04 → 10-15 |

The earliest REAL Jobs (created 09-09 and 09-12) are all archived.

What actually differs, in order of operational weight:

1. **Early Checklist Runs (dominant).** Before Manager Fast Path V2
   (`5f14d63`, deployed 2026-09-29), a manager created the Run explicitly.
   Production timestamps show Runs created **0–7 minutes after assignment** on
   most older Jobs. After V2, a Run is created lazily, only when a checklist
   link is bundled into a reminder, or never. Once a Run exists:
   - no-Run completion is refused (`functions/src/jobCompletionService.js:13-64`,
     reason `checklist-run-exists`); the Job Detail completion button is hidden
     (`src/features/jobs/JobDetail.jsx:1228-1272`);
   - rescheduling is locked (`functions/src/jobScheduleService.js`, DEC-029;
     `JobDetail.jsx:358-371`);
   - the cleaner link is bound to the Job's `checklistContextRevision`, so any
     later roster change makes it STALE
     (`functions/src/checklistCapabilityService.js:46-58`).
2. **Completion availability depended on action date, not creation date.**
   Completion paths for v2 Jobs:
   - until 2026-09-29, the **only** path was READY_FOR_REVIEW (requires the
     photo) followed by approval (`checklistRunService.js:171-213`);
   - V2 added no-Run completion;
   - `086a432` added explicit DRAFT abandonment + completion.

   Older Jobs whose photo never arrived were therefore stuck until the
   evening of 2026-09-29.
3. **Offer amount snapshots.** Offers created before the `d8a67d5` deploy
   (2026-09-24) have no `offeredCompensation`. On v2 Jobs the public Offer
   correctly shows "Amount not set / To be agreed". It never falls back to the
   Job-level payout (`functions/src/index.js:419-468`). This is visible but
   correct.
4. **Assignment `source`.** Offer-sourced Assignments created before V2 have no
   `source` field. Presentation, acknowledgment, and reminder paths key off
   `sourceOfferId` (`src/features/jobs/assignmentPresentation.js:36-53`,
   `functions/src/publicOfferAssignmentAcknowledgment.js`), so behavior is
   identical.
5. **New-generation-only shape.** 2 Jobs created 2026-09-28 received a
   manager-direct Assignment on 2026-09-29, while the same Cleaner's Offer
   link from 2026-09-28 is still `PENDING` and unexpired (§6, F4). This is the
   one ambiguity introduced by the *newer* workflow.

**Not explanations:** `schemaVersion` (v2 everywhere); `requiredCleanerCount`
(never deployed, absent from all records); Job create fields (unchanged since
09-25 except the 11:00 start-time default of 09-29); report-link UI changes
(`3a7ad54`, UI only); rescheduling (never used on a REAL Job, 0
`scheduleHistory` records).

**UNKNOWN:**
- which specific Jobs Gabi experienced as "giving bugs";
- whether her remark preceded the DRAFT-abandonment release;
- why the same Cleaner was removed and re-added on the confirmed stale-link Job.

---

## 3. Model Evolution Timeline (behavior-relevant only)

| Date (commit → deploy) | Change | Records created before it | Current handling |
|---|---|---|---|
| 08-27 `eea1229` | Versionless Job; singular `assignedCleanerId/Name`; Job-level `cleanerPayout`; Offer doc keyed by cleaner; legacy payouts | v0 | Read as schema 0 (`jobCompatibility.js:57-61`); legacy assign/start (`jobService.js:433-521`); legacy payout eligibility (`payoutService.js:44-53`) |
| 08-29 `fcb027e` | `schemaVersion: 1` marker (deploy UNKNOWN) | v0 | v1 stays on the singular path |
| 08-31 `832811b` → by 09-19 | **New Jobs write `schemaVersion: 2`**, `assignedCleanerIds`, `assignments` subcollection; legacy assign/start blocked for v2 | no roster; never retrofitted (DEC-027) | `getAssignedCleanerIds` returns `[]` below v2 |
| 09-08 `5528f14` | `dataProvenance: "REAL"` on create | absent → UNKNOWN (or DEMO by marker/ID prefix) | `src/lib/dataProvenance.js` |
| 09-09 `77e7df2` | `archivedAt` / restore | — | truthiness checks; archive advances context revision |
| 09-19/20 `d25fc75…f008e79` | Checklist Run, draft, evidence, capability bound to `checklistContextRevision` | missing revision reads as 0 | `checklistContextRevision.js`; rules helper |
| 09-23 `3b62545` | Approval completion (only v2 completion path until 09-29) | — | `checklistRunService.js:171-213` |
| 09-23 `2f17629` | Client report capability (7 days) | — | requires READY_FOR_REVIEW + saved photo |
| 09-24 `d8a67d5` | Per-Offer `offeredCompensation` snapshot | no snapshot | v2 → "not set"; v0/v1 → legacy Job payout fallback |
| 09-25 `895514e` → 09-26 | Audited reschedule; locked once any Run exists | missing `scheduleRevision` = 0 | `jobScheduleService.js` |
| 09-27 `c5b3f84` | Assignment acknowledgment via the Offer link | — | only when the Assignment's `sourceOfferId` is that Offer |
| 09-28 `672e901` | Cleaner `preferredLanguage` drives cleaner-facing text | missing → English | all active REAL Cleaners have an allowlisted value |
| 09-29 `d2f9a98` | Fast Path V1 (11:00 default start, v2 Offer amount prefill) | — | — |
| 09-29 `5f14d63` | **Fast Path V2:** `source: "OFFER" \| "MANAGER_DIRECT"`, direct Assignment, no-Run completion, lazy Run via bundled reminder, browser completion removed | Assignments without `source` | first V2-shaped production record: 2026-09-29 afternoon (LA) |
| 09-29 `086a432` | DRAFT → `ABANDONED` + completion; guided reissue of stale DRAFT links | — | 0 ABANDONED Runs in production at audit time |

Stale documentation found: `docs/DATA_MODEL.md` said new Jobs write
`schemaVersion: 1` and that rescheduling was "not merged or deployed". Both
are corrected on this branch.

---

## 4. Real Production Compatibility Inventory

Snapshot: 2026-09-29 (America/Los_Angeles). One organization. 72 Jobs:

- **32 REAL**;
- 24 DEMO;
- 16 UNKNOWN.

The app's provenance helper classifies `dashboard-demo-*` IDs as DEMO.
Also present: 28 Properties (15 REAL, 4 of them archived), 20 Cleaners,
9 payout records.

### REAL classes (actually observed)

| # | Class | Count | Dates | Current code path | Compatibility | Migration safety | Operational risk |
|---|---|---:|---|---|---|---|---|
| R1 | v2, open, upcoming, **no Run** | 10 | created 09-28/29; service 10-01 → 10-15 | Fast Path V2 (Offer or direct Assignment; lazy Run; no-Run completion) | SUPPORTED_EXPLICITLY | nothing to migrate | low |
| R2 | v2, COMPLETED via checklist review (READY + photo, `completedAt`) | 5 | service 09-22 → 09-28 | approval completion; 4 active 7-day report links | SUPPORTED_EXPLICITLY | DO_NOT_TOUCH | low |
| R3 | v2, **past-due** `ASSIGNED`, DRAFT with saved answers, **no photo**, link ACTIVE | 4 | service 09-23 (3), 09-28 (1) | DRAFT → abandon+complete, or photo → READY → approve | DEGRADED_BUT_SAFE | MANAGER_CONFIRMATION_REQUIRED | **high:** open work that probably happened |
| R4 | v2, **past-due** `ASSIGNED`, DRAFT never opened, link EXPIRED | 1 | service 09-23 | reissue, or abandon+complete, or archive | DEGRADED_BUT_SAFE | MANAGER_CONFIRMATION_REQUIRED | medium |
| R5 | v2, DRAFT with 44 saved revisions, link **STALE (revision 1 vs Job 3)** after the same Cleaner was removed and re-added | 1 | service 09-29 | reissue for the same Cleaner (keeps answers) or abandon+complete | SUPPORTED_EXPLICITLY (safety behavior) | DO_NOT_TOUCH the Run | medium |
| R6 | v2, upcoming, **early Run** (1 untouched with no link; 1 with ACTIVE link from a bundled reminder) | 2 | service 09-30, 10-01 | schedule locked; completion only via checklist or abandon | DEGRADED_BUT_SAFE | LEAVE; SUPPORT_IN_CODE only if Gabi is blocked | low–medium |
| R7 | v2, manager-direct Assignment beside the same Cleaner's unexpired **PENDING** Offer | 2 | service 10-01, 10-07 | cleaner can still answer the Offer; a decline does not unassign; no acknowledgment possible | DEGRADED_BUT_SAFE | LEAVE; manager awareness | low–medium |
| R8 | **archived** v2 with READY_FOR_REVIEW + saved photo, on an archived Property | 1 | service 09-23 | approval refused while archived | MANAGER_REVIEW_REQUIRED | MANUAL_EXCEPTION | low (possible real work hidden) |
| R9 | archived v2, other | 8 | created 09-09 → 09-29 | archive/restore; 2 still have unexpired PENDING/INTERESTED Offer links that the public Offer page still serves | SUPPORTED (link DEGRADED) | LEAVE_AS_HISTORY | low |

R1–R7 are the 23 operational (non-archived) REAL Jobs: 18 `ASSIGNED`,
5 `COMPLETED`. R5 counts as upcoming on 2026-09-29, so the aggregate command
reports 5 past-due that day, not 6. **REAL Jobs needing manager review today:
6 (R3 + R4 + R8), plus R5 from 2026-09-30.**

### REAL child-record generations (overlap the Job classes)

| Class | Count | Handling | Decision |
|---|---:|---|---|
| v2 Offer without `offeredCompensation` (pre-09-24) | 16 of 31 | "Amount not set"; never inferred from the Job | LEAVE_AS_HISTORY |
| Offer-sourced Assignment without `source` (pre-V2) | 18 of 27 (1 inactive) | via `sourceOfferId` | SUPPORT_IN_CODE (already) |
| `source: "OFFER"` / `"MANAGER_DIRECT"` | 5 / 4 | explicit | — |
| Assignment acknowledged | 2 | explicit | — |
| Cleaner links on completed Jobs (STALE/EXPIRED by design) | 5 | cleaner view returns 410 | DO_NOT_TOUCH |
| Cleaner-touched Runs with a saved photo | 6 of 11 | — | evidence for the open photo issue |

### Non-REAL classes

| Class | Count | Handling | Decision |
|---|---:|---|---|
| Versionless or v1 legacy Jobs, all archived (DEMO/UNKNOWN), created 08-21 → 08-29 | 35 | legacy views; archived | LEAVE_AS_HISTORY |
| …of which COMPLETED, payout-linked (`payoutId`, `completedAt` present) | 10 | legacy payout history; 9 payout records (UNKNOWN provenance) | **DO_NOT_TOUCH** |
| archived non-REAL v2 | 4 | archived | LEAVE_AS_HISTORY |
| **non-archived DEMO v2 `UNASSIGNED` on an archived Property**, DRAFT Run, service 09-22 | 1 | hidden from Dashboard; **visible in the Jobs worklist** as past-due | ARCHIVE_CANDIDATE (manager confirms) |

### Hypothesized classes not present (count 0)

- REAL legacy single-cleaner Job;
- v2 Job carrying legacy cleaner fields;
- roster vs active-Assignment mismatch;
- `ASSIGNED` without an active Assignment;
- non-archived REAL `OFFERED` after its service date;
- COMPLETED without `completedAt`;
- missing or invalid context revision (REAL);
- missing `propertyId`;
- active REAL Cleaner without `preferredLanguage`;
- any `scheduleHistory` (rescheduling never used);
- frozen Run schedule differing from the Job (14 of 14 match);
- Assignment schedule copies differing from the Job (27 of 27 match);
- ABANDONED Run;
- `requiredCleanerCount`;
- name-only legacy Job.

---

## 5. Compatibility Matrix

Key:
- ✓ SUPPORTED_EXPLICITLY
- L SUPPORTED_BY_LEGACY_PATH
- F SUPPORTED_BY_FALLBACK
- D DEGRADED_BUT_SAFE
- M MANAGER_REVIEW_REQUIRED
- X INCOMPATIBLE
- — not applicable

| Class | Job Detail / Jobs list | Offer create / public Offer | Roster (Offer or direct) | Reminder (+ link) | Cleaner checklist link | Completion | Client report | Reschedule | Archive / restore | Cleaner history | Dashboard | Payout |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 upcoming, no Run | ✓ | ✓ | ✓ | ✓ (creates Run lazily) | ✓ | ✓ (no-Run) | — | ✓ | ✓ | **X** | D (count, not name) | X (v2 payouts planned) |
| R2 completed | ✓ | ✓ unavailable | ✓ locked | — | ✓ STALE by design | ✓ done | ✓ | ✓ locked | ✓ | **X** | D | X (planned) |
| R3 past-due DRAFT, no photo | ✓ | ✓ | D (a change stales the link) | D | ✓ ACTIVE | **M** (abandon or photo) | — until READY | D locked | ✓ | **X** | ✓ | X |
| R4 past-due untouched, expired | ✓ | ✓ | D | D | ✓ reissue | **M** | — | D locked | ✓ | **X** | ✓ | X |
| R5 stale revision | ✓ | ✓ | D | ✓ reissue | ✓ STALE → reissue | M | — | D locked | ✓ | **X** | ✓ | X |
| R6 early Run | ✓ | ✓ | D | ✓ (reuses Run; replace warning) | ✓ | D (checklist or abandon only) | — | **D locked** | ✓ | **X** | D | X |
| R7 direct + open Offer | ✓ | **D** (cleaner can still answer) | ✓ | ✓ (no acknowledgment link) | ✓ | ✓ | — | ✓ | ✓ | **X** | D | X |
| R8 archived + READY | ✓ archived | — | — | — | STALE | **M** (restore, then approve) | D (server does not gate on archive) | — | ✓ | **X** | ✓ excluded | X |
| R9 archived other | ✓ | **D** (2 links still served) | — | — | — | — | — | — | ✓ | **X** | ✓ excluded | — |
| Offer without snapshot (v2) | ✓ | ✓ "not set" | — | — | — | — | — | — | — | — | — | never inferred |
| Assignment without `source` | L | L (acknowledgment via `sourceOfferId`) | ✓ | L | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| Legacy v0/v1 archived | L | L (payout fallback; OFFERED only) | L | L | F (`assignedCleanerId`) | ✓ (server paths are schema-agnostic) | — | ✓ | ✓ | L | ✓ excluded | **L** (history) |
| DEMO on archived Property | D (listed as past-due) | — | — | — | — | — | — | — | ✓ | — | ✓ excluded | — |

Evidence for the X/D cells:

- **Cleaner history** — `getCleanerJobHistory` queries only
  `assignedCleanerId` (`src/features/jobs/jobService.js:308-349`), which v2
  Jobs never write, so every REAL Job is missing from Cleaner Detail.
- **Dashboard names** — cleaner names are resolved only from
  `assignedCleanerId` (`src/features/dashboard/dashboardService.js:248-253`),
  so v2 rows show "1 cleaner assigned" (`assignmentPresentation.js:5-33`).
- **Payout** — `isEligibleForLegacyPayout` excludes v2 by design
  (`src/features/payouts/payoutService.js:44-53`).
- **Public Offer** — the server does not check `archivedAt`
  (`functions/src/index.js:368-386`).
- **Client report creation** — does not gate on archive
  (`functions/src/clientReportService.js`).

---

## 6. Confirmed Old-Data Failure Modes

| # | Record shape | Code path producing the behavior | Do newer records avoid it? | Nature |
|---|---|---|---|---|
| F1 | v2 `ASSIGNED` + Run created at assignment | no-Run completion refused; completion button hidden; reschedule locked (§2) | **Mostly:** V2 creates Runs lazily. A bundled reminder sent days early recreates the same lock (R6) | stale historical state + expected safety behavior; completion unblocked by `086a432` |
| F2 | past-due DRAFT, 41–56 saved revisions, **0 evidence**, ACTIVE link (4 Jobs) | READY handoff requires the frozen photo (`checklistCapabilityService.js:419`, `checklistDraftReviewRequirements`) | **No.** Newer Jobs have not reached this step | unknown root cause (the unresolved photo failure: 5 of 11 cleaner-touched Runs lack a photo) + stale historical state |
| F3 | link at revision 1, Job at revision 3 after same-Cleaner remove + re-add | revision check (`checklistCapabilityService.js:54`); every roster change advances the revision (`assignmentService.js`); **Remove cleaner acts in one click with no warning** (`JobDetail.jsx:648-660, 1444-1455`) | **No.** Adding a second Cleaner has the same effect on any Job | expected safety behavior + manager workflow issue |
| F4 | direct Assignment beside the same Cleaner's PENDING Offer link | public Offer is valid for v2 `ASSIGNED` (`index.js:368-386`); acknowledgment needs a matching `sourceOfferId` (fails closed) | **No, newer-only** (V2) | manager workflow issue |
| F5 | any v2 Job (100% of REAL) | Cleaner history and Dashboard name lookup read only `assignedCleanerId` | **No, newer records are the affected ones** | code compatibility bug (legacy-only read path) |
| F6 | v2 Offer without an amount snapshot (16) | projection returns `null` → "Amount not set" | yes (since 09-24) | expected behavior (DEC-030/DATA_MODEL) |
| F7 | archived Job with an unexpired Offer link (2) | `offerState` has no archive check | no | minor code gap; the links expire by about 10-06 |
| F8 | archived REAL Jobs (9) | `scripts/pilotScorecardCore.mjs` filters provenance only | no | tooling bug: inflates created/scheduled/offer counts |

Confirmed-incident detail (F3). The cleaner saved 44 revisions over about
35 minutes. About 20 minutes later the manager removed and re-created the
same Cleaner's Assignment (the old one had no `source`; the new one has
`source: "OFFER"`). The link then became STALE by design. The Run is still
DRAFT and nothing was lost. Recovery is either:
- reissue for the same Cleaner (DEC-041); or
- abandon + complete.

Disproven hypotheses:
- completed Jobs without `completedAt`;
- legacy `assignedCleanerId` vs Assignment mismatch;
- Job status vs roster disagreement;
- OFFERED after work;
- no Assignment despite work;
- missing Cleaner language;
- schedule snapshot mismatch;
- legacy payout fields blocking normalization (payout-linked records are all
  archived and non-REAL).

---

## 7. Safe Migration / Leave-Alone Matrix

| Class | Decision | Rationale |
|---|---|---|
| R1, R2 | DO_NOT_TOUCH | current and correct |
| R3, R4 (5 past-due) | **MANAGER_CONFIRMATION_REQUIRED** | Whether the work happened, and whether a truthful photo can still be taken, is known only to Gabi |
| R5 stale link | MANAGER_CONFIRMATION_REQUIRED (reissue vs abandon) | DO_NOT_TOUCH the Run or draft outside app actions |
| R6 early Run | LEAVE (SUPPORT_IN_CODE only if a reschedule is actually blocked) | DEC-029 lock is intentional; no REAL reschedule has occurred |
| R7 direct + open Offer | LEAVE; manager awareness | withdrawing or rewriting an Offer would alter history |
| R8 archived + READY | MANUAL_EXCEPTION (manager decides: duplicate → leave archived; real work → restore + approve) | never auto-restore |
| R9 archived | LEAVE_AS_HISTORY | — |
| Offers without snapshot | LEAVE_AS_HISTORY | **never infer** from Job `cleanerPayout` (may be a team total) |
| Assignments without `source` | SUPPORT_IN_CODE (already) | a `source: "OFFER"` backfill is *derivable* from `sourceOfferId` but has zero behavioral benefit; not recommended |
| Legacy v0/v1 archived (35), incl. 10 payout-linked + 9 payouts | **DO_NOT_TOUCH** | financial and audit history; legacy read paths must stay |
| DEMO Job on archived Property | ARCHIVE_CANDIDATE | normal archive action by a manager |

**Safe automatic backfills: none recommended.** The candidate backfills are
unsafe or pointless:

| Candidate | Why not |
|---|---|
| `completedAt` = service date | fabricates history |
| Offer compensation from Job payout | infers money |
| Assignments for legacy Jobs | invents history |
| Offer → Assignment | no historical proof |
| Assignment `source` | derivable but useless |
| Revision/`scheduleRevision` defaults | missing already reads as 0 everywhere |

A future backfill would need:
- a dry-run using the aggregate command below;
- a verified backup;
- an exact field list;
- per-record rollback values;
- a manager-approved scope.

---

## 8. Financial & History Safety Constraints

- **Job `cleanerPayout` on v2 Jobs is ambiguous.** It may be a team total. It
  must never become per-Assignment or per-Offer compensation. 29 of 32 REAL
  Jobs carry a numeric `cleanerPayout` and 30 carry a `clientPrice`; none
  carries payout linkage.
- **REAL completed work has no payout path.** 5 REAL completed v2 Jobs cannot
  appear in the legacy payout flow (by design; Assignment-aware payouts are
  parked under DEC-040). Do not "fix" this by marking v2 Jobs legacy.
- **The 10 payout-linked legacy Jobs and 9 payout records are immutable
  history.** They are archived and non-REAL, but they are financial records
  (4 were recorded on 2026-09-23). Do not delete them, reclassify their
  provenance, or strip legacy fields.
- **`completedAt` records when a manager recorded completion, not the service
  date.** Completing the 5 past-due Jobs on 09-30 or later dates them then, in
  both the completed worklist and the scorecard. That is truthful; do not
  backdate. Report "completion recorded" separately from "service date".
- **Offer compensation snapshots are the only per-Cleaner amounts that exist.**
  16 REAL Offers lack one and must stay "not set". Direct Assignments carry no
  amount. Any future payout design must source amounts from explicit manager
  input, not from these records.

---

## 9. Recommended Pilot Actions and Implementation Buckets

### P0 — current real pilot breakage caused by legacy compatibility

**P0-1. Resolve the past-due older Jobs through existing manager actions**

This covers 5 REAL Jobs (R3 + R4), plus the stale-link Job once its service
date passes. For each Job, Gabi chooses one of:

- the work happened → **abandon DRAFT + complete** (answers and history
  preserved);
- a truthful photo can still be taken → the cleaner uploads through the
  still-active link, then review and approve;
- the stale-link Job still needs the cleaner → **reissue** the same Cleaner's
  link;
- the work did not happen or was a duplicate → **archive**.

Filter the Jobs list for assigned Jobs from 2026-09-23 and 2026-09-28 to find
them. The attributes are:

- scope: **tiny**;
- production data mutation: yes, but only through normal audited app actions,
  not a migration;
- code only: no;
- manager confirmation required: **yes**;
- rollback difficulty: archive is reversible; **completion is not** (it needs
  a maintenance operation);
- evidence: §4 R3/R4/R5; aggregate command `pastDueOpen: 5`.

No P0 *code* defect was found.

### P1 — materially reduces Gabi's migration friction/risk

**P1-1. Warn before a roster change invalidates an active cleaner checklist link**

"Remove cleaner", replace, and adding a Cleaner all advance the revision
silently. A confirmation should state that the current link stops working,
that saved answers are kept, and that the link can be reissued. Do not change
the revision rule (DEC-037).

- scope: **small** (UI copy/confirmation + component test);
- production data mutation: no;
- code only: yes;
- manager confirmation required: no;
- rollback: easy (Hosting redeploy);
- evidence: the confirmed incident (F3); team Jobs (DEC-042) hit this whenever
  a helper is added after the link is sent.

**P1-2. Make Cleaner history include schema-v2 Jobs**

Today 100% of REAL Jobs are invisible in Cleaner history. The fix needs
`assignedCleanerIds` array-contains queries alongside the legacy query, and
likely composite indexes.

- scope: **small–medium** (service change + indexes + tests);
- production data mutation: no;
- code only: yes (plus an index deploy);
- manager confirmation required: no;
- rollback: easy;
- evidence: F5 and `jobService.js:308-349`; STILL_RELEVANT since Astra Run A.
- Confirm Gabi relies on Cleaner history before scheduling it (DEC-040).

**P1-3. Exclude archived REAL Jobs from the pilot scorecard**

Or report them separately. 9 archived REAL Jobs currently count toward
created/scheduled/coverage, which distorts the pilot-exit and double-entry
reconciliation.

- scope: **tiny** (local script + test);
- production data mutation: no;
- code only: yes;
- manager confirmation required: no;
- rollback: trivial;
- evidence: F8.

### LATER — cleanup/debt that can safely wait (with triggers)

- **Reschedule lock from early or untouched Runs (R6: 2 Jobs).**
  - Trigger: Gabi is blocked from a real reschedule.
  - Smallest change: allow reschedule when the Run is DRAFT with no saved
    draft, no evidence, and no ACTIVE link, advancing revision atomically.
  - This needs a DEC-029 amendment.
- **Direct Assignment beside the same Cleaner's open Offer (R7: 2).**
  - Trigger: a cleaner declines or is confused.
  - Options: hint in Job Detail, or an explicit manager "withdraw Offer"
    action. Never auto-rewrite.
- **Dashboard cleaner names for v2 Jobs.** Include `assignedCleanerIds` in the
  name lookup (tiny, cosmetic).
- **Public Offer links on archived Jobs (2).** They self-expire; add an
  archive check if one is ever used.
- **Archive the non-archived DEMO Job** on an archived Property (manager
  action).
- **Archived REAL Job with READY + photo (R8).** Manager decision at
  convenience.
- **Assignment schedule copies are not updated by reschedule.** No REAL
  reschedule yet, and nothing reads the copies for behavior.
- **Re-offering the same Cleaner overwrites the Offer document** (prior audit
  finding). No production evidence of an overwrite.
- **Assignment-aware payouts / financial model.** Parked (DEC-040); never
  infer amounts.
- **Legacy singular-cleaner code paths.** Keep them: they serve 35 archived
  records, including payout history. Retire only after a backup and an
  explicit decision.

---

## 10. What NOT to migrate

- Legacy v0/v1 Jobs, their Offers, the 10 payout-linked Jobs, and the
  9 payout records.
- `completedAt`: never backdate or synthesize.
- Offer `offeredCompensation`: never derive from Job `cleanerPayout` or
  `clientPrice`.
- Assignment history:
  - never create Assignments for legacy Jobs;
  - never convert an INTERESTED/PENDING Offer into an Assignment;
  - never rewrite `source`.
- Checklist Runs, drafts, evidence, draft-mutation receipts, and capability
  records. Use only app actions (reissue, abandon, approve).
- Client report capabilities. Let them expire or replace them via the app.
- `dataProvenance`. Do not bulk-reclassify UNKNOWN/DEMO; manager
  classification is authoritative.
- `checklistContextRevision` / `scheduleRevision`. Missing already means 0;
  writing them would advance nothing and could invalidate links.

---

## 11. Regression Coverage Added

- `src/lib/pilotCompatibilityAudit.test.js` (new, 11 tests). Synthetic
  fixtures for each observed class:
  - current v2 without a Run;
  - pre-V2 Assignment without `source`;
  - v2 Offer without an amount snapshot;
  - direct Assignment beside the same Cleaner's open Offer;
  - same-Cleaner remove/re-add stale link;
  - past-due DRAFT variants (saved-no-photo, untouched-expired,
    with-evidence, READY, no Run);
  - untouched future Run;
  - completed with and without `completedAt`;
  - roster drift and assigned without an Assignment;
  - archived READY and archived open Offer link;
  - legacy archived payout history;
  - DEMO on an archived Property;
  - a reappearing REAL v1 Job and an invalid revision;
  - determinism and no identifier echo.
- `functions/src/publicOfferAssignmentAcknowledgment.test.js`: two new
  fail-closed cases. A manager-direct Assignment can never be acknowledged
  through the same Cleaner's INTERESTED or PENDING Offer link. The existing
  fixture is annotated as the pre-V2 Assignment shape (no `source`).
- Existing coverage already protects:
  - the stale-revision reissue that preserves the DRAFT
    (`checklistCapabilityService.test.js`);
  - DRAFT abandonment with and without a capability
    (`jobCompletionService.test.js`);
  - v2 "Amount not set" and legacy payout fallback
    (`publicOfferProjection.test.js`);
  - direct-Assignment presentation (`assignmentPresentation.test.js`).

Read-only aggregate command:
`node scripts/pilotCompatibilityAudit.mjs --project <id> [--today YYYY-MM-DD] [--allow-production-read]`.
Its classifier lives in `scripts/pilotCompatibilityAuditCore.mjs` and
reuses the deployed `checklistCapabilityState`, schema, and provenance
helpers, so classification cannot drift from runtime rules. It prints
counts only and has no write, fix, or repair mode.

It is not a duplicate of `pilotScorecard.mjs`. That command measures
period-scoped adoption for REAL Jobs; it does not classify record
generations, link states, roster integrity, archived edge cases, or legacy
financial history.

---

## 12. Evidence that would change the recommendations

- **Gabi identifies specific "buggy" older Jobs outside R3–R8.** That would
  mean an unobserved failure mode; re-run the aggregate command and inspect
  the class.
- **The past-due DRAFTs' missing photos are real upload failures.** Photo
  diagnostics exist from 2026-09-28; the latest past-due DRAFT was active
  that day. If so, F2 moves under the photo-reliability priority, not
  compatibility.
- **Gabi is blocked from rescheduling an R6 Job.** Promote the narrow
  untouched-Run reschedule change.
- **A cleaner declines through an Offer link after a direct Assignment.**
  Promote the R7 guidance to a UI change.
- **A REAL v0/v1 Job appears** (e.g., via import tooling) — the aggregate
  command flags `legacySingularCleaner`. Legacy paths then become operational
  again, not history-only.
- **An Assignment-aware payout design is approved.** §8 constraints become
  implementation requirements; no automatic amount inference is still
  allowed.
- **A reconciliation shows Property relinking of Jobs occurred** (import
  mechanics are UNKNOWN). Re-verify R8 and the archived-Property counts.

---

## Appendix A — Reconciliation with earlier audits (Issue #27, Astra runs, X-Ray)

| Earlier finding | Status now |
|---|---|
| Cleaner history reads only `assignedCleanerId` | **NOW_PROVEN**: affects 32 of 32 REAL Jobs → P1-2 |
| v2 Jobs had no completion path | SUPERSEDED_BY_CURRENT_CODE (no-Run, approval, abandon; all schema-agnostic) |
| v2 Jobs have no payout path; Assignments carry no amounts | STILL_RELEVANT; OUT_OF_SCOPE (financial design parked) |
| Re-offering the same Cleaner overwrites the Offer | STILL_RELEVANT (code); no production evidence → LATER |
| Archiving does not disable the public Offer | STILL_RELEVANT (2 REAL archived Jobs with live links) → LATER |
| Archived records inflate Dashboard counts | SUPERSEDED (Dashboard filters archived Jobs and Properties); **NEW:** the pilot scorecard does not → P1-3 |
| Older completed Jobs lack `completedAt` | **NOW_DISPROVEN** for production (0 of 15) |
| Missing or invalid `checklistContextRevision` | SUPERSEDED (reads as 0); invalid values **NOW_DISPROVEN** (0) |
| DATA_MODEL says new Jobs write schema v1 | NOW_PROVEN stale → corrected on this branch |
| Name-only legacy Jobs cannot start checklists | NOW_DISPROVEN in production (all Jobs have an existing `propertyId`) |
| Reschedule leaves Assignment schedule copies stale | STILL_RELEVANT in code; no REAL reschedule yet → LATER |
| Acknowledgment not retrofitted to legacy Jobs | OUT_OF_SCOPE_FOR_COMPATIBILITY (explicit decision) |
| Provenance classification | SUPERSEDED (implemented; no bulk migration needed) |
| Property import/dedupe mechanics | STILL_RELEVANT UNKNOWN (tooling not in `main`); production shows no orphaned Job Property links |
| Backup before any migration | STILL_RELEVANT (no migration recommended, so not blocking) |
| Client report "no longer available" incident | OUT_OF_SCOPE_FOR_COMPATIBILITY (all 4 report links ACTIVE and unexpired at audit time) |

## Appendix B — Method

1. Read AGENTS, CURRENT_STATE, DECISIONS, WORKFLOWS, DATA_MODEL, and git
   history on `main`.
2. Traced client services, Job Detail, Dashboard, histories, and payouts, plus
   every server callable and the Rules.
3. Ran a scratch read-only extractor that emitted allowlisted shape features
   only (field presence/type, statuses, revisions, dates, derived booleans).
   It never printed IDs, names, tokens, hashes, or free text. Its output
   stayed outside the repository.
4. Checked the committed aggregate command against that extract; the counts
   matched class by class.
