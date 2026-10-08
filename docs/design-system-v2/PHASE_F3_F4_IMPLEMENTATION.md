# Job Detail V2 complete — execution record

Baseline: operator-accepted F2 `9b6ec19a5bb3b73e1ce2bac04a7caa363ed3739f`.
Branch-only/local, no merge, push, deploy, cloud access or business-rule change.

## Plan and decisions

1. F3: opt-in V2 on all widths, retain F1 desktop and F2 summaries; one shared
   Intent Layer, mobile safe-area/keyboard-aware primary and readable groups.
2. F4: presentation adapters for existing completion/archive/reminder replacement
   confirmations; keep CURRENT untouched and existing final forms/guards intact.
3. State/locale/theme/browser regression, independent UX + engineering reviews,
   synthetic builds/exclusion, local operator preview and complete ZIP.

Pre-flight: F3/F4 share the optional JobDetail presentation boundary; no controller,
service or domain changes are needed. F2 clean, baseline full suite 118/1312.

Ruling: existing assignment, schedule and Offer submit forms keep their final
controls. Add explanatory presentation, not another confirmation requirement.
Checklist Run approval/report controls are on a different screen and stay intact.
Link controls without a current confirmation do not gain an invented gate.
Cost if wrong: an operator may prefer a separately scoped confirmation later;
existing safety contracts remain unchanged.

## Integrated presentation

- Desktop ≥1100px retains F1's 360px decision rail and original summary order.
- Tablet 768px stacks the same elements. Mobile 360/390px uses identity/date,
  responsibility, compact existing lifecycle, saved checklist, attention,
  suggested action and the seven disclosure groups.
- The original Intent Layer computes the only next action. No duplicate engine,
  query, role check, lifecycle inference or operational mutation is introduced.
- The Phase B sticky action uses safe-area padding. Editable focus conservatively
  hides it; an open operation also hides it after blur so its actual final button
  does not compete with a fixed reminder/action. Cancel/Save restores the next
  action. Keyboard detection is presentation, not device identification.
- Existing native disclosures retain mounted bodies and pending values. F2
  summaries stay based on the same loaded evidence, including missing/error states.
- CURRENT remains the default and selectable on every width. App still imports
  the V2 wrapper only in Sandbox mode behind its existing developer gate.

## Confirmation inventory and contract preservation

| Existing contract | V2 presentation | Mutation authority |
| --- | --- | --- |
| No-checklist completion confirmation | Phase B sheet; Job/date/time, consequence, existing error, Cancel/final action | Original `completeCleaning`, current guards and server |
| Archive/Delete confirmation | Same sheet through optional archive renderer; original saving/error state | Original archive handler and confirmation owner |
| Active reminder checklist link replacement (`window.confirm`) | Awaited in-app sheet; explicitly invalidates old link, does not send | Original reminder preparation handler; current eligibility rechecked after await |
| Assignment, schedule, roster replacement, Offer amount/link forms | Existing final submit controls plus truthful consequence text | Original forms and handlers; no added confirmation requirement |
| Checklist capability controls without an existing confirm gate | Unchanged | Original controls |
| Manager Run approval/report actions on another screen | Unchanged; existing navigation | Original Run screen |

Confirmation dialogs are portaled to `document.body`, avoiding closed-disclosure
hidden ancestry. They show the existing Property name and formatted service date/
time, not IDs or private metadata. Cancel is initially focused; Tab is contained,
Escape cancels when not busy, focus returns to the initiating action. Existing
busy state prevents duplicate final submits/cancellation; failures remain visible
and retryable. An unmounted or superseded reminder confirmation resolves false.

The async replacement adapter adds only presentation-race protection: it checks
the latest existing reminder eligibility, same Job and same preview before calling
the same handler. It does not redefine eligibility or change backend rules.

## Seven sections and binding inventory

Service details; Cleaner & assignment; Checklist; Offers; Issues; Financial;
History & administration. All bodies remain the original `JobDetail` elements.
The existing 64 bindings catalogued in `JOB_DETAIL_V1.md` remain, including
assignment vs interest, schedule protection, sensitive-reminder opt-in, provenance,
price snapshots, archive/restore, and review/report navigation. Rendering, opening
a disclosure and choosing a navigation intent are not new mutations. Existing
explicit final controls remain the mutation surfaces.

Services/controllers, Functions, Rules, schema, routing/authorization and the
Phase A/B implementations are unchanged. Optional shared presentation hooks
compile with CURRENT but have no V2 caller in Production; V2 component/CSS and
synthetic harness are excluded by the existing build boundary.

