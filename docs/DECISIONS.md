# CleanFlow — Decision Log

This file records architectural/product decisions and why they were made.

Decisions can be revised, but changes should be documented rather than silently replacing previous reasoning.

---

## DEC-001 — Use a realtime-oriented backend for the first implementation

Status: Current

Current direction is Firebase / Firestore because realtime operational updates are a central product concept and an early prototype already proved realtime synchronization across devices.

This does not mean Firestore must permanently store every category of CleanFlow data.

---

## DEC-002 — Keep persistence behind services

Status: Accepted

UI/components should not directly depend on Firestore throughout the application.

Reason:

- easier testing
- lower coupling
- easier migrations
- clearer architecture
- easier AI-assisted development

Conceptual architecture:

UI
→ hooks / feature logic
→ services
→ backend

---

## DEC-003 — Browser-first cleaner experience

Status: Accepted

Initial cleaner workflow should not require native iOS/Android application installation.

Reasons:

- lower adoption friction
- cleaners can enter through WhatsApp links
- most required workflows work through mobile web
- native application adds unnecessary early complexity

A PWA may be considered before a native app.

Native application should be justified by concrete requirements such as strong offline behavior, background uploads, advanced location behavior or other browser limitations.

---

## DEC-004 — WhatsApp is a notification/entry channel

Status: Current hypothesis

Do not attempt to move the entire structured workflow into WhatsApp.

Preferred model:

WhatsApp
→ notification / link
→ CleanFlow mobile web
→ structured workflow

---

## DEC-005 — Manager and cleaner experiences differ

Status: Accepted

Manager:

- desktop-friendly
- operational dashboard
- calendar
- team
- finance
- exceptions
- realtime activity

Cleaner:

- mobile-first
- simplified
- job-focused
- minimal navigation

They may share the same web application/backend while presenting role-appropriate interfaces.

---

## DEC-006 — Internationalization from the beginning

Status: Accepted

English should be the canonical technical language for code.

User-facing UI should be prepared for i18n.

Likely initial languages:

- English
- Portuguese
- Spanish

Static interface translation and AI translation of user-generated content are separate concerns.

---

## DEC-007 — Issues are separate from job operational status

Status: Accepted

A job can be:

`IN_PROGRESS`

while simultaneously having:

`OPEN ISSUE`

Reason:

Issues represent operational health/exceptions, not necessarily lifecycle.

---

## DEC-008 — Explicit administrative overrides

Status: Accepted

Managers must be able to intervene when real-world operations deviate from the expected flow.

Overrides should:

- use explicit application actions
- preserve consistency
- generate audit/activity data where appropriate

Direct production database editing should not be normal operational procedure.

---

## DEC-009 — Audit important operational mutations

Status: Accepted

Important events should eventually record:

- actor
- action
- target entity
- timestamp
- source
- relevant metadata

Audit/event design should remain practical and not create unnecessary event noise.

---

## DEC-010 — Design for multiple organizations

Status: Accepted

Do not hard-code the first design partner as the permanent single tenant.

Data ownership and permissions should be organization-aware.

Do not prematurely build a full enterprise multi-tenancy layer, but avoid architecture that makes adding another organization painful.

---

## DEC-011 — Use structured logic before AI

Status: Accepted

If a behavior can be reliably represented by deterministic business rules, use normal application logic.

AI is appropriate later for tasks such as:

- interpreting unstructured messages
- translation
- summarizing activity
- classifying ambiguous reports
- operational assistant queries

Do not use AI to replace simple state transitions.

---

## DEC-012 — Separate structured data from binary storage

Status: Accepted conceptually

Operational metadata belongs in the database.

Large files such as photos should live in object storage.

Database records should store metadata and storage references.

Discovery confirms that a cleaning commonly produces 30 or more photos and that those photos ultimately need to reach the property owner/client. Upload state and client-delivery state must therefore remain distinguishable; storing a photo does not mean it has been delivered.

Provider choice can evolve later.

---

## DEC-013 — Do not prematurely integrate external platforms

Status: Accepted

Hospitable, Guesty, WhatsApp and other integrations are important future capabilities.

First prove the internal operational workflow.

External integrations should be added after the core domain is stable enough to receive their data.

When Guesty and Hospitable synchronization is implemented, it must handle new reservations, date changes and cancellations without requiring routine manual reconciliation. Synchronization should preserve external references, be idempotent and audit meaningful changes.

---

## DEC-014 — Job Invite responses do not assign a job

Status: Accepted

Initial Job Invite statuses are:

- pending
- interested
- declined
- expired
- withdrawn

`accepted` is not a Job Invite status.

A cleaner expresses interest or declines. The manager is responsible for assigning the job.

Assignment is represented on the Job, not by adding another Job Invite status.

Cleaner responses are private from other cleaners. A cleaner must not see competing cleaners, their responses or the number of other interested cleaners.

