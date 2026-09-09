# CleanFlow Open-Source Intelligence & Reuse Sprint

Status: completed, read-only research.  
Date: 2026-08-31  
Scope: CleanFlow source, Firebase configuration, rules, indexes, dependencies, data, commits, and deployment were not changed.

## 1. Executive verdict

CleanFlow should continue as its own codebase.

No audited open-source project preserves CleanFlow's validated operational model:

Offer is private; cleaner interest does not assign work; a manager creates one or more Assignments; each Assignment has an execution and QA lifecycle; compensation, payout, and client invoicing stay separate.

The recommended strategy is not a fork. It is to own CleanFlow-specific rules, port proven design patterns, integrate established protocols and providers later, and deliberately defer expensive commodity platforms.

The connected Reviewer approved this conclusion with guardrails incorporated in section 19.

## 2. Should CleanFlow continue as its own codebase?

Yes.

Forking OpenFieldPro, OpenSTR, CleanPro, LivAroundOS, Odoo/OCA Field Service, or ERPNext would require a technology and data migration while still requiring a rebuild of CleanFlow's differentiated semantics. The likely effort is multiple weeks to months and would create more migration risk than near-term engineering savings.

CleanFlow should own:

- Manager-controlled offers and assignments.
- Independent Assignment execution and QA.
- Cleaner-safe data projections and access-instruction authorization.
- Job versus Reservation separation.
- Assignment compensation, payouts, invoices, snapshots, and audited rescheduling.

Commodity engineering to avoid rebuilding includes iCalendar parsing, recurrence expansion, channel delivery, payment rails, PDF rendering, file storage, and future route optimization.

## 3. Top OSS candidates

| Candidate | Best value | Recommended posture |
|---|---|---|
| RentTools.io | iCalendar import and reconciliation patterns | PORT |
| OpenFieldPro | organization scope, authorization, recurrence, and test patterns | PORT concepts only |
| Cal.com | schedules, ICS feeds, free/busy, and reschedule audit concepts | PORT concepts only |
| OpenSTR | checklist, evidence, issue, and QA information architecture | PORT concepts only |
| EasyDispatch | future multi-worker availability and planning ideas | DEFER |
| CleanPro | small M:N cleaner relation and calendar-query ideas | Study selectively |
| OCA Field Service | recurrence, calendar loop prevention, and timesheet concepts | Study only |
| ical.js and rrule | protocol parsing and recurrence libraries | Future dependency evaluation |

## 4. Repositories screened

24 repositories or libraries were screened. Eleven had source inspected and six received a deep audit. README-only claims were not accepted as implementation evidence.

| Repository or library | Screening result |
|---|---|
| prtkgpt/cleanpro | Deep audit |
| Gribadan/RentTools.io | Deep audit |
| niko4244/openfieldpro | Deep audit |
| lkilpatrick/openstr | Deep audit |
| calcom/cal.com | Deep audit |
| livaroundltd/LivAroundOS | Deep audit |
| alibaba/easydispatch | Source-inspected, planner reference |
| OCA/field-service | Source-inspected, conceptual reference |
| frappe/erpnext | Source-inspected, conceptual reference |
| go-vikunja/vikunja | Source-inspected, conceptual reference |
| kewisch/ical.js | Source and tests inspected |
| jkbrzt/rrule | Source inspected |
| sys-ae/fieldopt | Rejected: thin and AGPL |
| clawnify/open-fieldservice | Rejected: conflicting license signals |
| vinaymishraofficial/swiftservice | Rejected: GPL/platform mismatch |
| azaharizaman/nexus-field-service | Rejected: incomplete implementation |
| ma-dev-usa/WorkOrderOps | Rejected: no trustworthy license or auth |
| ForliLabs/ospite-facile | Rejected: no open-source license |
| LibreProperty/LibreProperty | Rejected: no working prototype |
| XetaSuite/Core | Rejected: wrong domain |
| fieldservice-dk/fieldservice-sim | Rejected: static demo |
| juliosuas/airbnb-manager | Rejected: unavailable repository |
| novuhq/novu | Screened as notification infrastructure, not a product base |
| crater-invoice/crater | Screened as generic invoicing, not a product base |

## 5. Deep audit findings

### RentTools.io

License: MIT. Code and focused tests were inspected.

Evidence:

- prisma/schema.prisma models CalendarLink, CalendarEvent, Reservation, CleaningRecord, Cleaner, and CleanerAssignment.
- src/lib/calendar-sync.ts imports feeds, guards against self-feed loops, uses external event identity, keeps failure information, and reconciles changed or missing events.
- src/lib/ical.ts parses and generates a deliberately small iCalendar subset.
- src/lib/calendar-sync.test.ts and src/lib/ical.test.ts passed: 25 tests in 2 files.

