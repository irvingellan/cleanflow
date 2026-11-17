# Job Detail split plan

`src/features/jobs/JobDetail.jsx` is one component function that renders the whole Job screen and owns all of
its state. This document maps it and lists the extractions that break it up, in order. Each extraction is a
separate pull request of at most about 400 changed lines.

The first extraction (JD-S01) is done. The rest is a plan.

## 1. What the component is today

Measured before JD-S01: 2,547 lines, one exported function, 60 `useState` calls, 12 refs, 7 effects and 29
handler functions. It receives 62 props and calls one data hook of its own (`useCleanerSelectionContext`)
and one service (`getCleanerContactsById`, to resolve cleaner names, phones and languages).

It renders, in this order:

| Part | What it shows |
| --- | --- |
| Head | Back button, title, date and client, completion time, the attention list, the lifecycle rail, the cleaner summary, the checklist progress summary |
| Intent rail | `JobIntentLayer` (the "what do you want to do" actions) and `InterestDecisionPanel` (interested cleaners to confirm) |
| Schedule confirmation | `JobScheduleConfirmation`, when cleaners were asked to confirm a new schedule |
| Section `jobs.section.details` | Schedule edit form, details edit form (guest name and notes), the notes |
| Section `jobs.section.cleaner` | The legacy reminder button, the assignment roster with direct assignment and replacement, the reminder preview |
| Section `jobs.section.checklist` | Checklist run controls and link controls, completion controls, the legacy start and status block |
| Section `jobs.section.offers` | Offer actions, cleaner spots, the offer list with link, compensation and message actions, the legacy "simulate cleaner" button |
| Section `jobs.section.issues` | The issue list and the resolution form |
| Section `jobs.section.financial` | The financial snapshot and the price edit form |
| Section `jobs.section.history` | The record summary, data provenance review, archive and restore |

## 2. State and handlers by owner

"Owner" means the only part that reads the value. A value read by more than one part is listed under
"Shared".

| Owner | State | Handlers | Refs and effects |
| --- | --- | --- | --- |
| Details: schedule | `isEditingJobSchedule`, `jobScheduleValues`, `isSavingJobSchedule`, `jobScheduleSaveError`, `hasSavedJobSchedule`, `scheduleCommunicationMayBeStale`, `needsScheduleReload`, `scheduleRevisionConflict` | `startJobScheduleEdit`, `saveJobSchedule` | `scheduleSectionRef`; reset effect on `job.id` |
| Details: guest and notes | `isEditingJobDetails`, `jobDetailValues`, `isSavingJobDetails`, `jobDetailsSaveError`, `hasSavedJobDetails` | `startJobDetailsEdit`, `saveJobDetails` | reset effect on `job.id` |
| Cleaner: roster | `isDirectAssignmentOpen`, `directCleanerSearch`, `directCleanerId`, `isAssigningDirectly`, `removingAssignmentId`, `replacementTargetId`, `replacingAssignmentId`, `replacementOfferId` | `assignCleanerDirectly`, `removeCleanerAssignment`, `replaceCleanerAssignment` | `assignmentSectionRef`; `useCleanerSelectionContext` |
| Cleaner: reminder | `reminderPreview`, `isCopyingReminder`, `isPreparingReminderChecklist`, `hasReminderChecklistError`, `copiedCleanerId`, `copyMessageErrorCleanerId`, `reminderLogState` | `openReminderPreview`, `prepareReminderChecklist`, `copyReminderMessage` | `reminderSectionRef` |
| Checklist | `isCompletionConfirmationVisible`, `isCompletingCleaning`, `hasCompleteCleaningError`, `isStartingCleaning`, `hasStartCleaningError` | `completeCleaning`, `startCleaning` | `checklistSectionRef`, `completionSectionRef` |
| Offers | `isCreatingPublicOfferLinkFor`, `publicOfferLinkError`, `revokingOfferId`, `revokeOfferErrorId`, `editingOfferCompensationFor`, `offerCompensationInput`, `offerCompensationErrorFor`, `copiedOfferMessageId`, `offerMessageCopyErrorId`, `isSavingSpots` | `reopenOffer`, `addCleanerSpotAndAssign`, `changeCleanerSpots`, `openOfferLinkForm`, `createOfferLink`, `revokeOffer`, `offerMessageFor`, `copyOfferMessage` | `offersSectionRef`, `didFocusNewOffersRef`; the effect that focuses newly created offers |
| Issues | `resolvingIssueId`, `resolutionNote`, `isResolvingIssue`, `resolutionError` | `openResolutionForm`, `closeResolutionForm`, `resolveSelectedIssue` | `issuesSectionRef` |
| Financial | `isEditingPrices`, `priceValues`, `isSavingPrices`, `priceSaveError`, `hasSavedPrices` | `startPriceEdit`, `savePrices` | reset effect on `job.id` |
| History | none | none | `historySectionRef` |

Shared values, which make the split harder than it looks:

