# Tenancy inventory

Every place in the code that assumes there is one organization, recorded before the
organization starts to come from the signed-in account. Nothing here changes code.

- Taken at commit `885d493` (Phase 2 of the refactor).
- The hardcoded organization ID is the literal `cleanflow-demo`. It is called
  "the default organization" below.
- Status values: `safe` (already scoped, nothing to do), `fix in P4-Sxx` (changed by
  that step of the organization work), `needs decision` (the owner decides; listed
  again at the end).
- All names are generic. No real person, company, code or link appears here.

## Design in one paragraph

A claim on the account **selects** an organization: `organizationId` for managers,
`cleanerHub.organizationId` for cleaners (already present). The membership document
`organizations/{org}/members/{uid}` still **authorizes** every request, in the
Rules and in every Function. An account without a claim uses the default
organization, so the first company sees no change. No data moves and no Rule changes.

## 1. Files that contain the literal

`grep -rln "cleanflow-demo" src functions/src`, tests excluded: 21 files.

| Location | What it assumes | Action | Step |
| --- | --- | --- | --- |
| `src/features/clients/clientService.js` | module constant builds every client path | use the organization module | fix in P4-S04 |
| `src/features/cleaners/cleanerService.js` | module constant builds every cleaner path, including the server read | use the organization module | fix in P4-S04 |
| `src/features/cleaners/cleanerHubAccessService.js` | module constant builds the link-status path | use the organization module | fix in P4-S04 |
| `src/features/properties/propertyService.js` | module constant builds every property path | use the organization module | fix in P4-S04 |
| `src/features/jobs/jobService.js` | module constant builds job paths and is written into new jobs | use the organization module | fix in P4-S05 |
| `src/features/jobs/jobOfferService.js` | module constant builds offer paths and is written into offers | use the organization module | fix in P4-S05 |
| `src/features/jobs/assignmentService.js` | module constant builds assignment paths and is written into assignments | use the organization module | fix in P4-S05 |
| `src/features/jobs/cleanerReminderLog.js` | module constant builds the job path it updates | use the organization module | fix in P4-S05 |
| `src/features/issues/issueService.js` | module constant builds issue paths | use the organization module | fix in P4-S05 |
| `src/features/payouts/payoutService.js` | module constant builds payout paths and is written into payouts | use the organization module | fix in P4-S06 |
| `src/features/payouts/payoutProofService.js` | module constant builds the payout path and the Storage path of the proof | use the organization module | fix in P4-S06 |
| `src/features/weekly-close/weeklyCloseService.js` | module constant builds the paths read for a weekly close | use the organization module | fix in P4-S06 |
| `src/features/weekly-close/weeklyCloseModel.js` | default parameter of the pure model | default comes from the organization module; callers pass the current organization | fix in P4-S06 |
| `src/features/cleaner-agenda/cleanerAgendaService.js` | module constant builds the paths read for the cleaner agenda | use the organization module | fix in P4-S06 |
| `src/features/dashboard/dashboardReads.js` | module constant builds the dashboard reads | use the organization module | fix in P4-S06 |
| `src/features/telemetry/managerPageLoadService.js` | module constant builds the page-load event path | use the organization module | fix in P4-S07 |
| `src/features/telemetry/managerOperationTelemetryService.js` | module constant builds the operation event path | use the organization module | fix in P4-S07 |
| `src/features/telemetry/managerPageLoadDiagnosticsService.js` | module constant builds the diagnostics reads | use the organization module | fix in P4-S07 |
| `src/features/auth/managerAccessService.js` | module constant builds the membership path that grants entry | use the organization module; the membership is then read under the resolved organization | fix in P4-S07, resolved in P4-S08 |
| `functions/src/runtime/firebase.js` | exports the constant every handler module imports, and `organizationReference()` | handlers take the organization from the request, the token or the trigger path; the export is deleted | fix in P4-S09 to P4-S12 |
| `functions/src/devCenterData.js` | demo records are stamped with the default organization | stays pinned on purpose, under an explicit name | fix in P4-S12 |