Recommendation: port its reconciliation ideas, not its architecture or parser. Its CleaningRecord is one property/date record and cleaner assignment is property affinity; it is not an Offer, Job, Assignment, QA, or payout model.

### OpenFieldPro

License: AGPL-3.0-only. Code and test architecture were inspected.

Evidence:

- packages/db/src/schema.ts uses organization-scoped operational models and minor-unit money.
- apps/api/src/operational-authorization.ts applies role and organization guards.
- apps/api/src/routes/jobs.ts restricts technician scope and transitions.
- apps/api/src/recurrence.ts isolates recurrence math; apps/api/test/recurrence.test.ts verifies it.
- apps/mobile/src/sync/service.ts implements offline cache/outbox concepts.
- apps/web/e2e/dispatch-board.spec.ts exercises dispatch-board behavior.

Recommendation: cleanroom-port concepts and tests only. Jobs and appointments use a singular technician model, while CleanFlow requires independent multiple Assignments. Its Fastify/Postgres/Next/Expo stack is not a replacement for React/Vite/Firebase CleanFlow.

### OpenSTR

License: GPL-3.0. Code and migrations were inspected.

Evidence:

- api/migrations/008_create_clean_sessions.js models clean-session status and review timestamps.
- api/migrations/009_create_room_cleans.js, 010_create_task_completions.js, 011_create_photos.js, and 015_create_issues.js form a useful evidence hierarchy.
- api/src/routes/sessions.ts separates submitted and approved/rejected activity.
- api/src/routes/photos.ts and api/src/routes/issues.ts provide implementation examples.

Recommendation: port the domain shape as Assignment to ChecklistRun to ChecklistItem to Evidence/Issue. Do not copy code. OpenSTR permits self-claim/auto-assignment patterns and assumes one cleaner per session; both conflict with CleanFlow's manager control and M:N Assignment model.

### CleanPro

License: MIT. Source was inspected; no meaningful test suite was discovered.

Evidence:

- prisma/schema.prisma has Workspace, Booking, CleanerAssignment, ChecklistItem, JobPhoto, RecurringRule, Invoice, and Payment models.
- src/app/api/cleaners/jobs/route.ts returns cleaner job data.
- src/app/api/cleaners/jobs/[bookingId]/start/route.ts and complete/route.ts update Booking-level status.
- src/lib/services/payment-service.ts couples Booking payment state to Stripe processing.

Recommendation: do not adopt as a base. Although CleanerAssignment is M:N, completing one cleaner's work completes the global Booking. Worker routes also expose broad address, client, instruction, and property information. Its invoice and payment choices mix operational and financial concerns that CleanFlow deliberately keeps separate.

### Cal.com

License: MIT for the audited checkout and platform paths; exact file and commit must be rechecked before any reuse.

Evidence:

- apps/api/v2/src/platform/calendars/services/ics-feed.service.ts.
- apps/api/v2/src/modules/cal-unified-calendars/services/unified-calendars-freebusy.service.ts.
- schedule service and schedule controller E2E specs.
- booking service, booking PBAC guard, and reschedule E2E specs.

Recommendation: study its feed validation, selected-calendar free/busy calculation, cache invalidation, authorization, and reschedule-history ideas. Do not transplant its cancellation-and-replacement booking state machine: CleanFlow requires an audited revision of the existing Job that preserves its Offers and Assignments.

### LivAroundOS

License: README claims AGPL, but no LICENSE or COPYING file was found in the audited checkout. Treat it as unlicensed/high-risk.

Evidence:

- backend/prisma/schema.prisma has a singular Job.workerId and stores sensitive property data.
- backend/src/routes/jobs.ts supports available-job listing and worker claim behavior.
- backend/src/routes/bookings.ts creates operational work from booking flow.
- backend/src/routes/guide.ts lacks the necessary Assignment-specific access boundary.
- No meaningful test suite or implemented iCalendar module was found.

Recommendation: do not use implementation or code. At most, observe the visual separation between worker and manager experiences.

## 6. License and reuse matrix

This is engineering-risk guidance, not legal advice. Before future copying or dependency adoption, verify the exact target file, commit, notices, dependencies, and commercial distribution implications.

