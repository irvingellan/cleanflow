# Phase C1 — Sandbox Shell Operator Pilot

## Status and isolation

DESIGNED: approved canonical shell direction.
IMPLEMENTED IN SANDBOX PILOT: branch-only code and local synthetic proof.
OPERATOR ACCEPTED: **pending**. PRODUCTION RELEASED: **no**.

Branch: `feature/design-system-v2-shell-pilot`.
Worktree: `/Users/irvingellan/.codex/worktrees/design-system-v2-shell-pilot`.
Exact Phase B baseline: `e4a3cfc9862e75b8680c237804fe703a3e45fd6b`.
The foundation and original Intake/Telemetry/Safari worktrees were not edited.
No deployment, Firebase initialization in the harness, or real-data access.

## Architecture and preserved behavior

App passes existing navigation callbacks, utility elements and page children to
an environment-gated shell adapter. Only the Sandbox build imports the V2 module.
Only the existing developer UI permission enables the pilot. This permission is
presentation-only: ManagerAccess and server Dev Center authorization are unchanged.
Sandbox non-developers and all other build modes retain CURRENT. Explicit
`?shell=v2` and `?shell=current` compare on the same origin/path; a session-only
preference survives refresh. No provider hot-swap or new routing semantics.

Desktop (>=1100px): 232px grouped sidebar, optional persisted 64px collapse.
Medium (720–1099px): 64px icon rail with labels/tooltips and current-page semantics.
Compact (<=719px): Dashboard / Services / Properties / More; 44px targets and
safe-area clearance. Detail screens keep their existing Back/actions; tabs hide
and a compact More trigger preserves destination access. No page contents migrated.

Destinations preserved: Dashboard, Services, Properties, Cleaners, Clients,
Payouts; existing authorized Central Dev, load-time diagnostics and lifecycle
preview. Existing Weekly Close remains reachable through Payouts. No speculative
Intake destination: that gated WIP is not in this baseline and was not copied.

Utilities passed unchanged: identity, language, theme, notification/current-device
controls, feedback, What's New, environment navigation/build information and sign
out. The utility subtree stays mounted while its surface is closed, preserving
existing effects and pending input. Sandbox Functions remain billing-gated;
the shell does not make unavailable Dev Center authorization succeed.

## Accessibility and artboard interpretation

Phase A semantic tokens and Phase B Button/Icon/EnvironmentIndicator reused.
3px focus, semantic nav, aria-current, rail accessible names, trapped overlay focus,
Escape/return-focus, background inert/scroll lock, reduced motion and safe areas.
Existing nested Feedback/What's New dialogs retain their own focus/Escape handling.
Shell copy EN/PT/ES; existing language/theme providers unchanged, no universal default.

References: 06_desktop_shell_light.png, 26_desktop_shell_dark.png,
07_mobile_shell_light.png, 27_mobile_shell_dark.png, with 05 exploration as context.
Intentional deviations: current destination inventory rather than speculative
artboard modules; existing screen widths/content rather than mockup redesign;
Account opens preserved utilities rather than inventing a profile flow; detail
screens retain existing Back and actions; no fabricated metrics/avatar/account.

## Validation evidence

- Focused shell/token/primitives/preservation: 62 tests.
- Full unit: 117 files / 1,299 tests.
- Shell responsive/accessibility Playwright: 19.
- Existing lifecycle Playwright: 25.
- Phase B catalog: 31; Phase A unchanged-content visual pairs: 30.
- Build/exclusion/Hosting preparation guards: 25.
- Production and Sandbox builds; Production excludes V2 shell and catalog.
- Equal-ID/config Production CSS, workers and static files match Phase B exactly.
  App adapter changes JS asset hashes, not the legacy shell or data behavior.
- Controllers/handlers, page children/bindings and utility JSX compared byte-for-byte
  against Phase B; no query/backend/auth/notification behavior change.

These are synthetic Chromium/browser proofs, not iPhone, deployed Sandbox or
operator acceptance. Main app authenticated server behavior was not exercised.

## Screenshots

Ignored local evidence: `artifacts/visual-smoke/shell/` in this worktree.
Desktop light EN: dashboard/jobs/properties-1440-light-en.png.
Desktop dark PT: dashboard/jobs-1440-dark-pt.png.
Medium: dashboard-768-light-en.png and dashboard-768-dark-pt.png.
Mobile: dashboard/jobs-390-light-en.png; dashboard-390-dark-pt.png.
More/account: utilities-1440-light-en.png, utilities-1440-dark-pt.png,
utilities-390-light-en.png and utilities-390-dark-pt.png.
Additional containment: properties-360-light-pt.png, dashboard-1280-dark-en.png,
dashboard-1920-light-es.png. No screenshots contain real customer data.

## Exact local operator review

Start (only if port 4193 is not already owned by this harness):
`npx vite --config e2e/shell/vite.config.js --host 127.0.0.1 --port 4193 --strictPort --mode e2e`
Open `http://127.0.0.1:4193/e2e/shell/index.html?lang=en&theme=light`.
For PT/dark use `?lang=pt&theme=dark`. This is credential-free synthetic local
preview, not the live Sandbox. Secondary screen placeholders demonstrate nav
callbacks only; Dashboard/Services/Properties/Job Detail use existing components.

1. Find Dashboard, Services and Properties without explanation.
2. Find Cleaners, Clients and Payouts; check internal tools stay subordinate.
3. Open Account (desktop) or More (mobile); find all utilities, change theme/language.
4. Confirm Sandbox is immediately obvious; do not follow external environment links.
5. At 768px verify rail names/focus; at 390px inspect all four tabs and scroll More.
6. Open a synthetic Property/detail, use existing Back; confirm nothing disappeared.
7. Keyboard: Tab, open More, Escape; focus returns and background cannot be reached.
8. Report any missing control, cramped label or confusing navigation.
9. Decide acceptance explicitly; synthetic tests do not substitute for this decision.

In a future separately authorized Sandbox build, the actual manager comparison is
`/?shell=v2` versus `/?shell=current` after existing authentication/developer gating.
No live Sandbox publication is authorized here. After human acceptance, request a
separate Sandbox release review; do not merge or migrate screen internals implicitly.