Handler modules that import the constant from `runtime/firebase.js` (they do not contain
the literal, so they are not in the list above):

| Location | What it assumes | Action | Step |
| --- | --- | --- | --- |
| `functions/src/handlers/checklistRuns.js`, `assignments.js`, `checklistAccess.js`, `clientReports.js`, `managerDevices.js`, `feedback.js` | every manager callable acts on the default organization | organization from the caller; membership check unchanged | fix in P4-S09 |
| `functions/src/handlers/cleanerHub.js`, `notificationInbox.js`, `cleanerPush.js` | cleaner and inbox callables act on the default organization | organization from the caller's claims; session checks unchanged | fix in P4-S10 |
| `functions/src/handlers/publicOffer.js`, `publicChecklist.js`, `publicReports.js` | a bearer link is only valid inside the default organization | organization from the document the token resolves to | fix in P4-S11 |
| `functions/src/handlers/managerNotifications.js` | reminders, their claim and their inbox item are for the default organization | organization becomes a parameter; the schedule loops over organizations | fix in P4-S12 |
| `functions/src/handlers/devCenter.js` | developer tools act on the default organization | stays pinned on purpose | fix in P4-S12 |
| `functions/src/handlers/cleanerAgendaTriggers.js` | nothing: the organization comes from the trigger path | none | safe |

## 2. Top-level collections outside `organizations/`

Used by `functions/src/`. The browser cannot read or write any of them: the Rules end
with a deny-all for every path they do not name.

| Collection | Stores `organizationId`? | How the organization is checked | Status |
| --- | --- | --- | --- |
| `cleanerAccessCodes/{codeHash}` | yes | redeeming reads the organization and cleaner from the code document, then works only under that organization; issuing and revoking filter by organization | safe |
| `clientReportTokenLookups/{tokenHash}` | yes | today the stored value must equal the constant; it becomes the source of the organization | fix in P4-S11 |
| `clientPortalTokenLookups/{tokenHash}` | yes | same as the report lookup | fix in P4-S11 |
| `managerPushDevices/{registrationId}` | yes, with `userId` | queries filter by organization; dispatch re-reads each owner's membership in that organization; a record of another organization or user is refused | safe |
| `managerPushTokenClaims/{hash}`, `managerPushInstallationClaims/{hash}` | yes | a claim of another organization stops the registration ("cannot be transferred") | safe |
| `cleanerPushTokenClaims/{hash}`, `cleanerPushInstallationClaims/{hash}` | yes | ownership compares organization, account, cleaner and session | safe |
| `cleanflowReleaseControl/mission2Writers` | no | one release switch for the whole project, by design | safe (global on purpose) |

## 3. `collectionGroup` queries

| Location | Query | Organization handling | Status |
| --- | --- | --- | --- |
| `functions/src/handlers/publicOffer.js` | `offers` by `publicOfferTokenHash` | the path must be under the constant | fix in P4-S11: validate the shape, take the organization from the path |
| `functions/src/checklistCapabilityService.js` (3 places) | `checklistCapabilities` by `tokenHash` | the path must be under the organization passed in (the constant) | fix in P4-S11: take the organization from the path and compare it with the stored field |
| `functions/src/checklistEvidenceService.js` | `checklistCapabilities` by `tokenHash` | same as above | fix in P4-S11 |
| `functions/src/handlers/devCenter.js` (`getManagerNotificationDiagnostics`) | `managerNotificationDeliveries`, first 100, no filter | results are already filtered by path prefix of the default organization before use | safe; stays pinned in P4-S12 |

Token hashes are SHA-256 of random tokens, so one hash cannot match documents of two
organizations in practice. The code still refuses a result with more than one match.

## 4. Storage paths

