# V2 authenticated Sandbox review

Integration baseline: `668732955140c5450205ce2cd38aaf759160abf8`.
Branch: `feature/design-system-v2-authenticated-review`.
This is a new isolated worktree; original Intake/Telemetry WIP and all V2 source
worktrees remain untouched. The historical provenance manifest is retained.

## Integration

Sandbox-only lazy presentations wrap the real ManagerApplication. The existing
ManagerAccessBoundary, controllers, reads and action callbacks remain sovereign.
One developer CURRENT/V2 comparison controls Shell, Dashboard, Services and
complete Job Detail F1–F4. It requires existing manager access and an explicitly
allowlisted Sandbox presentation account; that UI permission grants no backend
rights. Existing account utilities and secondary navigation are reused.
The URL opt-in is `?experience=v2`. Production cannot select/import these modules.

Bounded integration fixes: avoid a Retry without a current worklist callback;
restore the accepted wide Job Detail inside the real shell; allow only five
verified Sandbox CSS chunk families in the existing Hosting preparation gate.
The dark test setup now asserts the actual ThemeProvider key/state.

## Evidence classification

- DESIGNED / IMPLEMENTED: four approved modules, presentational integration.
- LOCALLY ACCEPTED: operator's explicit acceptance of the baseline, not invented.
- STRUCTURALLY VERIFIED: all 55 Job Detail props, controller logic and existing
  screen callback bindings retained, covered by preservation tests. The older
  inventory saying App is byte-identical describes the synthetic baseline only;
  this integration changes App presentation composition, not business bindings.
- TESTED SYNTHETICALLY: real App local adapter + integrated scenario harness;
  adapters deny writes and abort external requests. These are not Firebase proof.
- SANDBOX RELEASED / AUTHENTICATED QA: record exact release and actual results
  in the generated handoff. An origin-scoped login may require one human smoke.
- GABI ACCEPTED / PRODUCTION RELEASED: NOT CLAIMED.
- NOT OPERATIONALLY VERIFIED: no mutation or execution of 55 real actions.

## Release boundary

Only a fresh Sandbox preview channel is authorized. Use existing hosting:prepare
with the committed SHA and `sandbox`, then hosting:channel:deploy with explicit
Sandbox project, seven-day expiry and `--no-authorized-domains`. No automatic Auth
domain synchronization; no Functions/Rules/Storage/index/billing changes. Existing
live and preview versions are compared before/after. Hash every published file.

Rollback means delete/expire only the newly created preview channel; never clone
it to live or modify the preserved channels. Any authenticated QA not observed
is pending, not passed. Browser automation is not physical iPhone proof.

## Known limits

Sandbox Functions/Storage remain billing-gated; dependent existing UI may report
unavailable. No production fallback is introduced. Existing read-only telemetry
may record ordinary navigation under the existing mechanism; no new telemetry
system or operational data mutation is added. npm audit reports vulnerabilities
in the unchanged lockfile; dependency remediation is outside this presentation
release and is not silently undertaken.
