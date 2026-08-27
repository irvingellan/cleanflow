# CleanFlow

**Realtime operations platform for cleaning teams and short-term-rental turnover workflows.**

CleanFlow is an engineering and product-development project focused on replacing fragmented operational work — scheduling, cleaner coordination, property instructions, job execution, issue handling and financial follow-up — with a structured realtime workflow.

The product is being developed from observed real-world operational patterns while keeping all repository data fictitious and privacy-safe.

## Why this project exists

Small service operations often grow on top of messaging apps, spreadsheets, databases and reservation platforms that were never designed to work as one operational system. That creates repeated manual work, poor visibility and difficult handoffs between managers and field teams.

CleanFlow explores a simpler operating model:

```text
Reservation / manual intake
        ↓
Cleaning Job
        ↓
Cleaner offers & availability
        ↓
Manager assignment
        ↓
Instructions & execution
        ↓
Issues / checklist / photos
        ↓
Completion
        ↓
Financial follow-up
```

## Engineering highlights

- Realtime operational state with Firebase / Firestore
- React 19 + Vite frontend
- Firebase Authentication and Storage foundations
- Server-mediated public cleaner-offer workflow
- Explicit domain state machines instead of loosely coupled UI status flags
- Service-layer separation between UI and persistence
- Unit/component testing with Vitest and Testing Library
- End-to-end testing with Playwright and Firebase emulators
- PWA/mobile-web foundation
- Internationalization architecture
- Audit-oriented operational design
- AI-assisted engineering workflow with repository-level agent instructions and documented architectural constraints

## Current stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, Vite |
| Backend / Realtime | Firebase, Firestore |
| Authentication | Firebase Authentication |
| Storage | Firebase Storage |
| Server functions | Firebase Functions |
| Unit & component tests | Vitest, Testing Library |
| End-to-end tests | Playwright, Firebase Emulator Suite |
| Deployment model | Web / PWA-oriented |

## Architecture direction

CleanFlow intentionally avoids coupling UI components directly to persistence providers.

```text
UI
 ↓
Hooks / feature logic
 ↓
Services
 ↓
Firebase or another backend provider
```

The architecture is designed to keep business rules testable, provider boundaries explicit and future migrations possible.

## Product principles

- Solve observed workflow problems before adding speculative features.
- Prefer deterministic business logic when rules are known.
- Keep manager control explicit for operational decisions.
- Treat realtime updates as an operational capability, not a visual effect.
- Make administrative overrides explicit and auditable.
- Separate operational lifecycle state from exception/issue state.
- Keep sensitive property and financial information behind stronger authorization boundaries.
- Build browser-first and mobile-first for field workers.
- Design toward multi-organization support without premature enterprise complexity.

## Repository documentation

The project uses documentation as part of the engineering process:

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — product context and validated problem space
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — conceptual domain model
- [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) — operational workflows and state transitions
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — architectural decision log
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — staged implementation roadmap
- [`AGENTS.md`](AGENTS.md) — coding-agent instructions and engineering constraints

## Development

```bash
npm install
npm run dev
```

Run unit/component tests:

```bash
npm test
```

Run emulator-backed end-to-end tests:

```bash
npm run test:e2e
```

Run the complete test suite:

```bash
npm run test:all
```

## Project status

CleanFlow is under active development. The current focus is proving complete vertical slices of the operating workflow before expanding into external reservation integrations, automation and AI-assisted operational features.

## Privacy & data policy

This repository is designed to be safe for public technical review. Development and test data are fictitious. Real customer, worker, property-access and payment information should never be committed to the repository.

---

**CleanFlow is both a product experiment and a practical software-engineering case study in realtime systems, domain modeling, automated testing and AI-assisted development.**