## Proven findings resolved during independent review

1. Native dialog inside a closed disclosure could not focus Cancel. Reproduced
   by mobile Playwright; fixed through a presentation-only portal. Focus trap,
   Escape and return focus are covered at 360/390/768/1280/1440.
2. An awaited replacement could retain eligibility captured before the same Job
   became IN_PROGRESS. Regression reproduced one call before correction, zero
   afterward. A latest-eligibility ref preserves the existing guard.
3. Mobile blur restored a competing fixed action while an unfinished form remained
   open. The sticky surface now suppresses itself for existing open operations;
   pending form values stay mounted and Cancel restores the action.
4. Confirmation needed date/time to distinguish recurring Jobs for one Property.
   Added existing formatted schedule; a deterministic EN/PT/ES regression caught
   and corrected the formatter argument order.

## Claude comparison and deliberate differences

Compared with canonical artboards 14–17, 24–25 and 30. F1 geometry/typography and
F2 described groups are retained. Mobile follows the explicit task order (Cleaner
before lifecycle), rather than moving attention ahead of every summary. Blockers
remain visible in document flow. Sticky overlays in a full-page screenshot are
viewport positioning, not evidence of a permanently hidden blocker.

No invented avatar, verified identity, acknowledgement, historical stage, saved
photo or step-count evidence was added to imitate an artboard. The compact rail
retains existing marks and accessible stage descriptions plus the actual current
label. Schedule/assignment/Offer forms retain their current confirmation contracts
instead of inventing additional business gates. The existing shell is preserved.

## Independent reviews

Engineering/security: independent read-only review found the async reminder race;
resolved and re-reviewed. No remaining concrete authorization/CURRENT blocker.
Product/UX: independent screenshot/source review found the competing sticky action
and insufficient recurring-service context; addressed as above. Review evidence
and final disposition are included in the local acceptance package.

## Validation and evidence

Final fresh results: **37 files / 530 focused tests; 119 files / 1,326 unit tests;
175 V2 Playwright; 25 existing lifecycle Playwright; 30 CURRENT visual equality;
20 Production/Sandbox build and environment guards; diff check PASS.**
Commands and raw bounded logs are included in the acceptance package.
Coverage includes F1/F2/F3/F4, Jobs/Assignments/Offers/Issues/
Checklist regressions, Phase A/B through the full suite, desktop/mobile keyboard,
CURRENT pixel equality, lifecycle regression, EN/PT/ES, both themes, synthetic
Production/Sandbox builds and environment guards. No cloud reads or deployment.

The build proof compiles disposable mirrors using only synthetic config, never
developer `.env` or Firebase initialization. Production lacks the V2 wrapper,
decision/mobile stylesheet, confirmation component and harness; Sandbox includes
the opt-in V2 surface. Shared optional presentation hooks are not a release.

## Local operator acceptance

Open:
`http://127.0.0.1:4203/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=assigned-draft&lang=en&theme=light`

This is a credential-free loopback harness with synthetic fixtures and stubbed
handlers. `Local synthetic scenario` is harness-only, not ordinary app chrome.

1. Compare CURRENT/V2, then inspect assigned, ready, issue, stale, completed,
   archived, unknown/loading/error scenarios in EN/PT/ES and both themes.
2. At 360/390, inspect responsibility, blockers, single fixed primary and readable
   seven summaries; open forms, blur/close/reopen, Cancel and confirm value retention.
3. At 768/1280/1440, inspect responsive composition and desktop decision rail.
4. Open completion/archive/reminder replacement confirmations. Verify affected
   Job/date/time, will/will-not, Cancel/Escape/focus and final-control-only stub calls.
5. Record human acceptance separately. Synthetic handlers do not validate actual
   cloud mutation, messaging, capability issuance, payment or physical-device use.

## Limits / deferred decisions

- No physical iPhone/Safari/PWA keyboard or safe-area acceptance is claimed.
- Unknown Job status retains F1's existing primary-intent fallback; V2 neither
  authorizes it nor changes its guard. A separately scoped engine correction may
  be appropriate; this task does not silently redefine the accepted Intent Layer.
- Separate Manager Run approval/client report confirmations are outside Job Detail.
- No authenticated Sandbox deploy, Production release, merge or push is authorized.
- Human operator acceptance remains the final gate; the ZIP is local review evidence.
