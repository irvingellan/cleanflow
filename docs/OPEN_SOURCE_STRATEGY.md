# CleanFlow — Open Source Strategy

CleanFlow remains an independently maintained product. Open source is evaluated
as a source of narrow, verified ideas and utilities, not as a product fork.
The detailed research evidence lives in
`agent-reports/OPEN_SOURCE_INTELLIGENCE_REPORT.md`.

## Adoption gate

For each candidate, choose one outcome:

- **Build** — CleanFlow-specific operational semantics, privacy boundaries, and
  workflows stay in this codebase.
- **Borrow** — use a small, maintained, permissively licensed utility when it
  removes commodity work without owning product behavior.
- **Port** — adapt one isolated pattern only after recording source, revision,
  license, and tests; retain required attribution.
- **Integrate** — place a commodity provider behind a service boundary with
  explicit data, failure, and replacement behavior.
- **Defer** — leave unvalidated, costly, unclear-license, or poor-fit work out.

## Non-negotiables

- Never copy code with unclear provenance or incompatible/copyleft licensing.
- Do not weaken cleaner privacy, authorization, auditability, or legacy
  compatibility to match an external design.
- Add a dependency only when its maintenance/security cost is justified by a
  concrete validated need.
- Record material choices in `DECISIONS.md` and cover adopted behavior with
  focused tests.

This strategy complements, rather than replaces, the product and domain sources
of truth in `PRODUCT.md`, `DATA_MODEL.md`, `WORKFLOWS.md`, and `DECISIONS.md`.