| Location | Path | Status |
| --- | --- | --- |
| `src/features/payouts/payoutProofService.js` | `organizations/{org}/payouts/{payoutId}/proof/payment-proof` (the only path the browser may use; the Storage Rules check membership in `{org}`) | fix in P4-S06 (path built from the organization module) |
| `functions/src/checklistEvidenceService.js` | `organizations/{org}/jobs/{job}/checklistRuns/{run}/evidence/{item}/{hash}.{ext}` | safe: built from the organization of the resolved capability |
| `functions/src/checklistMultiPhotoService.js` | `{run document path}/evidence-v2/{attempt}.{ext}` | safe: starts with the run's own path |
| `functions/src/checklistEvidenceService.js` (`checklistThumbnailPath`) | `checklistThumbnails/v1/{sha256(photo path + generation)}.jpg` | safe: server-only, the key is derived from one photo. It is **outside** `organizations/`, so removing a company's data must also remove its thumbnails |

Photo downloads always go through a record that was resolved first (a capability, a
report lookup or a manager check); no caller supplies a Storage path.

## 5. Scheduled Functions and anything that walks "all jobs"

| Location | What it assumes | Status |
| --- | --- | --- |
| `sendTomorrowPlanningReminder`, `sendTodayExecutionReminder` | read the jobs of the default organization only; one claim and one inbox item per window | fix in P4-S12: once per organization, failures isolated |
| Reminder time and timezone (`pilotReminderTimezone`, 07:00 and 19:00) | one timezone and one schedule for every company | needs decision (D-1) |
| Reminder transport (`MANAGER_REMINDER_PROVIDER`) | one transport for every company; recipients are the managers' own devices, filtered by organization | safe |
| `functions/src/handlers/devCenter.js` (`clearDemoData`, `demoJobCount`) | walk the default organization's collections | safe; stays pinned in P4-S12 |
| Firestore triggers (`syncCleanerAgendaOn*`, `notifyManagers*`, `notifyCleanerInboxEvent`) | nothing: `event.params.orgId` | safe |
| `src/features/dashboard/dashboardReads.js`, `weeklyCloseService.js`, `cleanerAgendaService.js` | read whole collections of the current organization | fix in P4-S06 (path only) |

## 6. Client caches and browser storage

| Location | Key or cache | Holds organization data? | Status |
| --- | --- | --- | --- |
| `src/features/jobs/jobPhotoCountService.js` | module map `completedCounts`, keyed by job ID only | yes: photo counts per job, kept for the session | fix in P4-S08: cleared when the account signs out |
| Manager Firestore client (`src/services/firebase/client.js`) | default in-memory cache; no persistence is enabled | only for the open tab; every path includes the organization | safe |
| `src/features/auth/managerAccessService.js` | never grants entry from a cached membership | no | safe |
| `src/features/auth/managerAccessDiagnostics.js` | `sessionStorage` `cleanflow.manager-access.diagnostics` | no: stage names and timings | safe |
| `src/features/telemetry/managerPageLoadService.js` | `cleanflow.manager-page-load.session-id`, `…device-id` | no: random identifiers of the browser | safe |
| `src/features/notifications/notificationService.js`, `notificationHealthService.js` | `cleanflow-push-device-id` | no: random identifier of the browser. A browser shared by managers of two companies is refused by the installation claim (section 2) | safe |
| `src/features/notifications/cleanerPushService.js`, `cleanerPushBinding.js` | `cleanflow-cleaner-push-device-id`, IndexedDB `cleanflow-cleaner-push-binding` | bound to the cleaner session, which carries its own organization | safe |
| `src/features/cleaner-hub/*` | language and onboarding flags; in-memory Firestore cache | no | safe |
| `src/features/checklists/checklistDraftRecovery.js`, `publicChecklistLoadDiagnostics.js` | drafts and a session ID for one public checklist link | keyed by a fingerprint of that link, never the token itself | safe |
| `src/services/firebase/functionWarmup.js` | `cleanflow.functionWarmup.{function}` timestamps | no | safe |
| `src/i18n/translations.js`, `src/theme/theme.js`, `src/features/releases/WhatsNewPanel.jsx`, `src/features/startup/startupShell.js` | language, theme, last seen release, startup diagnostics | no | safe |

