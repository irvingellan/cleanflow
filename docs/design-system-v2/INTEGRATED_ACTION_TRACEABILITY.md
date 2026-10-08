# CURRENT → V2 Job Detail binding inventory

Phase B App supplies **55 props** to JobDetail. Complete V2 accepts those same
55 plus 7 optional presentation hooks. App is byte-identical to the verified base.
The historical claim of "64 individually verified bindings" cannot be established
from the source contract; this report does not repeat it.

S = structural evidence: original App binding retained, same JobDetail control
and guard underneath the V2 wrapper. B = named behavior regression family, not
necessarily individual exhaustive testing of that binding. All 55 have S; only
the indicated families have B. Local harness persistence substitutes explicit
rejection, not production service execution. Real backend remains authoritative.

## Input/status bindings (28)

| Binding | Existing source / V2 surface | Guard/meaning | Evidence |
|---|---|---|---|
| job | selectedJob / header, lifecycle, intent | operationalStatus remains canonical | S + UNKNOWN/lifecycle |
| property | selected property / reminder | exact relationship, sensitive opt-in unchanged | S + reminder tests |
| knownCleaners | directoryCleaners / assignment identity | existing identity resolver | S + assignment tests |
| availableCleaners | cleaners / direct picker | canAssignCleanerDirectly | S + picker tests |
| isLoadingCleaners | controller / picker state | suppress selection during loading | S + picker tests |
| hasCleanerError | controller / picker error | no eligibility bypass | S + picker tests |
| offersCreatedCount | controller / Offers | existing informational count | S |
| offers | jobOffers / Offers, lifecycle | loaded evidence only | S + lifecycle |
| isLoadingOffers | controller / Offers state | loading unchanged | S |
| hasOffersError | controller / Offers error | retry unchanged | S |
| assignments | jobAssignments / assignment | existing roster model | S + assignment tests |
| isLoadingAssignments | controller / roster state | loading unchanged | S |
| hasAssignmentsError | controller / roster error | error unchanged | S |
| issues | jobIssues / Issues + attention | existing issue status independent | S + attention tests |
| isLoadingIssues | controller / Issues state | loading unchanged | S |
| hasIssuesError | controller / Issues error | retry unchanged | S |
| checklistRun | controller / checklist | frozen evidence, independent axis | S + detail/lifecycle |
| isLoadingChecklistRun | controller / checklist loading | no false completed claim | S + summary tests |
| hasChecklistRunError | controller / checklist error | no invented data | S + summary tests |
| isCreatingChecklistRun | controller / create busy | existing creation control | S |
| hasCreateChecklistRunError | controller / create error | explicit error retained | S |
| checklistCapability | controller / existing link controls | server state not reinterpreted | S + disclosure tests |
| isLoadingChecklistCapability | controller / link loading | existing state | S |
| hasChecklistCapabilityError | controller / link error | existing state | S |
| isIssuingChecklistCapability | controller / issuance busy | existing state | S + replacement tests |
| hasIssueChecklistCapabilityError | controller / issuance error | existing state | S |
| isRevokingChecklistCapability | controller / revocation busy | existing state | S |
| hasRevokeChecklistCapabilityError | controller / revocation error | existing state | S |

## Callback/permission bindings (27)

| Binding | Original handler | V2 entry point | Guard / destination or mutation | Evidence |
|---|---|---|---|---|
| onBack | origin-aware showDashboard/returnTo* | header Back | navigation only | S + integrated A/B/D |
| onOfferToCleaners | showOfferCleaners | Offers disclosure | existing offers eligibility; navigation | S + integrated Offers |
| onRefreshOffers | refreshJobOffers | Offers retry/refresh | read through current service | S |
| onRefreshIssues | refreshJobIssues | Issues retry | read through current service | S |
| onRefreshChecklistRun | refreshChecklistRun | checklist refresh | authorized existing read | S |
| onCreateChecklistRun | createAndOpenChecklistRun | checklist controls | existing guards/server; mutation | S |
| onOpenChecklistRun | openChecklistRun | primary/checklist controls | navigation, existing Run | S + integrated B |
| onRefreshChecklistCapability | refreshChecklistCapability | link controls | existing read | S |
| onIssueChecklistCapability | issueJobChecklistCapability | issue/replace confirmation | same existing issuance validation | S + replacement confirmation |
| onPrepareChecklistReminder | prepareChecklistReminder | checklist message controls | existing authorized preparation | S + reminder |
| onRevokeChecklistCapability | revokeJobChecklistCapability | link controls/confirmation | same server validation; mutation | S |
| onCreatePublicOfferLink | createCleanerOfferLink | Offer link controls | individual compensation snapshot preserved | S + offer regression suite |
| onAssignCleaner | assignCleaner | interested Offer action | existing assignment validation; mutation | S + assignment suite |
| onAssignCleanerDirectly | assignCleanerDirectly | direct picker Confirm | canAssignCleanerDirectly; click/select not mutation | S + picker suite |
| onRemoveAssignment | removeCleanerAssignment | roster | same eligibility/backend; mutation | S + assignment suite |
| onReplaceAssignment | replaceCleanerAssignment | roster | same eligibility/backend; mutation | S + assignment suite |
| onStartCleaning | startCleaning | existing start control | existing start eligibility; mutation | S + Job detail regressions |
| onCompleteCleaning | completeCleaning | primary/final confirmation | existing ASSIGNED/IN_PROGRESS/nonarchive guard | S + completion/cancel/error/stale tests |
| onUpdatePrices | saveJobPrices | Financial form | existing job-only snapshot validation | S + financial suite |
| onUpdateDetails | saveJobDetails | Service details form | canEditJobDetails unchanged | S + detail suite |
| onUpdateSchedule | saveJobSchedule | schedule form | jobScheduleAvailability + existing server guard | S + schedule suite |
| onSimulateAssignedCleaner | openAssignedCleanerJob | existing simulation control | navigation only; no assignment write | S |
| onResolveIssue | resolveJobIssue | Issues | existing issue validation; mutation | S + issue regressions |
| onSaveDataProvenance | saveJobDataProvenance | History/admin | existing provenance handling; mutation | S + provenance suite |
| canRestore | canManageExcludedRecords | History/admin | existing permission prop, not new authorization | S |
| onArchive | archiveJobRecord then removeJobFromWorklist/returnToJobs | secondary archive confirmation | same authorization/confirmation; mutation | S + archive/cancel/stale tests |
| onRestore | restoreJobRecord | History/admin | existing canRestore/server validation | S |

## Seven additions — presentation only

`renderPresentation`, `disclosureSummaries`, `renderIntentNext`,
`renderConfirmation`, `requestConfirmation`, `renderConsequences`,
`compactLifecycle`. Optional; original default control path is preserved.
They change layout/summary/dialog surfaces, not rule authority. Confirmation is
awaited before the original callback and settles safely on cancel, unmount or
Job change. 175 complete-detail browser tests and the complete-detail unit family
cover these surfaces; no test proves every real server mutation here.

UNKNOWN fix: only the fallback recommendation now checks existing
`canUseCompletionControls`; false means historical read intent. Eligibility and
server completion implementation are unchanged.
