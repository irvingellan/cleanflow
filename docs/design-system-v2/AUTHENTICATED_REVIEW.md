# V2 authenticated Sandbox review

Historical acceptance record for the isolated Sandbox implementation below.
The RC adds an explicit future build-only Production gate; consult PRODUCTION_RC.md
for the current inactive release contract. This record does not authorize release.

Integration baseline: `668732955140c5450205ce2cd38aaf759160abf8`.
Branch: `feature/design-system-v2-authenticated-review`.
Deployed implementation: `1aa7587f493b809ab6c091a09e1495339809e43f`.
Preview: https://clean-flow-sandbox-irving--cleanflow-v2-integrated-rev-59duqcga.web.app/?experience=v2
Channel: `cleanflow-v2-integrated-review`, expires 2026-10-15 21:11:01 UTC.
Released 2026-10-08 21:11:04 UTC; version `613a02f53d1f71de`.
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
- SANDBOX RELEASED / AUTHENTICATED READ-ONLY QA: human sign-in confirmed;
  actual Firebase-backed navigation and CURRENT/V2 parity observed below.
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

## Current verification

533 focused tests (38 files); 1,404 full unit tests (127 files); 43 integrated
Chromium + 6 integrated WebKit checks; 26 real-App synthetic Chromium/WebKit
checks; 25 environment/Hosting guards. Production and Sandbox builds pass.
150 synthetic screenshots cover 360/390/768/1280/1440, themes and EN/PT; the
baseline integrated suite also covers ES. Real-App tests preserve origin-aware
Back, secondary navigation and account utilities. The 55 binding inventory is
structural/behavior-family evidence, not 55 real mutation executions.

All 30 deployed files match the prepared SHA-256 manifest. Sandbox live/Shell,
Services preview, Dashboard preview and Production retain their exact prior
release/version IDs. The operator authenticated independently in the new origin.
Authenticated browser QA confirms CURRENT/V2 KPI parity (0/3/3/0/1), Dashboard
attention row → real Job Detail → Back, Services (10 synthetic records), name
search → assigned Job Detail → Back with search retained, Properties directory,
mobile More → Clients, Property Detail → existing Job → contextual Back,
account controls and the correct Back to Production link.
The existing save/assignment/payment/notification controls were not executed.
Mobile viewport override has 375px actual content width and equal scroll width;
exact 390/360px coverage belongs to the synthetic Playwright evidence.
Next 48 hours is empty in the current baseline, so its populated authenticated
state is not claimed. Functions/Storage-dependent checklist status is explicitly
unavailable, not inferred from synthetic record titles. No physical iPhone or
Gabi acceptance is inferred from this Chrome authenticated session.
Independent engineering and UX reviews give GO for this isolated preview after
the narrow integration fixes. Physical-device/Gabi acceptance remains pending.

Rollback (only this preview):
`firebase hosting:channel:delete cleanflow-v2-integrated-review --project clean-flow-sandbox-irving`