## 7. Developer tools and seed tooling

They must stay on the default organization. None of them takes an organization from a request.

| Location | Status |
| --- | --- |
| `functions/src/handlers/devCenter.js`: scenario generation, cleanup, diagnostics, developer test notification | pinned; made explicit in P4-S12 |
| `functions/src/devCenterData.js` | pinned; made explicit in P4-S12 |
| `functions/src/handlers/devCenter.js`: `reportManagerNotificationHealth`, `sendCurrentManagerTestNotification` | these two are **manager** callables that live in the developer module. Pinned, they refuse a manager of any other company | needs decision (D-2) |
| `functions/src/handlers/managerNotifications.js`: `previewManagerReminder` | developer-only preview; takes the organization from the caller in P4-S12 |
| `functions/scripts/seedPublicOfferEmulator.js`, `scripts/seed*.js`, `scripts/serviceLifecycleFixtures.mjs` | emulator and seed tooling for the default organization | safe |
| `scripts/inventoryData.mjs`, `scripts/pilotScorecard.mjs`, `scripts/cleanerPushPilot.mjs`, `scripts/approveCleanerPushPilot.mjs`, `scripts/refactorBaseline.mjs` | operator tooling for the default organization. A second company is not covered by these reports | needs decision (D-3) |
| `e2e/**`, `security/**`, unit tests | fixtures use the default organization, which stays the default | safe |

## 8. Push and inbox device documents

| Document | Stores `organizationId`? | Checked? | Status |
| --- | --- | --- | --- |
| `managerPushDevices/{registrationId}` | yes | yes: on registration, on dispatch (membership re-read) and in diagnostics | safe |
| `organizations/{org}/managerNotificationDeviceHealth/{id}` | by path | the registration it points to must belong to the same organization | safe |
| `organizations/{org}/cleanerPushAccounts/{uid}/devices/{session}` | yes, and by path | the account ID is derived from organization and cleaner; ownership is compared on every use | safe |
| `organizations/{org}/managerNotificationInbox/*`, `organizations/{org}/cleanerNotificationInboxes/{cleanerId}/items/*` | yes, and by path | events of another organization are dropped; cleaner access re-checks the session | safe; the caller's organization changes in P4-S10 |
| `organizations/{org}/managerReminderDeliveries/{id}` | yes, and the ID hashes the organization | one claim per organization and window | fix in P4-S12 (organization as a parameter) |

## Other single-organization assumptions

| Location | What it assumes | Status |
| --- | --- | --- |
| Firebase Authentication | one user pool for every company; an account belongs to one organization | safe (design trade-off D7) |
| `functions/src/handlers/feedback.js` | feedback from every company goes to one issue tracker and includes the reporter's identifier | needs decision (D-4) |
| `functions/src/cleanerPushPilot.js`, `CLEANER_PUSH_*` environment | one push pilot gate for the project; readiness records are per organization | safe |
| `AUTOMATIC_OFFERS_MODE`, `NOTIFICATION_INBOX_MODE` | one switch per project, not per company | safe (per-company settings are a later, optional step) |
| Hosting | one site and one app for every company | safe |

## Decisions for the owner

- **D-1 Reminder time.** Every company gets its reminders at 07:00 and 19:00 in the first
  company's timezone until per-company settings exist. Accept for now, or hold the
  reminder loop until settings exist?
- **D-2 Two manager callables in the developer module.** Device health reports and the
  "test this device" notification stay pinned to the default organization under the
  plan, so a second company's managers are refused there. Nothing leaks, but the feature
  is missing for them. Move the two to the caller's organization in a follow-up?
- **D-3 Operator reports.** Inventory, scorecard and push-pilot scripts read the default
  organization only. Add an organization option when a second company starts?
- **D-4 Feedback.** In-app feedback from any company lands in the same issue tracker.
  Keep, or route by organization before onboarding a second company?