| Candidate | License found | Classification | Reuse guidance |
|---|---|---|---|
| RentTools.io | MIT | GREEN | Port/adapt only after preserving copyright and license notices. |
| CleanPro | MIT | GREEN legally, YELLOW technically | Small utilities only after independent review; no workflow adoption. |
| EasyDispatch | Apache-2.0 | GREEN | Preserve license and NOTICE obligations; defer its planner. |
| Cal.com audited paths | MIT | GREEN | Verify exact path/commit before use; port concepts. |
| rrule | BSD-3-Clause declared in package metadata | GREEN/YELLOW | Verify released artifact and dependency license before adoption. |
| ical.js | MPL-2.0 | YELLOW | Evaluate dependency obligations before use; do not casually copy covered source. |
| OpenFieldPro | AGPL-3.0-only | RED | Cleanroom conceptual reference only. |
| OpenSTR | GPL-3.0 | RED | No direct incorporation without explicit license strategy. |
| OCA Field Service | AGPL-3.0 modules | RED | Study behavior and tests only. |
| ERPNext | GPL-3.0 | RED | Study concepts only. |
| Vikunja | AGPL-3.0-or-later | RED | Study invariants and tests only. |
| LivAroundOS | No verifiable repository license | RED | No code reuse. |
| Open Field Scheduling | MIT file conflicts with AGPL README claim | RED | No reuse until provenance is resolved. |

## 7. Build / Borrow / Port / Integrate / Defer matrix

| CleanFlow capability | Current state | Best reference | License | Evidence level | Reuse mode | Potential time saved | Migration/integration risk | Recommendation |
|---|---|---|---|---|---|---|---|---|
| Per-Assignment execution lifecycle | Phase 1A2 deferred | OpenSTR | GPL | Code verified | BUILD and PORT concepts | Medium | High semantic mismatch | Own the lifecycle and QA rules. |
| Cleaner Hub / My Jobs | Phase 1B planned | RentTools, CleanPro | MIT | Code verified | BUILD | Medium | Privacy mismatch | Build a narrow CleanFlow worker portal. |
| Organization authorization | Future multi-org direction | OpenFieldPro | AGPL | Code/tests verified | PORT concepts | Medium | Stack mismatch | Apply organization-scoped service authorization. |
| Recurrence | Later roadmap | OpenFieldPro, rrule | AGPL/BSD | Code/tests inspected | INTEGRATE and PORT | High | Timezone and exception rules | Use maintained recurrence tooling. |
| iCalendar ingestion | Later roadmap | RentTools, ical.js | MIT/MPL | Code/tests verified | INTEGRATE and PORT | High | Feed security and reconciliation | Build a CleanFlow adapter over a maintained parser. |
| Rescheduling | Phase 5 planned | Cal.com, RentTools | MIT | Code/tests verified | PORT concepts | Medium | Lifecycle conflict | Keep Job identity and audit revisions. |
| Reminders | Phase 5 planned | Cal.com, Vikunja | MIT/AGPL | Code verified | BUILD and INTEGRATE | Medium | Duplicate delivery | Own idempotency; use providers for delivery. |
| Checklist/photos/issues | Phase 6 planned | OpenSTR | GPL | Code verified | PORT concepts and BUILD | High | Assignment/privacy mismatch | Model evidence under Assignment. |
| Payouts | Phase 3 planned | No close candidate | N/A | N/A | BUILD | Low | Financial correctness | Own payout state and audit boundaries. |
| Client invoices | Phase 4 planned | OpenFieldPro, ERPNext | AGPL/GPL | Code verified | BUILD and INTEGRATE | Medium | Accounting mismatch | Own receivables model; integrate rails later. |
| Dispatch optimization | Explicitly deferred | EasyDispatch | Apache-2.0 | Code verified | DEFER | Very high later | Very high now | Do not introduce yet. |

## 8. Top 10 things CleanFlow should not build from zero

1. Full RFC 5545 iCalendar parsing.
2. RRULE, RDATE, EXDATE, and timezone expansion.
3. Calendar-feed polling, retry, and cache plumbing.
4. SMS, email, WhatsApp, and push delivery networks.
5. Push-token lifecycle infrastructure.
6. Payment processing, card vaulting, or payout rails.
7. PDF and tax-document rendering engines.
8. Durable photo/blob storage infrastructure.
9. Route optimization and geographic dispatch solvers.
10. Offline-first native-mobile synchronization infrastructure.

## 9. Top 10 things CleanFlow should own

1. Offer interest remaining distinct from Assignment.
2. Manager-created multiple Assignments.
3. Per-Assignment execution lifecycle and QA.
4. Job completion rules across several Assignments.
5. Cleaner-safe data projection and access-code authorization.
6. Job/property snapshots and schedule-revision audit history.
7. Worked-hours, approved-hours, and compensation policy.
8. Separate payout and client-invoice state machines.
9. Manager overrides and operational audit events.
10. Cleaner Hub workflows tailored to cleaning operations and internationalization.