In the interface, `interested` may appear as “Tenho interesse” and `declined` as “Não posso”.

---

## DEC-015 — Simplify the initial Job lifecycle

Status: Superseded for the planned model; retained as the current legacy implementation

The initial Job lifecycle is:

`UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED`

`CONFIRMED` is not part of the initial lifecycle. It should be reintroduced only if future discovery identifies a real confirmation step after assignment.

`CANCELLED` and `REOPENED` remain possible future states but are not part of the first vertical slice.

This decision accurately describes the singular-cleaner prototype. DEC-025
records the validated multi-cleaner and QA evolution without retroactively
claiming that the migration is complete.

---

## DEC-016 — Manager controls cleaner assignment

Status: Accepted

For the first vertical slice, the manager manually selects which cleaners receive a job offer.

Cleaners may express interest, but interest never assigns the Job. The manager
chooses the assigned cleaner in the current implementation; the validated future
model allows the manager to create one or more Assignments.

Automatic eligibility rules and cleaner recommendations are deferred until later discovery and implementation. Future recommendations may inform the manager but must not silently take assignment control away from the manager.

---

## DEC-017 — Cleaner mobile link access remains an open decision

Status: Open

Authentication and authorization for cleaner mobile links are intentionally undecided.

This decision must be resolved before implementing the real cleaner mobile invite flow.

Prior Turno and Taskbird experience confirms that unreliable access or team invitations can make the manager perform the cleaner's workflow on their behalf. The eventual access design must be tested for reliable, low-friction mobile use while still protecting property-access information.

---

## DEC-018 — Separate Reservation from Cleaning Job

Status: Accepted

A Reservation represents a guest stay received from Guesty, Hospitable or another source.

A Cleaning Job represents the operational work that CleanFlow offers, assigns, executes and completes.

The records may be related, but they must not be collapsed into one entity or lifecycle. A reservation date change or cancellation is an intake change that may require explicit reconciliation of a related Job. It does not alter the first vertical-slice Job lifecycle by itself.

This separation allows future integrations to synchronize reservation facts without forcing provider-specific states into operational job logic.

---

## DEC-019 — Reuse Property defaults while preserving Job history

Status: Accepted conceptually

Selecting a Property for a Cleaning Job should populate its persistent instructions, access information, checklist, supply requirements and pricing defaults.

Job-specific overrides must not silently change the Property. Later Property edits must not rewrite what applied to historical Jobs.

The implementation may use snapshots, version references or another explicit strategy. The chosen persistence design must preserve historical accuracy and remain auditable.

---

## DEC-020 — Keep financial workflow states explicit and independent

Status: Accepted conceptually

The system must distinguish at least:

- invoice pending/sent
- client payment pending/received
- cleaner payout pending/paid

These dimensions must not be collapsed into one generic financial status. A sent invoice can remain unpaid, and a cleaner can be paid before the corresponding client payment is received.

Financial totals and profit should be derived deterministically from underlying charges, compensation, adjustments and payment records. Automated invoicing and bank-transfer reconciliation remain future capabilities pending further workflow design.

---

## DEC-021 — Development Firestore access requires authentication

Status: Current development foundation

Firestore denies access by default. During development, any authenticated user is temporarily treated as the manager only for `organizations/cleanflow-demo/**`.

This is not production-ready multi-tenant authorization. Before production or multi-user use, rules must authorize organization membership and roles. Cleaner and client/owner access must use narrower, role-appropriate permissions.

---

## DEC-022 — Public cleaner offer links are server-mediated bearer capabilities

Status: Accepted for the prototype

Cleaner offer links must not grant anonymous Firestore access. An authenticated manager creates an opaque, high-entropy token in the browser; only its hash and expiry are stored on the linked Offer document. A public HTTPS Function resolves that hash server-side and returns only a cleaner-safe projection of one offer.

The public Function may update only its linked offer from `PENDING` to `INTERESTED` or `DECLINED`; this response never assigns a Job. The Function enforces a seven-day prototype expiry. A legacy Job must remain `OFFERED`; an Assignment-aware Job may remain available through `ASSIGNED` so the manager can build a pre-start team roster, but becomes unavailable at `IN_PROGRESS`. These checks are intentionally centralized so later lifecycle-based expiry rules can replace or extend the initial duration.

The public projection excludes client price, generic manager notes, property access data, other cleaners and other offers. Firestore rules remain authenticated-manager-only until narrower role authorization is designed.

---

## DEC-023 — Development demo data is server-authorized and explicitly marked

Status: Accepted for the prototype

The Dev Center creates only fictitious, batch-scoped records through authenticated
server functions. Every generated record carries `demoSeed`, `demoSeedBatch`, and
`demoSeedScenario`; cleanup may target only those marked records. The user interface
is shown only after a server-side Firebase Auth UID allowlist check, and
generation/cleanup functions enforce that check again so hiding the interface is not
the authorization boundary.

