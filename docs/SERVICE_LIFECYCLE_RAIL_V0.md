# Service Lifecycle Rail V0 — Issue #71

Presentation only, on the real Job Detail: operational stage, separate saved
checklist progress, existing suggested next action, then financial snapshots.
No state machine, mutation, authorization or backend contract is introduced.

- Rail: `UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED`, directly
  from `Job.operationalStatus`. Previous/current/future have text as well as
  visual markers. Unknown status does not mark any stage completed.
- Checklist: only the manager Run projection's saved checklist counts are used;
  the bar measures checklist items, not photos, labor duration or complete
  submission requirements. READY_FOR_REVIEW never fabricates progress.
- Link: the existing authoritative `capability.state` is displayed; no client
  revision comparison or alternative definition of stale is added.
- Attention: proven stale link, review-ready Run and loaded OPEN Issues, separate
  from the rail. Buttons navigate to the existing controls, never mutate.
- The existing Intent Layer and financial snapshot semantics remain unchanged.

## Sandbox validation

Sandbox Functions remain billing-gated. Direct browser reads of Checklist Runs
stay denied. Real Job Detail displays Unknown on failed Run/link reads; it does
not fall back to fixtures or reinterpret a failure as no Run.

A small **Service lifecycle · Synthetic preview** entry is available only in
the Sandbox build, inside the manager boundary, for the existing developer UI
allowlist. It renders the same Job Detail with nine explicitly labelled
memory-only projections. Its handlers cannot write. No capability/token,
evidence bytes or fake operational report is created. The preview is not a
replacement for authenticated Run/capability APIs.

Create-only, fictitious DEMO reference/Job/known-child fixtures are separately
seeded into the exact dedicated Sandbox. Missing project/Production/unknown
projects fail before authentication; existing edited records are never replaced.

```sh
node scripts/seedServiceLifecycleSandbox.mjs --project clean-flow-sandbox-irving
# Review the dry run before explicitly allowing synthetic Sandbox writes:
node scripts/seedServiceLifecycleSandbox.mjs --project clean-flow-sandbox-irving --apply
npx playwright test --config playwright.lifecycle.config.js
npm run hosting:prepare -- <checked-out-sha> sandbox
# Preparation never deploys; publication is an explicit separate action:
firebase deploy --only hosting --project clean-flow-sandbox-irving
```

Nine scenarios: unassigned, offered, assigned, assigned with partial draft,
in-progress with partial draft, review-ready, completed, stale link and parallel
open Issue. Local Playwright harness/provider stubs remain outside the deployable
file manifest. Production builds exclude the synthetic preview implementation.
No Production publication, Functions/Rules/Storage/index deployment or billing
change belongs to this slice. Real-device/authenticated verification evidence is
recorded separately in the Draft PR; synthetic visual proof is not backend proof.