## 10. Cleaner Hub recommendation

Build the Cleaner Hub in CleanFlow.

Use authenticated accounts or a server-mediated capability endpoint that returns only the cleaner's own Assignment and currently authorized property information. Do not permit self-claim. Do not expose client rates, margins, other cleaner identities or responses, internal notes, assignment counts, or property access credentials before the relevant authorization point.

The initial Hub should focus on My Jobs, Assignment detail, start/submit activity, evidence upload, and issue reporting.

## 11. Calendar / Airbnb / iCal recommendation

Integrate the iCalendar protocol rather than writing a parser.

Port RentTools-style reconciliation behavior:

- Scope external identity by organization, property, provider, and UID.
- Use idempotent imports with content hash or revision.
- Preserve history for removed or reissued events.
- Prevent self-feed loops.
- Apply timeout, validation, failure counting, and SSRF controls.
- Reconcile Reservations explicitly before creating or changing Jobs.

Calendar import must not automatically create Assignments. Reservation ingestion remains distinct from manager-controlled Job creation.

## 12. Payout / invoice recommendation

Build CleanFlow's financial domain model and integrate payment rails later.

No candidate matches the needed distinction among worked hours, approved hours, compensation, payout, receivables, and client payment. Use minor currency units, immutable financial snapshots, idempotency keys, and server-side authorization. Defer automated Stripe Connect or payout automation until product policy is validated.

## 13. Scheduling / reminder recommendation

Build a small internal scheduling boundary before adding channels.

Use an idempotency key such as:

Assignment ID plus schedule revision plus reminder type.

This makes retries and re-sends deterministic. Port Cal.com-style history concepts, but retain the same CleanFlow Job and its Offer/Assignment history rather than cancelling and replacing it.

## 14. Checklist / photo / issue recommendation

Port OpenSTR's evidence hierarchy, rebuilt around CleanFlow Assignments:

Assignment to ChecklistRun to ChecklistItem to Evidence or Issue.

Keep Assignment submission separate from manager approval. Use Firebase Storage for binary objects, while keeping metadata, authorization, retention, and QA state in CleanFlow service boundaries.

## 15. Multi-tenant recommendation

Adopt OpenFieldPro's organization-scoping discipline, not its stack:

- Include organization scope in operational records and queries.
- Enforce organization and role checks server-side.
- Treat financial writes as especially restricted.
- Test cross-organization isolation explicitly.

Do not migrate to Postgres/Fastify/Next/Expo for this purpose.

## 16. Exact source files and modules worth studying

| Repository | Paths |
|---|---|
| RentTools | src/lib/calendar-sync.ts; src/lib/ical.ts; src/lib/calendar-sync.test.ts; src/lib/ical.test.ts; prisma/schema.prisma |
| OpenFieldPro | packages/db/src/schema.ts; apps/api/src/operational-authorization.ts; apps/api/src/recurrence.ts; apps/api/src/routes/jobs.ts; apps/mobile/src/sync/service.ts |
| OpenSTR | api/migrations/008_create_clean_sessions.js; 009_create_room_cleans.js; 010_create_task_completions.js; 015_create_issues.js; api/src/routes/sessions.ts |
| Cal.com | apps/api/v2/src/platform/calendars/services/ics-feed.service.ts; apps/api/v2/src/modules/cal-unified-calendars/services/unified-calendars-freebusy.service.ts; schedule services; reschedule E2E specs |
| EasyDispatch | src/dispatch/job/models.py; worker/models.py; job/service.py; plugins/kandbox_planner/agent/kandbox_heuristic_realtime_agent.py |
| OCA Field Service | fieldservice/models/fsm_order.py; fieldservice_recurring/models/fsm_recurring.py; fieldservice_calendar/models/calendar.py |
| CleanPro | prisma/schema.prisma; src/app/api/cleaners/jobs/route.ts; start/route.ts; complete/route.ts; src/lib/services/payment-service.ts |

## 17. Repositories worth cloning or keeping as references

Keep only in an isolated research workspace:

- RentTools for iCalendar reconciliation.
- OpenFieldPro for organization, authorization, and test patterns.
- OpenSTR for evidence and QA-domain patterns.
- Cal.com for schedules, feeds, and reschedule audit patterns.
- EasyDispatch for a later feasibility study of planner heuristics.
- ical.js and rrule for future dependency evaluation.