Generated reference Clients, Properties, and Cleaners are separate from normal
operational records. Cleanup refuses to remove a demo Job with non-demo child data or
a payout link, preserving data created outside the Dev Center for manual review.

---

## DEC-024 — Model team work with per-cleaner Assignments

Date: 2026-08-29
Status: Accepted direction; not yet fully implemented

A Job remains the operational aggregate. A Cleaner Assignment becomes the
separate entity representing one cleaner's participation in that Job.

Reasons:

- one Job can require multiple cleaners;
- each cleaner needs independent execution, hours, compensation, and payout
  state;
- an Offer records interest, while an Assignment records the manager's actual
  selection;
- a single `assignedCleanerId` cannot safely represent team work.

The planned persistence direction is a Job-owned Assignment collection with a
canonical Cleaner reference and historical snapshots. Existing singular fields
remain legacy compatibility data until an additive migration is complete.

---

## DEC-025 — Separate Job lifecycle from Assignment lifecycle and manager QA

Date: 2026-08-29
Status: Accepted direction; detailed edge cases remain open

The planned Job lifecycle is:

`UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → WAITING_FOR_QA → COMPLETED`

The planned Assignment lifecycle is:

`ASSIGNED → IN_PROGRESS → SUBMITTED → APPROVED`

Cleaner submission and manager completion are different business events. A Job
does not auto-complete when the final cleaner submits work. Manager QA and
finalization remain the operational completion boundary.

**OPEN QUESTION:** exact behavior for partial team completion, late additions
to a team, and exceptional manager completion requires workflow design before
implementation.

---

## DEC-026 — Separate client pricing from cleaner compensation

Date: 2026-08-29
Status: Accepted direction; monetary representation remains open

Jobs may have fixed or hourly client pricing. Each Cleaner Assignment may
independently have fixed or hourly compensation.

Client-billable hours and cleaner-payable hours are separate concepts. Cleaner
pay may be calculated from manager-approved hours or fixed compensation, then
explicitly overridden by a manager when necessary. The approved payable amount
must remain historically stable.

**OPEN QUESTION:** client-billable-hour policy for multi-cleaner hourly work,
currency representation, rounding, and adjustment behavior require a focused
financial design before implementation.

---

## DEC-027 — Use an additive legacy migration for the Assignment model

Date: 2026-08-29
Status: Accepted

Do not destructively rewrite historical Jobs. Legacy singular fields such as
`assignedCleanerId`, `assignedCleanerName`, `cleanerPayout`, `payoutId`, and
`payoutPaidAt` remain readable. New Assignment-aware services must use safe
legacy fallbacks until records are explicitly migrated or naturally replaced by
newer Jobs.

Migration code must preserve canonical IDs, historical snapshots, and payment
auditability. It must not infer hours from timestamps or invent invoice/payment
state for legacy records.

---

## DEC-028 — Keep invoices separate from cleaner payouts

Date: 2026-08-29
Status: Accepted direction; implementation planned

An Invoice is a Client-facing financial aggregate that can contain multiple Job
line items. Invoice delivery state and client payment/reconciliation state are
separate from Cleaner payout state.

A payout can occur independently of client payment. The system must not use one
generic payment status to represent either concern.

**OPEN QUESTION:** invoice generation, delivery, payment allocation, and
reconciliation workflow remain to be designed.

---

## DEC-029 — Rescheduling requires audit history and context preservation

Date: 2026-08-29
Status: Accepted direction; implementation planned

Rescheduling is a first-class operational change. A date/time change must
record previous and new schedule context, actor, timestamp, and revision. It
must not silently delete, overwrite, or discard related Offers, Assignments, or
operational history.

**OPEN QUESTION:** whether an active Offer or Assignment must reconfirm after a
schedule revision, and which reminder behavior follows, remains open.

---

## DEC-030 — Keep public and cleaner-facing data intentionally narrow

Date: 2026-08-29
Status: Accepted

Public offer links and future cleaner-facing views must expose only the data
needed for that cleaner's current action. They must not expose client charges,
business profit, other cleaner compensation, internal notes, unrelated Offers
or Assignments, private financial state, or unapproved sensitive property data.

This extends DEC-022 as per-cleaner compensation and team assignments are
introduced. Authorization and safe payload projection belong at the service or
server boundary, not solely in UI hiding.

---

## DEC-031 — Reminder policy remains an operational-design question

Date: 2026-08-29
Status: Open

Cleaner reminders and weekly payroll reminders are validated needs. Their exact
cadence, delivery channel, time-zone model, retry policy, idempotency behavior,
and user controls have not been decided. Scheduled automation must wait for the
Assignment, pricing, payout, and reschedule foundations it depends on.
