# CleanFlow — AI Development Playbook

This playbook makes Codex work predictable without adding a second agent
framework. It complements [CODEX_GUIDELINES.md](CODEX_GUIDELINES.md): the
guidelines are stable rules; this document selects an execution mode for a
specific task.

## 1. Classify the request before editing

| Shape | Use | Expected artifact |
| --- | --- | --- |
| Small, clear, isolated fix or document change | Direct Codex | Focused change and relevant check |
| Bounded feature in one known feature boundary | Direct Codex with a short implementation plan | Change, focused test where practical, standard gates |
| Ambiguous product, security, data-model, or cross-feature work | Brainstorm / read-only design first | Decisions, invariants, options, and approved plan |
| Two or more independent, well-scoped tracks | A planned Maestri wave, only when delegation is authorized | Per-task evidence, then controller review |

Use the lightest mode that safely fits. A narrow request does not need a
ceremony-heavy plan; uncertainty, persistent data, authorization, or a shared
application-shell change does.

## 2. Native Codex-first delivery loop

```text
Request → size and inspect → clarify ambiguous decisions → plan
→ Direct Codex or authorized Maestri wave → implementation
→ deterministic gates → optional emulator visual smoke → human validation
→ human commit/push → issue checkpoint → selective durable documentation
```

- Start with `git status --short` and the smallest relevant source, service,
  test, and product documents.
- State the invariant and explicit non-goals before changing a consequential
  workflow.
- For a bug, reproduce or capture the failure evidence before selecting a
  fix. Compare a working path when useful.
- Keep provider calls in services, feature state in hooks/controllers, and
  cross-feature back/origin navigation in the application shell.
- Human approval is required for deploy, commit, push, production data work,
  or a materially new product decision unless explicitly granted.

## 3. Brainstorm and planning gate

Use a short design checkpoint when at least one applies:

- the request has multiple reasonable product interpretations;
- it changes data, lifecycle, authorization, privacy, money, or a public
  projection;
- it crosses feature boundaries with unclear ownership;
- it would add a dependency, provider, or durable automation.

The checkpoint records: desired outcome, current facts, invariants, options,
recommended smallest slice, deferred work, and verification. It does not
invent a business policy. A clearly bounded repair can proceed after focused
inspection without a separate planning document.

## 4. Direct Codex and Maestri waves

**Direct Codex is the default.** It is lowest risk for a cohesive feature or
any change to shared state, services, rules, configuration, or the app shell.

Use a Maestri wave only when delegation is explicitly authorized and every
task has this contract before work begins:

| Field | Required meaning |
| --- | --- |
| Task ID and outcome | One independently testable result |
| Exact files | Exclusive create/modify paths; no overlapping globs |
| Dependencies | `none` or named earlier task IDs |
| Owner | Implementer or reviewer role |
| Verification | Focused test/check and expected evidence |

An uncertain file set or dependency is serial by default. Implementers do not
commit or push. After a wave, the controller checks ownership, integrates the
changes, runs shared gates, and requests targeted review. Reviewers report
evidence-backed findings with a concrete failure scenario; the controller
deduplicates them and makes only justified corrections.

Do not parallelize edits to `App.jsx`, a shared service, rules/configuration,
or a single feature controller unless isolated worktrees and an explicit
integration plan make the boundary real.

## 5. Verification gates

Run the smallest focused check during iteration. For meaningful code changes,
run the standard project gate:

```bash
npm test
npm run test:e2e
npm run build
git diff --check
```

Tests and visual smoke use `demo-cleanflow` emulators, never production.
For visual, responsive, or multi-step changes, use the optional workflow in
[VISUAL_TESTING.md](VISUAL_TESTING.md) after deterministic checks. Capture
semantic snapshots and labeled screenshots only as local evidence.

There is intentionally no lint, formatter, or file-length gate today. Do not
install ESLint, Biome, or a fixed maximum-line rule merely to imitate another
toolkit. Propose one only after measuring a concrete maintenance failure,
choosing rules that fit this JavaScript/Vite codebase, and planning a baseline
plus gradual warning-to-error migration. Extract by domain ownership, never to
meet an arbitrary line count.

## 6. Context, memory, and external tools

- Project truth lives in the existing docs, tests, services, Git history, and
  issue checkpoints. Read the minimum relevant material; do not maintain a
  duplicate repository `MEMORY.md` that Codex does not automatically load.
- Record durable business or architecture changes in the appropriate existing
  source-of-truth document. Keep task-specific evidence in the issue/commit
  history or the ignored local reports area.
- The Codex runtime may provide its own managed memory. Treat it as assistance,
  not a replacement for checked-in decisions.
- Use `agent-browser` for optional emulator-only visual or dogfood work. Read
  its core instructions first, use accessibility snapshots and fresh refs,
  keep manager/public sessions separate, and never save production data or
  token-bearing links in the repository.
- Use current official documentation when a dependency API is uncertain. A
  Context7-style documentation lookup is optional, not a required project
  integration.

## 7. Completion and issue checkpoint

Before handing work to a human, report only verified facts:

1. files changed and behavior impact;
2. validation run and limitations;
3. data/security/privacy or compatibility risk;
4. manual check when it adds value;
5. recommended commit message.

After a human commits or deploys, promote only durable lessons to
`DECISIONS.md`, product/workflow docs, or these guidelines. Do not turn
temporary debugging output, speculative ideas, or personal operational data
into permanent project memory.

## 8. Deliberately not adopted

CleanFlow does not install Claude-specific plugins, Claude hooks, RTK token
proxies, Obsidian/MCP memory, Graphify, a hard file-size limit, or an agent
framework from this playbook. Revisit each only when a measurable CleanFlow
need justifies its operational and maintenance cost.
