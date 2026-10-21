# Codex Implementation Handoff — Manager Workspace V3

Date: 2026-10-20. Branch with the prototype: `feature/manager-workspace-v3-prototype`
(based on `feature/design-system-v2-production-rc` @ 7f941b7). Nothing here is
approved for Production. Read with:

- `docs/manager-workspace-v3/CLEANFLOW_MANAGER_INTERACTIONS_V3.md` — behaviour
- `docs/manager-workspace-v3/CLEANFLOW_COMPONENT_HANDOFF_V3.md` — components and paths
- `docs/manager-workspace-v3/CLEANFLOW_LAYOUT_COMPARISON_V3.md` — why Hybrid C+A
- the prototype itself: `npm run prototype:v3`

## Ground rules

1. **Presentation phases (1–5) change no business rule, Firestore shape, rule, Function or index.** They reuse existing services, queries and handlers.
2. **Backend/business-rule items (phase 6) each need an explicit product decision and their own release.** Do not fold them into presentation PRs.
3. **Production exclusion:** the prototype and its synthetic data must never enter a Production build. `src/prototypes/**` is not imported by `src/main.jsx`/`src/App.jsx`; a test enforces this. Keep it that way; port code, do not import it.
4. **Out of scope for this work:** the Functions Node 22 migration (`codex/functions-node22-migration`), the Reservation Intake bridge, any reservation sync or scheduled job, notification delivery fixes, payroll.
5. Keep Design System V2 rules: tokens only, icon + text for state, 44 px targets, both themes, EN/PT/ES strings via `translate()`.
6. Release path as today: branch → Sandbox Hosting → human review (operator test in `GABI_NEXT_UX_TEST.md`, kept outside the repo) → separately authorised Production Hosting release.

## Phase 0 — Baseline and reconciliation

- **Goal:** pick the base and avoid duplicate work.
- **Decide first:** whether V3 builds on the inactive V2 RC (`feature/design-system-v2-production-rc`) or waits for it to ship. Recommended: ship the RC first, then V3 on top.
- **Reconcile:** `codex/cleaner-checklist-completion-ux` (completion clarity) and `codex/checklist-multi-photo-v1` (multi-photo) overlap Phase 5. Do not reimplement them; extend them.
- **Evidence:** a short note in `docs/CURRENT_STATE.md` naming the chosen base and the reconciled branches.

## Phase 1 — Hybrid Operação: service list, detail and date range (presentation)

- **Goal:** the A-style operational screen as the manager's service list, with the date control.
- **Files likely involved:** `src/features/jobs/ServicesV2Pilot.jsx`, `src/features/jobs/JobsPage.jsx`, `src/features/jobs/useJobsWorklist.js`, `src/features/jobs/jobListFilters.js`, `src/features/jobs/JobDetailV2Pilot.jsx`, `src/components/v2/primitives.jsx`, new `src/features/workspace/` (DateRangeControl, JobRow, Worklist), `src/i18n/translations.js`.
- **Port from prototype:** `model/time.js` (LA day keys, ranges), the `JobRow` container-query layout, `Worklist` composition, `DateNav`.
- **Scope:**
  - Date range Hoje / Amanhã / Semana (Mon–Sun, America/Los_Angeles) / specific day, prev/next; keeps search, filters, selection and scroll.
  - Filters map to existing `jobListFilters` statuses; add only presentation filters that can be computed from data already loaded.
  - List | detail | next-action layout at ≥1100; full-screen detail below 720 with sticky primary action.
- **Not in scope:** attention items that need data the list does not load today (checklist submitted, acknowledgment, issues). Show them only where the existing view already has them; the list read model is Phase 6g.
- **Dependencies:** Phase 0; V2 primitives.
- **Acceptance:**
  - Same jobs, ordering and pagination as the current list for the same filter.
  - Range changes never clear search/selection; an out-of-range selected job shows the note.
  - Day boundaries correct for LA, including the DST change (unit tests from `model.test.js`).
  - No horizontal scroll at 360/390/768/1280/1440; light/dark; PT/EN/ES.
- **Regression risks:** scroll restoration, pagination (Load more), dashboard → filtered list links, existing Playwright Services specs.
- **Tests:** unit for range helpers and filter mapping; component tests for keep-selection-on-range-change; Playwright 390/768/1440 light/dark.
- **Production exclusion:** behind the existing V2 experience flag until released.
- **Evidence:** screenshots at three widths and both themes; test counts; no change in `services/` or `functions/`.

## Phase 2 — Hybrid Agora: entry screen (presentation)

- **Goal:** C-style first screen: headline, command field with shortcuts, "Comece por", attention queue, day cards, daily questions.
- **Files:** `src/features/dashboard/Dashboard.jsx`, `DashboardV2Pilot.jsx`, `useDashboardController.js`, `dashboardService.js` (read-only use), new `src/features/workspace/Now*.jsx`, `attention.js`.
- **Port:** `selectors.js` → `attention.js` as pure functions over the data `dashboardService` already returns (needs-assignment, interest, offers awaiting reply, open issues, next 48 h). Keep the existing priority order (`selectPriorityAttentionItems`: today/tomorrow without cleaner first).
- **Scope:** headline counts equal the queue; each queue item opens the service in Operação with the "Precisam de você" filter (desktop) or as full-screen detail over Agora (phone); command field matches property names and verbs deterministically (no AI); "Futuro · experimental" reservation card is optional and inert.
- **Dependencies:** Phase 1.
- **Acceptance:** at 1440×900 the command field, the hero, the first queue items and the today card are visible without scrolling; counts in queue, chips and list never disagree (single source); "Interest never assigns" copy present on interest items.
- **Risks:** attention rules that cry wolf or hide work — keep them in one tested module.
- **Tests:** attention unit tests mirroring `model.test.js` "derives the attention each scenario needs"; Agora → Operação transition test; keyboard `/`.
- **Evidence:** before/after dashboard screenshots; attention rule table in the PR.

