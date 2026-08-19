# CleanFlow — Agent Instructions

CleanFlow is a realtime operations platform being designed initially around a real short-term-rental cleaning operation.

The first design partner is Gabriela, who currently coordinates multiple Airbnb/short-term-rental properties, clients, cleaners, scheduling, instructions, payments and administrative work using tools including WhatsApp, Notion, Hospitable and Guesty.

The project is currently in discovery and early prototyping. Requirements can change as real workflows are observed.

## Core engineering principles

1. Do not implement product behavior that is not supported by PRODUCT.md, WORKFLOWS.md or an explicit task.
2. Prefer simple and reversible solutions during early development.
3. Do not prematurely optimize for large scale.
4. Do not couple UI components directly to Firestore or other external providers.
5. Access external services through dedicated service layers.
6. Use deterministic application logic when rules are known.
7. Use AI only when interpretation, language understanding or uncertain reasoning adds real value.
8. Important operational mutations should be auditable.
9. Administrative overrides must be explicit actions, not silent database edits.
10. Production database editing should not be part of normal business workflow.
11. Design for realtime operation where realtime creates operational value.
12. Cleaner/worker experience is browser-first and mobile-first. A native app is not required for the initial product.
13. WhatsApp should initially be considered a notification/entry channel, not the place where complex structured workflows live.
14. Internationalization must be considered from the beginning.
15. English should be used for code identifiers and canonical technical terminology.
16. User-facing strings should eventually live behind an i18n layer rather than being scattered directly through components.
17. The system must eventually support multiple organizations. Do not hard-code Gabriela as the only possible organization.
18. Financial information and sensitive property-access information require stronger permissions than ordinary operational information.
19. An operational issue should not automatically replace the primary job lifecycle status.
20. Avoid unrelated refactors when implementing a focused feature.

## Planned frontend architecture

Current intended direction:

- React
- Vite
- Firebase Authentication
- Firestore
- Firebase Storage when needed
- Netlify initially for web deployment

This is a current direction, not an irreversible commitment.

The UI should not access Firestore directly throughout the application.

Preferred conceptual flow:

UI
→ hooks / feature logic
→ services
→ Firebase or another backend provider

## Documentation rules

Before making significant changes:

- Product behavior → read `docs/PRODUCT.md`
- Domain/data changes → read `docs/DATA_MODEL.md`
- Workflow/status changes → read `docs/WORKFLOWS.md`
- Architecture decisions → read `docs/DECISIONS.md`
- Priorities → read `docs/ROADMAP.md`

If documentation conflicts with an explicit newer task from the user, flag the conflict before making a destructive or broad architectural change.

## Current project stage

The current goal is NOT to build the entire platform.

The first implementation should eventually prove a small vertical operational slice using fictitious data.

For the first vertical operational slice:

- The initial Job lifecycle is `UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED`.
- `CONFIRMED` is not part of the initial lifecycle. Reintroduce it only if future discovery identifies a real confirmation step after assignment.
- The manager manually selects which cleaners receive each offer.
- A cleaner can mark a Job Invite as `interested` or `declined`; the manager assigns the job.
- Do not use `accepted` as a Job Invite status.
- Automatic cleaner eligibility and recommendation rules are deferred.
- `CANCELLED` and `REOPENED` remain future possibilities and are not part of the first vertical slice.
- Authentication and authorization for cleaner mobile links remain an open decision that must be resolved before implementing the real flow.

Do not add:

- direct Airbnb integration
- real payments
- payroll processing
- production WhatsApp integration
- AI agents
- complex analytics
- native mobile applications

unless explicitly requested later.
