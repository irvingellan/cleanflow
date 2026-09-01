# CleanFlow — Codex Engineering Guidelines

This guide records stable implementation practices. Product behavior, domain rules,
workflow state, and architectural decisions remain in `PRODUCT.md`, `DATA_MODEL.md`,
`WORKFLOWS.md`, and `DECISIONS.md`.

## Before editing

- Run `git status --short`. Stop and report unexpected working-tree changes.
- Read the smallest relevant feature, service, tests, and source-of-truth documents
  before changing behavior.
- Reuse existing helpers and service APIs when they fit the task; do not recreate
  parallel behavior without a clear reason.

## Architecture and compatibility

- Keep Firebase and other provider access in feature services.
- Hooks/controllers coordinate services and UI state; components do not implement
  Firestore queries, writes, or provider configuration.
- Prefer domain-specific feature boundaries over generic entity abstractions.
- Keep cross-feature navigation and origin/back state in the application shell unless
  moving it has a demonstrated ownership benefit.
- Preserve canonical IDs, historical snapshots, and safe fallbacks for legacy records.
- Do not introduce broad Context/global-state systems without a demonstrated need.

## Testing and validation

For meaningful code changes, run:

```bash
npm test
npm run test:e2e
npm run build
git diff --check
```

- Tests must use fixtures and emulators, never production Firebase.
- Do not weaken or delete an existing test merely to make a change pass.
- Add focused unit/component coverage when practical; use emulator-backed E2E tests
  for navigation or persistence behavior that depends on backend state.
- For meaningful visual or multi-step workflow changes, use the local visual-smoke
  workflow when available after deterministic checks. Treat it as exploratory evidence,
  not a replacement for Playwright regression coverage.

## Safety

- Do not deploy, commit, push, force-push, or alter production data unless explicitly
  requested.
- Do not change schemas, indexes, or security rules unless the task requires it; state
  the reason and impact clearly.
- Never add secrets, live environment values, or identifying design-partner data to the
  repository.

## Maintainability and refactoring

- Prefer clear names over excessive comments. Comment only non-obvious business rules,
  legacy compatibility, security, query/index reasoning, or architectural decisions.
- Avoid premature abstractions, micro-components, and unrelated refactors.
- Structural refactors must preserve behavior. Move state only when ownership improves.
- `App.jsx` may retain application-shell responsibilities; line-count reduction alone is
  not a reason to extract code.
- Keep each feature understandable locally for a human maintainer.

## Codex efficiency

- Read the minimum relevant files first; avoid broad repository scans once feature
  boundaries are known.
- Final reports should be concise: files changed, behavior impact, validation, risks,
  and a recommended commit message.
