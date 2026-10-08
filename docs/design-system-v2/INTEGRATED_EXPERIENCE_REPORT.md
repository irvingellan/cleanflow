# CleanFlow V2 integrated experience

Status: READY FOR INTEGRATED CLEANFLOW V2 OPERATOR PILOT, not human acceptance.
Branch: `feature/design-system-v2-integrated-experience`.
Base: `e4a3cfc9862e75b8680c237804fe703a3e45fd6b` (verified Phase B).
Exact final implementation SHA is in the generated review ZIP MANIFEST.md.

## Architecture and provenance

One local entry, `e2e/integrated-v2/index.html`, renders the approved V2 Shell,
Dashboard, Services and complete F1/F2/F3/F4 Job Detail. It is not a new route in
the authenticated application. `src/App.jsx` is byte-identical to Phase B.
V2 wrappers use existing components, callbacks, rules and opt-in presentation
hooks; shared primitives reconcile Shell icons, Services refs and lifecycle
markers without replacing their original APIs.

The machine-readable INTEGRATED_SOURCE_PROVENANCE.json records source roots,
branches, exact commits, selected file hashes and committed versus WIP status.
Dashboard icon/accent changes came from approved **uncommitted** source WIP.
Original worktrees and unrelated Intake/Telemetry/Safari/Issue #42 WIP were not
modified or merged. No entire feature branch was merged.

`fixtures.js` owns one context: 41 synthetic Jobs, 12 Properties, 3 Clients and
2 Cleaners. Dashboard aggregates/rows derive from the same Job objects as
Services and detail. Pagination 12 → 24 → 36, search, filters, archived visibility,
directory histories, back anchors, focus and language/theme work in one app.
CURRENT Properties/Clients/Cleaners and their details remain navigable; Payouts,
Weekly Close, Checklist Run and internal diagnostic destinations are reachable.
Offers and New service open existing CURRENT controls, not placeholder screens.

## No-backend boundary

The entry bootstraps only in development on localhost/127.0.0.1. Its Vite config
does not load local env files or public workers. Firebase imports resolve to a
memory-only provider-shaped adapter and an empty client stub: no SDK initializes.
Read views consume synthetic data only; writes, transactions, Auth, Messaging,
Functions and Storage reject. Final mutation callbacks reject explicitly and
never display a saved-success fiction. Confirmation cancellation does not call
them. The adapter's synthetic snapshot `fromCache:false` is **not** server or
financial evidence. Empty diagnostic/payout views are intentional, not live reads.

App, job/assignment/schedule/dashboard services, compatibility rules, Firebase
config and Rules remain byte-identical to Phase B. No backend or business-rule
change. UNKNOWN service recommendation previously fell through to completion;
the reproduced presentation defect now recommends View saved service when the
existing completion guard is false. The guard itself is unchanged.

## Final validation

| Evidence | Result |
|---|---:|
| Full unit | 125 files / 1,395 tests passed |
| Focused modules/tokens/primitives/lifecycle | 37 files / 528 tests passed |
| Integrated navigation and 30 responsive combinations | 43 Playwright passed |
| Complete Job Detail F1–F4 | 175 Playwright passed |
| Shell | 19 Playwright passed |
| Services | 11 Playwright passed |
| Dashboard latest icons/accent | 30 Playwright passed |
| Phase B catalog | 31 Playwright passed |
| CURRENT CSS visual equivalence | 30 Playwright / 30 equal PNG pairs |
| CURRENT lifecycle/Jobs/Detail | 25 Playwright passed |
| Integrated WebKit navigation/confirmation smoke | 6 Playwright passed |
| Hosting/environment guards | 24 Node tests passed |
| Production and Sandbox builds | passed with synthetic build-only config |
| Production exclusion / original-source preservation / diff check | passed |

Browser total: 370 passing tests across the configurations above.
Matrix: 360/390/768/1280/1440 × EN/PT/ES × light/dark; Dashboard, Services and
Detail captured in each combination (90 PNGs). Tests assert no horizontal
overflow or external request/runtime exception, keyboard/More focus behavior,
reduced motion, confirmation/cancel, stale Job confirmation protection, real
handlers, pagination and scroll anchor restoration. Main agent inspected desktop
light and mobile dark screenshots; independent UX review also inspected rendered
screens. CURRENT PNG equality uses the existing baseline CSS comparison harness;
it is not a claim of full historical production screenshot parity.

Production build scanned for integrated fixture IDs, entry path, local banner,
V2 Shell/Dashboard/Services/Detail markers: absent. Synthetic build config is
used for compile validation only, not authenticated access. Both builds retain
the pre-existing large-chunk warning; no unrelated code splitting was introduced.

## Independent review disposition

See INTEGRATED_UX_REVIEW.md and INTEGRATED_SECURITY_REVIEW.md. Verified findings
were harness-level navigation/context/preferences/focus and fixture defects;
all were corrected and regression-tested. No unresolved verified blocker for
this local pilot. 55 App bindings are structurally inventoried, not 64
individually behavior-tested: see INTEGRATED_ACTION_TRACEABILITY.md.

## One local preview and operator acceptance

Open http://127.0.0.1:4210/e2e/integrated-v2/index.html?lang=pt&theme=light
No login, credentials, real feed or setup command required. The detached Vite
process is loopback-only and reuses an equivalent existing server. It survives
ordinary terminal/conversation closure while macOS stays running; not sleep,
reboot, logout or a LaunchAgent guarantee. `scripts/startIntegratedV2Preview.mjs`
is the reproducible starter, not a deployment command.

Operator checklist:
1. Dashboard attention → Detail → Back; compare CURRENT/V2 values.
2. Services Load more → search/filter → Detail/checklist → Back; confirm anchor.
3. Upcoming → Detail; inspect lifecycle, assignment and next step.
4. At mobile width, navigate Services/Properties/More; open disclosures and Back.
5. Open a completion/archive confirmation and Cancel; confirm no saved change.
6. Change EN/PT/ES and light/dark; inspect readability, icons/accent, focus and
   sticky actions. Report confusing intent or blocker rather than trying real data.

## Remaining limits

This is a synthetic presentation/navigation pilot, not operational persistence
or authorization proof. Final Save/Assign/Complete/link issuance is unavailable;
directory create/edit actions not in the primary workflows show an explicit
disabled-persistence notice. No public cleaner/report transport, notifications,
real photos, authenticated parity, account attribution or live financial proof.
Chromium covers the full matrix; installed Playwright WebKit also passes six
integrated navigation/confirmation flows. Neither is physical iPhone/Safari
proof. Human integrated acceptance remains required.
No release readiness or automatic human approval is inferred.

NO MERGE · NO PUSH · NO DEPLOY · NO PRODUCTION DATA · NO BACKEND/BUSINESS-RULE CHANGES.