No third-party repository belongs inside CleanFlow.

## 18. Repositories to ignore

- LivAroundOS: no verifiable license, self-claim behavior, weak access controls.
- FieldOpt: singular assignment and weak tenancy/authentication.
- Open Field Scheduling: conflicting license signals.
- LibreProperty: no working prototype.
- ospite-facile and WorkOrderOps: no trustworthy reuse license.
- Nexus Field Service and fieldservice-sim: incomplete or demo-only.
- XetaSuite Core: wrong domain.
- juliosuas/airbnb-manager: unavailable repository.
- SwiftService: GPL and platform mismatch.

## 19. Reviewer corrections and disagreements

Reviewer: Antigravity, acting as adversarial final reviewer.

Result: APPROVED with guardrail corrections. No material disagreement remained after correction.

Corrections incorporated:

1. GPL and AGPL sources are RED for direct incorporation into a future hosted proprietary product. Treat them as cleanroom conceptual references; do not import, copy, or submodule code without an explicit license strategy.
2. LivAroundOS must be treated as unlicensed/high-risk because its README claim is not a verifiable repository license.
3. MIT and Apache licensing does not mean copy-without-review. Preserve copyright/license text and Apache NOTICE where applicable.
4. Cal.com's cancellation-based reschedule model is incompatible with CleanFlow. CleanFlow needs an audited revision on the existing Job that preserves historical Offers and Assignments.
5. Cleaner projections must remove client rates, margins, other cleaner identities/responses, internal notes, and access credentials until explicitly authorized.
6. Do not call CleanPro a usable multi-cleaner solution: its schema permits M:N, but its routes complete the Booking globally.
7. Do not call LivAroundOS operationally multi-tenant: Organization is mainly billing/subscription context, not consistently enforced operational isolation.
8. Do not call Cal.com broadly AGPL based on stale external material. The audited checkout/path was MIT; any future reuse must verify the exact commit and source path.

## 20. Roadmap recommendations

No replatforming and no OSS fork should be added to the roadmap.

Recommended refinements:

1. Keep Phase 1A2 first: finish Assignment execution and QA semantics.
2. Make Cleaner Hub authorization and minimal projection an explicit Phase 1B gate.
3. Define currency, rounding, worked/approved hours, and compensation policy before Phase 2.
4. Introduce idempotent reminder/event scheduling before notification channels.
5. Add iCalendar as a Reservation adapter with reconciliation after core execution is stable.
6. Keep offline sync, native mobile, GPS, and dispatch optimization deferred until validated.

## 21. Next five engineering actions

1. Validate with Gabi the Assignment QA and rejection workflow.
2. Specify Cleaner Hub authentication and property-access disclosure policy.
3. Define financial invariants for approved hours, compensation, payout, and invoice separation.
4. Define schedule-revision and reminder-idempotency contracts.
5. Plan an isolated future iCalendar adapter spike using a maintained parser and RentTools-style reconciliation tests.

## 22. Estimated engineering time saved

| Area | Relative saving |
|---|---|
| iCalendar/RRULE parsing and feed reconciliation | High: several days to 1–2 weeks |
| Checklist/evidence/QA model discovery | Medium: roughly 3–7 days |
| Tenant authorization and finance-test patterns | Medium: roughly 2–5 days |
| Reminder idempotency and reschedule-audit patterns | Medium: roughly 2–5 days |
| Avoiding premature planner/offline/native rebuilds | Very high: multiple weeks avoided |

Overall expected avoided effort: approximately 2–5 engineering weeks. This is a directional estimate, not a delivery commitment.

## 23. Open questions requiring product validation with Gabi

- Should a cleaner ever be allowed to claim unassigned work? Current recommendation: no.
- Which property instructions may be disclosed before acceptance, assignment, arrival, or start?
- What evidence is required for submission and for QA approval?
- Can QA rejection reopen only one Assignment, and what happens to its compensation?
- Are team assignments fixed-price, hourly, split, or mixed?
- Which reschedule scenarios require cleaner reconfirmation?
- Which PMS/iCalendar feeds are trusted, and who resolves calendar conflicts?
- When is a payout owed, approved, initiated, and paid?
- Which invoice grouping and payment terms matter first?
- Which language and mobile constraints matter most for cleaners?

## 24. Repository integrity confirmation

CleanFlow application code was not modified.

This sprint did not modify Firebase, rules, indexes, data, dependencies, or production configuration. No commit, push, deployment, migration, or dependency installation occurred in CleanFlow.

External research clones remained outside CleanFlow in temporary research directories. This report is the only artifact saved for the sprint.
