# Compact Lifecycle V0 (#76)

Presentation-only five-stage strip on Jobs cards and Dashboard Next 48 hours.
The existing `serviceLifecyclePresentation()` owns evidence mapping. Compact
rendering adds no effects, services, authorization, transitions or persistence.
Current stage has a solid marker and a localized label; proven past uses ✓,
future uses ·, skipped uses dashed – and unknown-past uses dotted ?. Each stage
has a localized accessible label/tooltip; cards reference the full description.

## Loaded evidence only

- Jobs uses its already-loaded Job fields, including assignment IDs and valid
  `offeredAt` / `startedAt` evidence. Offer history is not loaded: no empty-list
  substitution or inference that assignment proves an Offer.
- Dashboard reuses nonempty existing `offersByJob` entries where available.
  Those entries contain filtered interested Offers, not exhaustive history;
  empty/missing entries are therefore unknown, never proof of a skipped stage.
- No Job, Run, capability, Assignment or Offer per-card reads are added. Existing
  Dashboard and Jobs service/query code, ordering, filters, pagination, click
  handlers and scroll-restoration code remain unchanged.

Checklist progress remains available in Job Detail. List-level checklist summary
requires an efficient canonical read model and is not introduced in V0.

## Information hierarchy

Jobs retains date/time, Property, Client and Cleaner. The compact stage replaces
the duplicate status badge; provenance/archive remain compact secondary information.
Client price, cleaner payout and margin are omitted from list cards and remain
available in Job Detail Financial, with unchanged snapshot semantics.
Card touch targets and keyboard activation stay intact.
Dashboard attention remains urgent and unchanged, without extra strip/height;
recently completed retains its existing lightweight historical representation.
Only Next 48 hours receives the compact strip, replacing its status badge.

## Synthetic review / Sandbox only

The existing authenticated developer `Service lifecycle · Preview` screen in
Sandbox now has a screen selector for Job Detail, Dashboard and Jobs. Dashboard
and Jobs render 10 memory-only synthetic examples, including direct assignment,
proven Offer timestamp, unknown history, started and completed services. There
is no seeder or provider fallback; preview actions only show an inspection notice.
The preview implementation and fixtures are absent from Production builds.

Local Playwright renders the same Sandbox multi-service preview and real list
components at their existing 1440px/390x844 shells. Four full-page screenshots
are in ignored `artifacts/visual-smoke/compact-{dashboard,jobs}-{1440,390}.png`.
These are synthetic local captures, not evidence of authenticated live operation.

Validation: 127 focused, 113 files / 1,237 full unit tests, 25 Playwright (four new
multi-service scans plus 21 detail regressions), Production/Sandbox builds and
diff check. Playwright rejects external/API/Firebase requests, checks accessible
descriptions, keyboard card activation, touch targets and horizontal containment.
Existing Jobs tests retain filter/sort/scroll regressions; Dashboard tests retain
priority ordering. No production publication or data mutation is authorized.

Human review gate: can the manager identify unassigned, assigned and in-progress
services in three seconds, and does the strip help without adding clutter?
