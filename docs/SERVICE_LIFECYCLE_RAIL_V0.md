# Service Lifecycle Rail V0 — Issue #71

Presentation only, on the real Job Detail: operational stage, separate saved
checklist progress, existing suggested next action, then financial snapshots.
No state machine, mutation, authorization or backend contract is introduced.

- Rail: `UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED`. The current
  stage comes from `Job.operationalStatus`, but position alone does not prove
  past stages happened. Past OFFERED needs a valid `offeredAt` or successfully
  loaded Offers; loaded-empty Offers means skipped, unavailable evidence means
  unknown-past. ASSIGNED uses current/later Job status or the existing assignment
  relationship. Past IN_PROGRESS needs `startedAt`; completion without it shows
  skipped. Unknown Job status does not mark any stage completed. The compact
  segments distinguish completion/current/future/skipped/unknown-past by shape,
  weight and accessible text, not color alone.
- Checklist: only the manager Run projection's saved checklist counts are used;
  the bar measures checklist items, not photos, labor duration or complete
  submission requirements. READY_FOR_REVIEW never fabricates progress.
  A COMPLETED Job with a READY_FOR_REVIEW Run displays **Saved checklist**.
  The current approval path preserves READY_FOR_REVIEW, but no explicit approval
  receipt is persisted for historical proof, so the composed copy stays neutral.
  The saved Run status remains READY_FOR_REVIEW; DRAFT abandonment remains ABANDONED.
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
allowlist. It renders the same Job Detail with fifteen explicitly labelled
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

The original nine scenarios: unassigned, offered, assigned, assigned with partial draft,
in-progress with partial draft, review-ready, completed, stale link and parallel
open Issue. Six added memory-only cases prove direct assignment/in-progress
without Offers, completion with/without start evidence, completed saved Run
copy and unavailable Offer evidence. These additions are excluded from the
create-only seed: the existing 30 Sandbox DEMO records are unchanged.
Local Playwright harness/provider stubs remain outside the deployable
file manifest. Production builds exclude the synthetic preview implementation.
No Production publication, Functions/Rules/Storage/index deployment or billing
change belongs to this slice. Real-device/authenticated verification evidence is
recorded separately in the Draft PR; synthetic visual proof is not backend proof.