## Phase 3 — Offer composer and cleaner offer page (presentation + copy)

- **Goal:** fewer steps to offer, and a cleaner page that gets answered through the link.
- **Files:** `src/features/jobs/JobWorkflowViews.jsx` (offer UI), `src/features/jobs/offerCompensation.js`, `src/features/jobs/jobOfferService.js` (read/use only), `src/features/public-offers/*`, the public offer page in `src/App.jsx` (`public-offer-*`), `src/i18n/translations.js`.
- **Scope:**
  - Pre-fill the compensation from the existing known value (`offerCompensation` / legacy suggestion) with "não muda nenhum acordo"; overriding requires a reason shown in the UI only (persisting the reason is 6f).
  - Create the public link as part of "Registrar ofertas" using the existing callable; no extra modal.
  - Message templates A ("Detalhes primeiro") and B ("Ação em destaque") in the cleaner's language; both explain that only the link registers the answer; no address or access data.
  - Public offer page: large facts (when, area, pay, what to expect), sticky "Tenho interesse"/"Não posso", clear "not yet a confirmation" result, "Mudei de ideia".
- **Dependencies:** none beyond V2 primitives (can run in parallel with 1–2).
- **Acceptance:** an offer with known pay needs no typing; link exists right after registering; cleaner page passes 390 px, 200 % text zoom, VoiceOver labels; interest still never assigns.
- **Risks:** changing the amount semantics by accident — keep `offerCompensation` logic untouched and tested.
- **Tests:** existing offer tests unchanged; new component tests for pre-fill and override-needs-reason; Playwright public offer page mobile.
- **Evidence:** message A/B screenshots in PT/EN/ES; a field comparison plan (which cleaners got A vs B).

## Phase 4 — Notification inbox UI on existing data (presentation, partial)

- **Goal:** let the manager find a notification she tapped too fast.
- **Scope now:** only what the client already knows — notifications it received while open (`notificationService`) plus links to the related service. Show the honest delivery wording.
- **Full version depends on 6a** (stored history). Ship the drawer and empty/loading/error states first.
- **Files:** `src/features/notifications/*`, new `src/features/notifications/NotificationInbox.jsx`.
- **Acceptance:** opens from the bell; filters; "Abrir serviço" selects the service and marks read; never claims "delivered" without evidence.
- **Tests:** component tests for read/unread and filters.

## Phase 5 — Cleaner checklist submission clarity (presentation; extend existing branches)

- **Goal:** a cleaner can never believe a draft was submitted.
- **Files:** `src/features/checklists/PublicChecklistPage.jsx`, `usePublicChecklistDraft.js`, multi-photo files from `codex/checklist-multi-photo-v1`.
- **Scope:** persistent draft banner with autosave time; sticky "Revisar e enviar · N pendências"; review step with missing list and jump links; required explanation when evidence is missing; required "Confirmo que terminei a limpeza no local" (if product agrees — see 6c note); success screen with server time; extra photos after submission are additive.
- **Acceptance:** submit is impossible while photos upload or failed; success shows only after the server confirms; nothing submitted is replaced or deleted; works on iPhone Safari.
- **Risks:** the existing ready-for-review semantics; photo limits (keep the pilot cap until 6e decides).
- **Tests:** extend `PublicChecklistPage.test.jsx` and the multi-photo tests; Playwright WebKit mobile.

## Phase 6 — Backend and business-rule items (each separate, each needs a decision)

| # | Item | Needs | Notes |
|---|---|---|---|
| 6a | Notification history | New `notifications` record per manager with type, related job, created, read, opened; rules; writes from existing Functions paths | Delivery "displayed" cannot be known server-side; only accepted/opened |
| 6b | Text reply recorded by manager | `via: "message"` on an offer response + audit entry | Must stay distinguishable from link replies |
| 6c | Checklist approval | New reviewed state + reviewer + time, audited | Today no approval is stored; completion stays a separate action |
| 6d | Property checklist templates with versions | Template collection per property, version snapshot on run creation | Submitted runs never rewritten |
| 6e | Photo limit | Decide cap (pilot 20; field 30+), storage cost, upload strategy | Multi-photo V1 is not confirmed in Production |
| 6f | Service types, hourly pay, override reason | Data model + payout rule + approval of hours | Payroll stays out of scope |
| 6g | List read model | Per-job summary of checklist state, acknowledgment and open issues for lists and Agora | Avoids per-row reads (see Compact Lifecycle V0 note) |
| 6h | Access code release | Store codes outside public docs; release window to assigned cleaner; view audit | Never in offers, notifications or previews |
| 6i | Notification reliability | Engineering investigation of "New Notification" display and the silent second device | Not a UX task; do not claim fixed by UI |

For each: write the rule in `docs/BUSINESS_RULES.md`/`docs/WORKFLOWS.md`, add emulator tests, security tests for new rules, and release separately.

## Required evidence for every phase

- Branch and commit SHA; files changed; confirmation that `functions/`, `firestore.rules`, `storage.rules`, indexes are unchanged (phases 1–5).
- Unit and Playwright counts; screenshots at 390/768/1440, light and dark, PT and EN.
- `VISUAL_ACCEPTANCE_CHECKLIST.md` (Design System V2 package) filled in.
- Sandbox Hosting URL used for the operator review, and the operator test results.
