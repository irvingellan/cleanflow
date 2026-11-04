# Pilot feedback UX V1 — operations manager review of 2026-11-04

Status: **IMPLEMENTED LOCAL / TESTED (synthetic)**. Branch `feature/gabi-feedback-ux-v1`,
based on the deployed Cleaner Hub pilot `5469a32`. Not merged, pushed or deployed.
No Functions, Firestore Rules, permissions, indexes, Production data or provider
configuration changed. All examples are fictitious.

The operations manager approved the visual direction and step-by-step flow. This
slice fixes the difficulties she reported without a redesign, reusing the approved
Design System tokens and components.

| Item | Request | State after this slice |
|---|---|---|
| FB01 | Access info and house instructions in the service | UI ready, **needs server read** (`getMyJobAccess`) |
| FB02 | See all future services, not only "Próximas 7" | Done in UI (count labelled; all / by month) |
| FB03 | Approve an interested cleaner without falling into manual assignment | Done in UI |
| FB04 | Checklist visible as a pending task | UI ready, **needs projection field** (`checklist`) |
| FB05 | Upload stopped after 16 photos | **Not addressed** — functional investigation for Codex |
| FB06 | A list of required photos, not "one photo" | Copy fixed; list UI ready, **needs requirements contract** |

## FB03 — Manager: interested cleaners are the decision

`src/features/jobs/InterestDecisionPanel.jsx`, wired in `JobDetail.jsx`.

- `decidableInterestedOffers(...)` returns the INTERESTED Offers whose existing
  Offers-section "Assign" button would be enabled: same rule, never wider. Empty
  while Offers load or fail, for archived Jobs, and for Issue #86 batches
  (`job.offerDistributionMode === "FIRST_ACCEPT_WINS"`), which award on first
  acceptance and need no second approval.
- Primary intent for UNASSIGNED/OFFERED:
  1. with interested cleaners → "Confirmar cleaner interessada" (one) or
     "Revisar interessadas" (several); it focuses the decision panel;
  2. OFFERED, no interest → "Ver ofertas aguardando resposta" (or "Ver ofertas"
     while loading/failing); it focuses Offers;
  3. UNASSIGNED with Offer capability → "Oferecer limpeza para cleaners"; it
     focuses Offers;
  4. otherwise the previous "Atribuir cleaner".
  ASSIGNED, checklist, completion and history primaries are unchanged.
- The panel lists each interested cleaner and response time. "Confirmar {nome}"
  calls the same `onAssignCleaner(offer)` as the Offers section. Interest is never
  shown as assignment. Secondary actions: "Ver todas as respostas" and "Atribuir
  outra pessoa manualmente" (explicit exception; opens the existing picker, which
  still requires its own confirmation). Manual assignment also remains under
  "Mais ações".
- New optional prop `initialFocus="interest"` focuses the panel (or Offers when no
  decision is pending) once Offers have loaded. It is not yet wired to a route.

**Decision to confirm with the operations manager:** an UNASSIGNED Job without
Offers now suggests offering first rather than direct assignment. Revert rule 3 if
direct assignment should stay primary there.

## FB02 — Cleaner: full schedule

`CleanerHubApp.jsx` (`Scheduled`), `cleanerAgendaModel.js` (`agendaMonths`,
`entriesInMonth`).

- "Próximas" is renamed "Agendadas". The number is a labelled badge, with an
  accessible name such as "Agendadas depois de hoje: 8 serviço(s)".
- The summary says how many confirmed services come after today and that all of
  them are listed. When the schedule is not confirmed (cache/offline/error), it
  adds "pode faltar algum", so a loaded count is never presented as complete.
- "Todas as futuras" groups every future Job by month. "Por mês" steps through
  months that contain work. Each Job belongs to exactly one month, so none is
  skipped or duplicated (unit and browser tests). No 7-day or 7-item limit was
  added. The client query has no limit (`where cleanerId ==`).
- **Codex:** confirm with an emulator fixture of more than 7 Jobs across months
  that the projection `cleanerAgenda` contains every eligible Job (timezone,
  rebuild, archived/removed), as the issue text asks. The UI cannot prove it.

## FB04 — Cleaner: checklist situation

`checklistSituation(entry)` in `cleanerAgendaModel.js`.

**Proposed projection field** on ASSIGNED `cleanerAgenda` entries, written by the
server from the Job's current Checklist Run:

```js
checklist: {
  status: "NONE" | "DRAFT" | "READY_FOR_REVIEW" | "ABANDONED", // no Run → "NONE"
  started: boolean, // DRAFT with at least one saved answer or photo
}
```

| Field | Card chip | Detail text | Action (existing `openMyChecklist`) | Pending? |
|---|---|---|---|---|
| absent / unknown value (today) | — | "Toque para abrir e ver…" | "Abrir checklist" | no |
| `NONE` | — | "A gerente ainda não criou…" | none | no |
| `DRAFT`, not started | "Checklist disponível" | released to fill in | "Começar checklist" | yes, while Job ASSIGNED/IN_PROGRESS |
| `DRAFT`, started | "Iniciado · falta enviar" | saved ≠ sent | "Continuar e enviar" | yes |
| `READY_FOR_REVIEW` | "Enviado para revisão" | nothing pending | none | no |
| `ABANDONED` | "Checklist encerrado" | closed by manager | none | no |

