# Cleaner Checklist Completion UX — integration candidate

Prepared 2026-10-12; local-only, not merged, pushed or deployed.
Base main/origin: `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526`.
Verified public Production build marker: `5c2e52492331577a7cbdc4aa41a8f1a6b9771b45`;
main differs from that source only in CURRENT_STATE documentation.
Approved operator checkpoint: `897b423b6a95d33c90166540fb90a3450f7f9daa`.
Only PublicChecklistPage, its regressions, localized copy and scoped public-page
CSS are ported into the application. Comparison fixtures stay in e2e only.
No V2 RC, Intake/Telemetry WIP or whole-branch merge was imported.

## Preserved contract

- `/checklist?t=...` and `/api/public-checklist` are unchanged. Public capabilities,
  anonymous browser access, credentials omitted on public HTTP calls and manager
  authorization are unchanged; the preview does not mint or use real capabilities.
- The same missingItems calculation reveals pending fields before confirmation.
  Confirmation remains explicit for a ready, saved draft. Server requirements,
  revision/idempotency and status checks remain final authority.
- Saved draft is not submitted; sending is not success. A receipt requires loaded
  or acknowledged READY_FOR_REVIEW and controls become read-only. Manager approval
  and Job completion remain separate, unchanged server actions.
- Autosave/recovery, one frozen photo slot, 5 MiB JPEG/PNG/WebP rules and bounded
  Safari File→ArrayBuffer→Blob transport remain unchanged. No reminders added.

## Independent review and narrow integration deltas

Read-only reviewer found a P2: the old pending summary could say “Send again” after
success. A failing sequence test reproduced it; !isReadOnly now hides only that
summary after acknowledgment. Receipt fixtures preserve actual saved answers.
Reviewer rechecked the fix and found no P0/P1/source blocker for authenticated
validation. This is not deploy approval or independent execution of test suites.
External HTTP interception now covers every comparison flow.

Validation: 8 focused files / 190 tests; 113 files / 1,245 units; 78 isolated
Firestore/Storage emulator security tests; 16 Chromium/WebKit comparison flows
at 1440px and 390x844, EN/PT; Production build and whitespace checks.
Native photo regressions prove exact 2 MiB camera/library bytes, MIME and content
length at the localhost receiver in Chromium and WebKit. WebKit does not expose
postDataBuffer for that Blob; optional browser instrumentation is never fabricated.
Chromium worker update/navigation/5 MiB PUT passes. The extra WebKit worker update
test times out with old build even at 15 seconds; its subsequent PUT is untested.
Worker/application code is byte-identical to baseline and the fixture has no
checklist page code, so this is an unresolved browser/harness evidence gap, not
proof of a new candidate defect. It remains a pre-release validation gate.
Known punycode/large-chunk warnings are inherited; no dependency updates performed.

## Operator comparison

Open `http://127.0.0.1:4195/e2e/checklist-completion/index.html?variant=improved&scenario=incomplete&lang=pt`.
No login. CURRENT/IMPROVED switch only a local presentation snapshot vs the real
candidate component, both using the real hook and synthetic local adapter.
Try incomplete submit, required photo, ready confirmation, sending, error/retry,
uncertain-response retry and reload. Never use real names, photos or tokens.

## Exact next gates — no release action is authorized

1. Authorize an isolated authenticated validation environment and synthetic records.
   Confirm Functions/Storage availability first: baseline Sandbox docs mark them
   billing-gated. No billing activation or backend publication is authorized here.
2. Exercise the public link with actual isolated capability/evidence backend:
   missing requirements stay DRAFT, confirmed evidence enables readiness, send
   commits READY_FOR_REVIEW once, receipt/reload/retry agree with persisted state.
   Manager review remains available; this slice must not automatically complete Job.
3. Validate the exact candidate on physical iPhone Safari/installed PWA, camera
   and library, reload/resume and worker absorption. Resolve/document the WebKit
   worker-update evidence gap. Synthetic tests are not real iPhone reliability proof.
4. Explicit human release decision and separate authorization for push/PR/merge
   and quiet-window Hosting-only deployment; reverify main/live/config/manifests.
   No Functions, Rules, Storage, indexes or billing change is needed for this UX.
5. Reconfirm rollback version before any future deployment. Baseline documented
   CURRENT Hosting version is `6130ee0f019cbff4`; version retention was not queried
   in this task. No rollback/deployment command was executed.

Zero customer-data reads/writes. Production requests were public static metadata
only. Emulator writes are exclusively disposable fixtures; push transport is mocked.
Authenticated Firebase workflow, physical-device and cleaner adoption proof remain
unclaimed. V2 RC remains at `7f941b7` with clean tracked source.
