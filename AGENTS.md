# CleanFlow — Agent Engineering Guide

CleanFlow is a realtime operations platform being developed around observed short-term-rental cleaning workflows. The project uses an **anonymized design-partner model**: product decisions may be informed by real operational discovery, but personally identifying details, credentials, access codes, payment information and production customer data must never be committed to this repository.

Requirements are expected to evolve as workflows are validated. Agents should optimize for correctness, traceability and reversible engineering decisions rather than speculative feature volume.

## Source-of-truth documents

Before significant work, consult the relevant documentation:

- Product behavior → `docs/PRODUCT.md`
- Domain/data changes → `docs/DATA_MODEL.md`
- Workflow/status changes → `docs/WORKFLOWS.md`
- Architecture decisions → `docs/DECISIONS.md`
- Priorities → `docs/ROADMAP.md`

When documentation and a newer explicit task conflict, surface the conflict before destructive or broad architectural changes.

## Core engineering principles

1. Implement behavior supported by product documentation or an explicit task.
2. Prefer simple, reversible solutions during early development.
3. Avoid premature scale optimization.
4. Keep UI components independent from Firestore and external-provider details.
5. Access persistence and external services through dedicated service boundaries.
6. Keep deterministic business rules deterministic.
7. Use AI only where interpretation, language understanding or uncertain reasoning adds genuine value.
8. Make important operational mutations auditable.
9. Make administrative overrides explicit application actions rather than silent database edits.
10. Treat direct production-database editing as an exceptional maintenance operation, never a normal business workflow.
11. Use realtime behavior where it creates operational value.
12. Keep field-worker experiences browser-first and mobile-first unless a native requirement is validated.
13. Treat messaging platforms as notification/entry channels rather than substitutes for structured workflows.
14. Design for internationalization from the beginning.
15. Use English for code identifiers and canonical technical terminology.
16. Keep user-facing strings behind the i18n layer.
17. Design toward multiple organizations; never hard-code the initial design partner as the permanent tenant.
18. Apply stronger authorization boundaries to financial and property-access information.
19. Keep operational lifecycle state separate from issue/exception state.
20. Avoid unrelated refactors while implementing focused features.
21. Preserve testability: business logic should be independently testable wherever practical.
22. Never introduce secrets, real customer data or personally identifying design-partner information into source control.

## Architecture direction

Current stack and direction:

- React
- Vite
- Firebase Authentication
- Firestore
- Firebase Storage
- Firebase Functions where server mediation is required
- Vitest / Testing Library
- Playwright + Firebase Emulator Suite

Preferred dependency flow:

```text
UI
 ↓
hooks / feature logic
 ↓
services
 ↓
Firebase or another backend provider
```

Provider-specific behavior should remain at system boundaries. Domain rules should not depend unnecessarily on Firestore document shapes.

## Testing expectations

For behavioral changes:

- add or update focused unit/component tests when practical;
- preserve deterministic test fixtures;
- use Firebase emulators for integration/E2E scenarios that depend on backend state;
- prefer reproducing a bug in a test before fixing it when the failure can be captured reliably;
- run the smallest relevant test set during iteration and the broader suite before declaring substantial work complete.

Useful commands:

```bash
npm test
npm run test:e2e
npm run test:all
```

## Privacy and repository hygiene

Agents must not commit:

- `.env` files containing live values;
- service-account credentials or private keys;
- production access codes or property instructions;
- real phone numbers, addresses or payment details;
- raw customer/worker conversations;
- personally identifying design-partner notes.

Use fictitious fixtures and generic terms such as **design partner**, **operations manager**, **client**, **cleaner**, and **property** in public technical documentation.

## Current operational slice

The core Job lifecycle is:

`UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED`

Important constraints:

- The manager chooses which cleaners receive offers.
- A cleaner may respond `interested` or `declined`.
- Interest never assigns the Job automatically.
- Assignment is a manager action represented on the Job.
- Competing cleaner responses remain private from other cleaners.
- Automatic cleaner recommendation/eligibility logic is deferred until explicitly scoped.
- `CONFIRMED`, `CANCELLED` and `REOPENED` are not part of the initial lifecycle unless product discovery later justifies them.

## Scope discipline

Do not introduce these capabilities merely because they are plausible:

- direct Airbnb integration;
- real payment processing or payroll;
- production WhatsApp integration;
- autonomous operational agents;
- complex analytics;
- native mobile applications.

They may be added when an explicit requirement, security model and implementation plan exist.

## Agent completion standard

Before marking a task complete, verify:

1. The requested behavior is implemented.
2. Existing behavior was not unintentionally changed.
3. Relevant tests pass or any test limitation is clearly reported.
4. No secrets or personal data were introduced.
5. Documentation is updated when the task changes domain behavior, workflow, architecture or roadmap assumptions.
6. The final change remains understandable to a human engineer reviewing the repository without prior conversation context.
