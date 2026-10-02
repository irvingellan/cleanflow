# Operations Workspace V1 — intent-first local experiment

Issue #51; branch `feature/operations-workspace-v1-intent-first-2026-10-02`.
Based on main `6dd45a9`, not rebased from the stale V0 branch. Not approved
for production, not deployed, not a replacement for Job Detail.

## Run locally

```sh
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/workspace-intent-preview.html`. Select EN/PT/ES.
The separate HTML entry only mounts in Vite development on a loopback hostname.
The normal production build does not include this entry or its component.
No authentication, Firebase reads/writes, real records, messaging or worker
registration is used by the experiment. There is no production route/navigation.

## Scope and limitations

Five fictitious Jobs demonstrate unassigned, assigned without checklist, DRAFT,
READY_FOR_REVIEW and completed contexts. The selected Job is central; five human
intentions stay visible. One suggested action is sticky on mobile. Technical state
is collapsed. Rules appear only when an intention is selected. Narrow screens
focus/scroll the inline explanation into view; no modal framework is introduced.

These are **interactive navigation/explanation previews, not functioning mutation
forms**. They do not claim assignment, schedule change, completion or submission
has happened. Job Detail remains the execution surface. Completed historical/report/
payment paths are described, not newly implemented. The fixed 28-item summary
represents a synthetic default-v1 Run, not Property customization testing.

The existing Job Detail schedule availability condition was extracted without
changing its order/semantics and is reused here. Any existing initial Run locks
rescheduling, including DRAFT/abandoned. Review is a safe next destination, not
a promise to unlock the schedule; deletion/recreation is never suggested.
Existing assigned-cleaner presentation and TranslationProvider are reused.
Other panels describe established actions without authorizing/executing them;
there is no second rule engine, controller or backend.

## V0 comparison

Retained ideas: persistent service selection, one next-step suggestion, localized
human task labels, separation of summary/actions from technical detail.
No V0 code was cherry-picked. Its controller plumbing, mutation-generation
extensions, composition portals and service reads were not ported: they were
based on older Job/Checklist code and are unnecessary for this local UX study.
The main panel, mobile sticky action and disclosure were rebuilt minimally.

## Validation

```sh
npx vitest run src/features/workspace/OperationsWorkspaceV1.test.jsx src/features/jobs/JobDetail.test.jsx
npx playwright test --config playwright.workspace-v1.config.js
npm test
npm run build
git diff --check
```

Playwright uses only loopback Vite and synthetic in-memory fixtures, not emulator
or production records. It rejects non-loopback/API requests, checks runtime
errors, all four requested intentions, focus, sticky action, page overflow and
reload reset at 1440px and 390×844. Screenshots are ignored local artifacts under
`artifacts/visual-smoke/workspace-v1-*.png`.

Worth a guided UX review with the operations manager, not a real cleaning test.
Ask whether she finds the intention and understands the blocked schedule path;
do not infer faster operation or authorize integration from synthetic tests alone.