- Pending checklists also appear in a notice at the top of the agenda, which works
  without push. A not-yet-started Job is never called late.
- There is no approval/review state, because the model has none.
- **Codex:**
  - write the field in `syncCleanerAgendaForJob`, triggered by Run create, status
    change and the first saved answer/photo (`started`) — not by every save;
  - add it to `comparedFields`, so later edits cause no rewrites or notices;
  - test that it updates on another device;
  - decide whether `started` is worth the extra write, or ship `status` only.

## FB01 — Cleaner: access and house instructions

`AccessSection` in `CleanerHubApp.jsx`, `normalizeJobAccess` in the model.

- "Situação" and "Ciência" are not removed. They move into a collapsed
  "Registro do serviço"; the status also stays as the header chip.
- The section calls the optional `service.getMyJobAccess(jobId)` (exposed as
  `hub.loadJobAccess`) only for ASSIGNED/IN_PROGRESS Jobs, on opening the Job. The
  result lives in component state only: no storage, URL, logs or projection.

**Proposed callable** `getMyJobAccess({ jobId })`, authorized like `openMyChecklist`
(active cleaner membership + current session + on the Job roster + same
organization):

```js
{ state: "available", address?: string, houseInstructions?: string,
  items: [{ kind: "door"|"gate"|"lockbox"|"parking"|"wifi"|"alarm"|"note", label?: string, value: string }] }
{ state: "not-provided" }                    // nothing authorized for cleaners
{ state: "not-yet", availableFromMs: number } // time window not open (rule TBD)
{ state: "revoked" }                          // removed from roster / access ended
{ state: "denied" }                           // anything else
```

- Without the callable (today), the section shows "Endereço, códigos e instruções
  da casa continuam vindo da gerente por enquanto", which is the current truth.
- Unknown shapes become `unsupported`. Values are trimmed and capped, and no code
  is ever derived from the property name.
- **Codex and the operations manager must still decide:**
  - which Property fields are cleaner-authorized (the existing `accessInstructions`,
    `keyCodeInfo` and `garageParking` are manager-internal today);
  - the time window;
  - security tests for: unassigned cleaner, another organization, revoked session,
    and Offer-only recipient (must be denied);
  - no codes in push, inbox, URL, logs or client reports.

## FB06 — Checklist: photo requirements

- The guidance copy (PT/EN/ES) no longer says "salve uma foto obrigatória de
  pertences", which read as "one photo is enough". It asks for every photo the
  checklist requests, keeps the under-bed check as required and allows as many
  photos as needed. Formats moved to their own line. Server validation, limits and
  the single required alias are unchanged.
- `PhotoRequirementList` renders only if the Run provides `photoRequirements`.

**Proposed contract**, frozen per Run at creation from the template or property:

```js
photoRequirements: [{ id: string, label: string, hint?: string }]
evidence[].photoRequirementId?: string // which requirement a saved photo satisfies
```

- No global minimum is invented. A per-requirement minimum, if ever approved,
  belongs in the same contract and in server validation.
- Old Runs get no retroactive obligations.
- `photoRequirementsSample: true` labels a list "Exemplo — lista não publicada"
  (synthetic previews only).
- **Codex:** define and validate it server-side, link uploads to a requirement, and
  show missing requirements in manager review. No approved list exists yet for any
  property.

## FB05 — 16-photo stop (not a visual issue)

Not changed here. Facts for the investigation (code reading only, unproven):

- client cap: `Math.min(20, evidencePolicy.maxPhotos)` in
  `useChecklistPhotoGallery.js`;
- server cap: `maxPhotos` (default 20) **and** `maxTotalBytes` (50 MiB) per Run in
  `checklistMultiPhotoService.js`. Sixteen large optimized photos could reach the
  byte quota first; a local retained-bytes queue limit also exists;
- reproduce with 15/16/17/20 unique images, as described in the feedback record.

## Verification (2026-11-04)

| Suite | Result |
|---|---|
| Vitest, full (`npx vitest run`) | 127 files / 1,412 tests passed (new: `InterestDecision`, `CleanerHubFeedback`, `PhotoRequirementList`, model rules; 10 existing assertions updated for the new primary intent) |
| Synthetic browser checks (`e2e/pilot-feedback/feedback.spec.js`), Chromium 1440×900 + WebKit iPhone 13, light | 24/24 passed |
| Emulator-mode build (`vite build --mode emulator`) | passed; harness fixtures absent from the bundle |

Not run: emulator E2E and security suites (no backend change), physical devices,
Production. Screenshots are synthetic and do not prove server behaviour.

Run the harness locally:

```bash
npx vite --config e2e/pilot-feedback/vite.config.js
```

Then open http://127.0.0.1:4291/?screen=manager&scenario=one, `?screen=hub` or
`?screen=checklist&photos=16`. To run the checks or screenshots:

```bash
PILOT_SPECS=feedback.spec.js npx playwright test -c e2e/pilot-feedback/playwright.config.js
```

The harness resolves every `firebase/*` import to a stub that throws if called.
