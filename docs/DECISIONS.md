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

Provider choice can evolve later.

---

## DEC-013 — Do not prematurely integrate external platforms

Status: Accepted

Hospitable, Guesty, WhatsApp and other integrations are important future capabilities.

First prove the internal operational workflow.

External integrations should be added after the core domain is stable enough to receive their data.

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

In the interface, `interested` may appear as “Tenho interesse” and `declined` as “Não posso”.

---

## DEC-015 — Simplify the initial Job lifecycle

Status: Accepted

The initial Job lifecycle is:

`UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED`

`CONFIRMED` is not part of the initial lifecycle. It should be reintroduced only if future discovery identifies a real confirmation step after assignment.

`CANCELLED` and `REOPENED` remain possible future states but are not part of the first vertical slice.

---

## DEC-016 — Manager selects invite recipients in the first vertical slice

Status: Accepted

For the first vertical slice, the manager manually selects which cleaners receive a job offer.

Automatic eligibility rules and cleaner recommendations are deferred until later discovery and implementation.

---

## DEC-017 — Cleaner mobile link access remains an open decision

Status: Open

Authentication and authorization for cleaner mobile links are intentionally undecided.

This decision must be resolved before implementing the real cleaner mobile invite flow.
