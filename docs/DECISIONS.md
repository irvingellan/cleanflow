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

Status: Accepted

The initial Job lifecycle is:

`UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED`

`CONFIRMED` is not part of the initial lifecycle. It should be reintroduced only if future discovery identifies a real confirmation step after assignment.

`CANCELLED` and `REOPENED` remain possible future states but are not part of the first vertical slice.

---

## DEC-016 — Manager controls cleaner assignment

Status: Accepted

For the first vertical slice, the manager manually selects which cleaners receive a job offer.

Cleaners may express interest, but interest never assigns the Job. The manager chooses the assigned cleaner.

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

The public Function may update only its linked offer from `PENDING` to `INTERESTED` or `DECLINED`; this response never assigns a Job. The Function enforces a seven-day prototype expiry and checks that the parent Job remains `OFFERED`. These checks are intentionally centralized so later lifecycle-based expiry rules can replace or extend the initial duration.

The public projection excludes client price, generic manager notes, property access data, other cleaners and other offers. Firestore rules remain authenticated-manager-only until narrower role authorization is designed.
