# MISSION FOR CODEX — integrate and publish the Definitive UI V1 (frontend only)

Owner decision (2026-11-04): Claude chose and implemented the visual design. Your job
is integration, verification and a guarded Hosting release. **Do not redesign,
"improve", restyle or re-order these screens, and do not reintroduce the legacy
header/shell.** If something cannot be integrated as built, stop and return the
divergence to Claude with screenshots; do not invent a visual fix.

## Inputs

- Visual source: branch `feature/definitive-ui-v1` (local worktree
  `.codex/worktrees/definitive-ui-v1`; HEAD SHA in the handoff `BUILD_INFO.md`).
- Base it was built on: `codex/release-a-claude-ux-85` @ `12f432dd46a6c93e45bfb78ac1993568143c3840`
  (Hosting `2aa48a01a2244d34`).
- Contracts: `DESIGN.md`, `docs/definitive-ui/INTEGRATION_CONTRACT.md`,
  `docs/definitive-ui/DIFF_UI.md`, `docs/definitive-ui/QA_VISUAL.md`.

## Steps (stop at any STOP)

1. **Reconcile the base.** Verify the live Hosting release still serves the
   `12f432d` build (version.json / build id). If Production moved, rebase or
   cherry-pick the Definitive UI commits onto the exact current Production SHA in a
   new branch `codex/definitive-ui-release`. Resolve conflicts by keeping Production's
   logic and Claude's markup/CSS. STOP if a conflict needs a visual decision.
2. **Scope check.** `git diff <production-sha>..HEAD --stat` must touch only
   `src/**` UI files, `src/styles/**`, `src/i18n/translations.js`,
   `src/features/notifications/notificationInboxMessages.js`, `DESIGN.md`, `docs/**`,
   `e2e/definitive-ui/**`, `package.json` / `package-lock.json` (only
   `@fontsource-variable/inter`). STOP if `functions/**`, `firestore.rules`,
   `storage.rules`, `firestore.indexes.json`, `firebase*.json`, `public/sw.js`,
   `public/*messaging*`, manifests or env files differ.
3. **Functional wiring audit (no visual edits).** Confirm every handler used by
   `AppShell`, `Dashboard` (`notices`, `onOpenNotice`, `onShowInbox`), the Services pane
   in `App.jsx` and `NotificationInbox` is an existing Production handler, and that no
   new Firebase read/write exists (`git diff` for `firebase/`, `httpsCallable`,
   `collection(`, `doc(`).
4. **Gates.**
   - `npm ci && npm test` (expect ≥1,604 passing).
   - `node e2e/definitive-ui/run.mjs --project=chromium` with
     `DEFINITIVE_UI_SPECS=flows.spec.js`, and the same with `DEFINITIVE_UI_DEVICE=iphone
     --project=webkit` (isolated emulator ports from `firebase.cleaner-hub-e2e.json`).
   - Existing suites you own: `npm run test:e2e`, `npm run test:cleaner-hub:e2e`,
     `npm run test:security`, `npm run test:cleaner-hub:security`.
   - Production build with the real environment (`npm run build`) and
     `npm run hosting:prepare`; record the build id and bundle hash.
   - Release seal / drift checks from Release A (`npm run release:notifications`
     preflight in Hosting-only mode, if applicable). STOP on any drift that is not
     the frontend bundle.
5. **Visual parity check (compare, do not change).** Capture
   `DEFINITIVE_UI_SPECS=capture.spec.js` on your branch and compare with
   the handoff `screenshots/after/` at 375/390/768/980/1280/1440,
   light and dark. Any difference that is not data (names, times) is a divergence →
   return to Claude.
6. **Authenticated validation.** In Sandbox (or a Hosting preview channel on
   Production with no data writes), sign in as a test manager and walk the five
   scenarios in `QA_VISUAL.md` §3. Never use the operations manager's real account
   for tests; never paste access codes into chat, logs or screenshots.
7. **Rollback ready.** Record the current Production Hosting release id
   (`2aa48a01a2244d34` or newer) as the rollback target; prepare
   `firebase hosting:clone` / `hosting:rollback` command for it.
8. **Ask the owner for the final go.** Present: SHA, gate results, parity result,
   rollback id, and the one command below. Publish only after the owner's explicit yes.
9. **Publish Hosting only** (after the yes):
   `firebase deploy --only hosting --project <production-project>` from the reviewed
   build. No Functions, Rules, indexes, IAM or messaging deploy in this mission.
10. **After publish.** Verify `/`, `/agenda`, `/checklist?t=…` (test token) load the
    new build; hard-reload once on iPhone Safari (PWA cache); confirm Release B push
    and #86 stay OFF. Report back.

## Out of scope (separate tracks)

Release B cleaner push, #86 first-accept-wins activation, `cleanerAgenda.checklist`,
`getMyJobAccess`, `photoRequirements`, FB05 16-photo investigation, any Firestore
data change.

## Impeccable (optional, if available in Codex)

You may run `impeccable detect` and `impeccable critique` **as read-only reports** on
the integrated branch. Findings go back to Claude; do not apply design fixes yourself.