- **`assignmentError`, `assigningCleanerId`, `decidingOfferId`, `assignCleaner`, `decideOffer`**: read by the
  intent rail (interest panel), the roster and the offers list.
- **`publicOfferLink`**: written by the offers list and read by the reminder preview.
- **Cleaner names, phones and languages** (`resolvedCleaner*` state and its effect): read by almost every part.
- **`chooseJobIntent` and `focusIntentSection`**: the intent rail opens other sections' forms and focuses their
  refs. It calls `startJobScheduleEdit`, `setIsDirectAssignmentOpen`, `openReminderPreview` and
  `setIsCompletionConfirmationVisible`, and reads every section ref.
- **The fourth reset effect on `job.id`** resets state of the offers, reminder, checklist and roster parts in
  one place.
- **`intentNotice`**: set by the intent rail and cleared by the schedule reset effect.

## 3. Rules for every extraction

1. A step moves code; it does not change it. No visual or behavior change.
2. Hooks keep their order. A step never moves a hook call across another hook call unless the step says so
   and explains why the order cannot matter.
3. The props of `JobDetail` do not change, and no test in `JobDetail.test.jsx` changes.
4. A moved JSX block receives every value it reads as a prop with the same name.
5. Verification for every step: `npm test`, `npm run build:emulators`, `npm run test:e2e`, and the two Job
   Detail harness suites (`playwright.job-intent.config.js`, `playwright.lifecycle.config.js`).
6. Rollback for every step: revert the pull request. No data, rules or configuration change.

**Before JD-S02, repair the two harness suites.** When this plan was written both failed on the base branch,
before any change to Job Detail: the intent suite's two tests and 21 of the 25 lifecycle tests. The lifecycle
harness page does not load, because its Firebase stand-in has no `connectFirestoreEmulator`. Until they pass,
only `JobDetail.test.jsx` and the manager end-to-end suite guard these steps.

## 4. Extractions, in order

Stage A moves JSX only: state, handlers and effects stay in `JobDetail`. Stage B then moves each section's own
state next to its JSX, smallest first, and leaves the shared values for last.

### JD-S01 — Extract the History section (done)
- **Goal**: Move the smallest section, as the template for stage A.
- **Depends on**: none
- **Files**: create `src/features/jobs/JobHistorySection.jsx`; change `src/features/jobs/JobDetail.jsx`
- **Instructions**: Move the `jobs.section.history` block (the summary list, `DataProvenanceReview`,
  `RecordArchiveControl`) into `JobHistorySection`, with 15 props under unchanged names, including
  `historySectionRef`.
- **Must not change**: the element that carries `historySectionRef`; the order of the summary rows.
- **Done when**: [x] the block is rendered by `JobHistorySection`; [x] `JobDetail.test.jsx` passes untouched.
- **PR label**: `scope:hosting`

### JD-S02 — Extract the Financial section JSX
- **Goal**: Move the financial snapshot and the price form (about 75 lines).
- **Depends on**: JD-S01
- **Files**: create `src/features/jobs/JobFinancialSection.jsx`; change `JobDetail.jsx`
- **Instructions**: Move the `jobs.section.financial` block. Props include `grossMargin`, the five price
  states, their setters as used, `startPriceEdit` and `savePrices`.
- **Must not change**: the form field names (`clientPrice`, `cleanerPayout`); the reset effect.
- **Done when**: [ ] the block is rendered by `JobFinancialSection`.
- **PR label**: `scope:hosting`

### JD-S03 — Extract the Issues section JSX
- **Goal**: Move the issue list and the resolution form (about 145 lines).
- **Depends on**: JD-S02
- **Files**: create `src/features/jobs/JobIssuesSection.jsx`; change `JobDetail.jsx`
- **Instructions**: Move the `jobs.section.issues` block. Pass `issuesSectionRef`, `sortedIssues`, the four
  resolution states and the three handlers.
- **Must not change**: the element that carries `issuesSectionRef` (the attention list focuses it).
- **Done when**: [ ] the block is rendered by `JobIssuesSection`.
- **PR label**: `scope:hosting`

### JD-S04 — Extract the Details section JSX
- **Goal**: Move the schedule form, the details form and the notes (about 145 lines).
- **Depends on**: JD-S03
- **Files**: create `src/features/jobs/JobDetailsSection.jsx`; change `JobDetail.jsx`
- **Instructions**: Move the `jobs.section.details` block. Pass `scheduleSectionRef`, both groups of form
  state, `scheduleMessage` and the four handlers.
- **Must not change**: the element that carries `scheduleSectionRef`; the inline cancel handlers.
- **Done when**: [ ] the block is rendered by `JobDetailsSection`.
- **PR label**: `scope:hosting`

### JD-S05 — Extract the Checklist section JSX
- **Goal**: Move the checklist controls, completion controls and the legacy execution block (about 155 lines).
- **Depends on**: JD-S04
- **Files**: create `src/features/jobs/JobChecklistSection.jsx`; change `JobDetail.jsx`
- **Instructions**: Move the `jobs.section.checklist` block, with `checklistSectionRef` and
  `completionSectionRef`.
