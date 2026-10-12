# Cleaner checklist completion UX — local acceptance checkpoint

Presentation-only improvement on Production-compatible main `8bc7016`.
The operator accepted pending-item navigation and incomplete validation. Final
acceptance remains pending for the corrected ordering: first submit click uses
the existing missingItems calculation; incomplete drafts reveal summary/markers
and focus the first pending target without confirmation or a submission call.
Complete drafts retain explicit confirmation and the unchanged server handoff.
Readiness is checked again at confirmation in case an answer was cleared.

Autosave/recovery, capabilities, server eligibility/idempotency and photo transport
are unchanged. No success precedes READY_FOR_REVIEW acknowledgment. The existing
single evidence slot remains unchanged; no reminders or manager controls are added.

Local preview: `http://127.0.0.1:4194/e2e/checklist-completion/index.html?variant=improved&scenario=incomplete&lang=pt`.
CURRENT is a baseline presentation snapshot; both variants use the real hook with
an isolated synthetic adapter, never Production APIs. Run with the dedicated
`e2e/checklist-completion/vite.config.js`; no login required.

Validation: 72 focused; 113 files / 1,244 unit tests; 16 Chromium/WebKit tests in
EN/PT at 1440px and 390x844; Production build and diff check. Known inherited
punycode/chunk-size warnings remain. No physical-device/live cleaner proof claimed.
No backend/schema/Rules/Functions changes, merge, push or deployment.
V2 Production RC remains at `7f941b7` with clean tracked source.
