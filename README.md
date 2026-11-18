# CleanFlow

**A realtime operations platform for cleaning companies — built solo, running in production, and used every day by a real cleaning business.**

[![Engineering checks](https://github.com/irvingellan/cleanflow/actions/workflows/engineering.yml/badge.svg)](https://github.com/irvingellan/cleanflow/actions/workflows/engineering.yml)
![React 19](https://img.shields.io/badge/React-19-149eca)
![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%7C%20Functions%20%7C%20Auth-ffca28)
![Tests](https://img.shields.io/badge/tests-2%2C000%2B%20unit%20%2B%20e2e-2d5a46)
![PWA](https://img.shields.io/badge/PWA-mobile%20first-5a0fc8)

Built by **Irving Ellan** · [LinkedIn](https://www.linkedin.com/in/irvingellan) · [Website](https://irvingellan.com)

CleanFlow replaces the WhatsApp threads, spreadsheets and memory that small cleaning teams run on with one
structured workflow: a service is scheduled, offered to cleaners, assigned, executed with a photo checklist,
reported to the client and closed out for payment. Managers work on a laptop; cleaners work from their phones.

> All screenshots and data in this repository are fictitious. The production deployment serves a real
> short-term-rental cleaning operation; its data never leaves its Firebase project.

<p align="center">
  <img src="docs/screenshots/01-dashboard.png" alt="Manager operations dashboard" width="100%">
</p>

| Service detail | Weekly close |
| --- | --- |
| ![Job detail with service type, assigned cleaner and checklist progress](docs/screenshots/02-job-detail.png) | ![Weekly close: client charges, cleaner payouts and margin](docs/screenshots/03-weekly-close.png) |
| **Cleaner agenda (manager view)** | **Cleaner Hub (phone) · Client report** |
| ![Weekly agenda per cleaner with WhatsApp handoff](docs/screenshots/04-cleaner-agenda.png) | <img src="docs/screenshots/05-cleaner-hub-mobile.png" alt="Cleaner Hub on a phone" width="49%"> <img src="docs/screenshots/06-report.png" alt="Client cleaning report" width="49%"> |

## What it does

| For the manager | For the cleaner | For the client |
| --- | --- | --- |
| Operations dashboard: today's services and what needs attention | **Cleaner Hub** PWA: agenda, offers, push notifications | Cleaning **reports with photos** |
| Services by type: turnover, deep cleaning, move-in/out, post-construction | Accept an offer — first accept wins, enforced on the server | A read-only **client portal** |
| Offers to one or many cleaners, direct assignment, replacement | Photo checklist for each property | Shared through revocable token links |
| Weekly agenda per cleaner, copied to WhatsApp with reschedule highlights | | |
| Weekly close: client charges vs cleaner payouts, never mixing incomplete data | | |
| Issues, history, archive and audit trail | | |

English, Portuguese and Spanish throughout — the team is multilingual.

## Architecture

```mermaid
flowchart LR
  subgraph Clients
    M[Manager app<br/>React 19 + Vite]
    C[Cleaner Hub PWA]
    P[Public links<br/>offer · checklist · report · portal]
  end
  subgraph Firebase
    A[Auth]
    F[(Firestore<br/>security rules)]
    S[(Storage)]
    FN[61 Cloud Functions<br/>Node 22]
    FCM[Cloud Messaging]
  end
  M --> A
  M --> F
  C --> A
  C --> FN
  P --> FN
  FN --> F
  FN --> S
  FN --> FCM
  FCM --> C
```

- **Server-mediated trust.** Cleaners and public links never read Firestore directly: every action goes through a
  callable Function that checks identity, organization and token scope. Security rules are tested in the emulator.
- **Explicit state machines** for the service lifecycle, offers and assignments instead of loose UI flags.
- **Layered features** (`ui → hooks → services → provider`) so business rules stay testable without Firebase.
- **One bundle per entry point** (manager, cleaner, public pages), lazy-loaded, for a fast first paint on phones.
- **Read deadlines** on every one-shot query, so a stalled realtime channel on iOS Safari becomes a handled
  error instead of a 30-second hang — a problem found through production telemetry.

## Engineering practices

| Practice | How |
| --- | --- |
| Testing | **2,000+** Vitest unit and component tests, Playwright end-to-end suites on Chromium and WebKit, emulator-backed security-rules tests |
| CI | Every pull request into `main` runs unit tests, the emulator build, the security suites and every browser suite |
| Releases | A release script rebuilds the live version byte-for-byte as an instant rollback, checks CI and per-function environment, then deploys |
| Refactoring | A multi-phase plan landed as small reviewed PRs with no behavior change — e.g. `App.jsx` 1,812 → 74 lines, `JobDetail.jsx` 2,511 → 1,161 |
| Observability | Page-load and operation telemetry with timeouts, used to find and fix slowness on real devices |
| Privacy | No real names, addresses, access codes or payment data in the repo; door codes never appear in notifications or URLs |

## Built with AI agents — deliberately

I design, review and ship; AI coding agents (Claude Code, Codex) help implement. The repository is set up for that:

- [`AGENTS.md`](AGENTS.md) and [`docs/AI_DEVELOPMENT_PLAYBOOK.md`](docs/AI_DEVELOPMENT_PLAYBOOK.md) define the constraints every agent follows.
- Large changes start as a written plan, then land as chained PRs that each pass the full CI.
- Every agent PR is reviewed line by line and checked in the real app before release.

The result: one developer maintaining a production system with the safety net of a team.

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, Vite, PWA, CSS design tokens (light and dark) |
| Backend | Firebase Cloud Functions (Node 22), Firestore, Storage, Auth, Cloud Messaging |
| Testing | Vitest, Testing Library, Playwright, Firebase Emulator Suite |
| CI/CD | GitHub Actions, scripted releases with rollback |
| i18n | English, Portuguese, Spanish |

## Run it locally

```bash
npm install
npm run dev                                 # the app against emulators or your own Firebase project
npm test                                    # unit and component tests
npm run test:e2e                            # emulator-backed browser tests
npm run scenario -- weekly-close --watch    # replay a fictional end-to-end scenario
```

## Documentation

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — the problem and the product
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — domain model
- [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) — lifecycles and state transitions
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — architecture decision log
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — what comes next

## Author

**Irving Ellan** — software developer. I built CleanFlow end to end: product discovery with a real operator,
architecture, implementation, testing and production operations.

**Open to software engineering roles.**
[LinkedIn](https://www.linkedin.com/in/irvingellan) · [Website](https://irvingellan.com) · [GitHub](https://github.com/irvingellan)