- **Must not change**: the conditions that decide which completion control appears.
- **Done when**: [ ] the block is rendered by `JobChecklistSection`.
- **PR label**: `scope:hosting`

### JD-S06 — Extract the reminder preview JSX
- **Goal**: Move the reminder preview out of the Cleaner section (about 150 lines).
- **Depends on**: JD-S05
- **Files**: create `src/features/jobs/JobReminderPreview.jsx`; change `JobDetail.jsx`
- **Instructions**: Move the `reminderPreview && (…)` block. It reads many derived values
  (`reminderCleanerStillAssigned`, `reminderReadyToSend`, `reminderPreviewMessage`, `reminderWhatsAppUrl`, …);
  pass each one, do not recompute them.
- **Must not change**: the element that carries `reminderSectionRef`; the inline "mark as sent" handler.
- **Done when**: [ ] the block is rendered by `JobReminderPreview`.
- **PR label**: `scope:hosting`

### JD-S07 — Extract the assignment roster JSX
- **Goal**: Move the roster with direct assignment and replacement (about 210 lines).
- **Depends on**: JD-S06
- **Files**: create `src/features/jobs/JobAssignmentRoster.jsx`; change `JobDetail.jsx`
- **Instructions**: Move the `isAssignmentAware && (…)` roster block. `cleanerSelection` is passed whole, as
  the block spreads it.
- **Must not change**: the element that carries `assignmentSectionRef`; `useCleanerSelectionContext` stays in
  `JobDetail`, with its condition.
- **Done when**: [ ] the block is rendered by `JobAssignmentRoster`.
- **PR label**: `scope:hosting`

### JD-S08 — Extract one offer row
- **Goal**: Move the body of the offer list's `map` into a row component (about 220 lines).
- **Depends on**: JD-S07
- **Files**: create `src/features/jobs/JobOfferRow.jsx`; change `JobDetail.jsx`
- **Instructions**: Move the per-offer derived values and the `<article>` into `JobOfferRow`, keyed by
  `offer.id` at the call site.
- **Must not change**: the order of the derived values; the status label table.
- **Done when**: [ ] the list renders `JobOfferRow`.
- **PR label**: `scope:hosting`

### JD-S09 — Extract the Offers section JSX
- **Goal**: Move the rest of the Offers section (about 130 lines after JD-S08).
- **Depends on**: JD-S08
- **Files**: create `src/features/jobs/JobOffersSection.jsx`; change `JobDetail.jsx`
- **Instructions**: Move the `jobs.section.offers` block, with `offersSectionRef`.
- **Must not change**: the element that carries `offersSectionRef` (three callers focus it).
- **Done when**: [ ] the block is rendered by `JobOffersSection`.
- **PR label**: `scope:hosting`

### JD-S10 — Extract the head JSX
- **Goal**: Move the head (about 40 lines).
- **Depends on**: JD-S09
- **Files**: create `src/features/jobs/JobDetailHead.jsx`; change `JobDetail.jsx`
- **Instructions**: Move the `cf-job__head` block. Pass `primaryIntent`, `focusIntentSection` and
  `chooseJobIntent` as props.
- **Done when**: [ ] `JobDetail`'s JSX is only layout and section components.
- **PR label**: `scope:hosting`

### JD-S11 to JD-S14 — Move section-owned state into hooks
- **Goal**: Each step moves one group of state, handlers and its reset effect into a hook called from
  `JobDetail` at the position of the first moved `useState`: `useJobPriceEdit` (JD-S11),
  `useIssueResolution` (JD-S12), `useJobDetailsEdit` (JD-S13), `useJobScheduleEdit` (JD-S14).
- **Depends on**: JD-S10
- **Files**: one new `src/features/jobs/use….js` per step; change `JobDetail.jsx`
- **Instructions**: The hook returns one object; `JobDetail` destructures it under the same names. Moving an
  effect changes when it runs relative to the others: the step must show that no other effect reads the state
  it resets. `useJobScheduleEdit` also clears `intentNotice`, so it receives that setter.
- **Must not change**: the values each reset effect sets.
- **PR label**: `scope:full` (a `.js` file changes)
- **Executor**: needs a strong model

### JD-S15 — Split the shared reset effect and move the remaining section state
- **Goal**: Give the roster, reminder, checklist and offers parts their own hooks.
- **Depends on**: JD-S14
- **Instructions**: First split the fourth `job.id` reset effect into one effect per part, in the same order,
  as its own pull request. Then one hook per part. `publicOfferLink` stays in `JobDetail` (two parts use it),
  and so do the cleaner contact lookup, `assignmentError`, `assigningCleanerId`, `decidingOfferId` and the
  intent functions.
- **Executor**: needs a strong model

After JD-S15, `JobDetail.jsx` holds the derived values, the shared state, the intent logic and the layout.
Whether to go further (for example a reducer for the intent logic) should be decided then, with the file in
front of whoever does it.
