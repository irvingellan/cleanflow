# CleanFlow V2 — inactive Production release candidate

Prepared 2026-10-08. **No merge, push, deploy, data mutation or release authorization.**
Branch `feature/design-system-v2-production-rc`; existing worktree
`/Users/irvingellan/.codex/worktrees/design-system-v2-production-rc/Clean Flow Gabriela`.
The ZIP release manifest records the exact candidate commit; this document is
part of that commit and deliberately does not invent a self-referential SHA.

## Verified truth and provenance

- Source baseline/origin/main: `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526`.
- Actual live Hosting build: `5c2e52492331577a7cbdc4aa41a8f1a6b9771b45`.
- Live Hosting version `6130ee0f019cbff4`, release `1791153898087000`,
  timestamp `2026-10-04T22:44:58.087Z`. Fresh HTTPS root/marker/static GETs verify
  this separately from Git. Main differs from deployed source only in CURRENT_STATE.
- Accepted integrated source `7705efb374b8e60953b1d0b04a4a282fa640a2bf`;
  authenticated preview implementation `1aa7587f493b809ab6c091a09e1495339809e43f`;
  integrated reference `668732955140c5450205ce2cd38aaf759160abf8`.
- Only accepted presentation, tests and required foundations were imported.
  Intake/Telemetry WIP and all original worktrees are untouched. No whole-branch merge.
- Machine inventory in the ZIP categorizes every changed file, records current
  and accepted-source hashes, and explicitly identifies RC adaptations/additions.
- Firestore live Rules SHA256 `c5d77e887cd4709a41b6e645bebfd5cf9df8e39ba200f8678e91d6559eaecf97`;
  Storage live Rules SHA256 `03af557b86e6ccf1598a92c7c879dd16866676ec7e93c931b6f92de1c81a2ae5`.
  Both match the baseline source. Ruleset IDs/timestamps and 11 relevant ACTIVE
  Function revisions are recorded in sanitized JSON. Firebase bundle hashes are
  **not Git commit hashes**; exact deployed backend Git provenance is not established.

## Behavior and conflicts

The 149 inventoried protected backend/Rules/provider/controller/public/PWA files
are byte-identical. All 55 original Job Detail prop expressions match baseline.
This is structural preservation plus synthetic/emulator regression, not execution
of 55 real production operations. No new queries, domain rules, schemas or providers.
UNKNOWN, archived/completed, checklist and lifecycle semantics remain independent.
Public routes and manager authorization are unchanged. Original SW has no fetch
handler; photo File/deadline mitigation, Dashboard generation/deadline, manager
access/global deadline, checklist submission and notifications remain preserved.

Independent review found and resolved only:

1. Production V2 was misleadingly labeled Sandbox: App passes actual environment;
   only Sandbox renders its indicator.
2. Mobile detail More omitted primary destinations: those existing callbacks are
   now available there, preserving the approved hidden detail-tabs layout.
3. Services used two nonexistent keys: reused existing EN/PT/ES keys.
4. Historical App-byte-identical claim clarified to exact 55-binding parity.

No operational conflict required a business change. Historical Phase A build
comparison used an incompatible old Vite config. Its RC replacement explicitly
checks default/explicit CURRENT worker/static/marker parity and V2 exclusion;
entry hashes may differ because Vite embeds explicit VITE inputs.

## Activation contract — NOT executed

`VITE_MANAGER_EXPERIENCE` is build-time only: absent/current => CURRENT; v2 => V2;
anything else fails. Production query strings, local/session storage and developer
comparison cannot activate V2. Sandbox comparison remains developer-only behind
manager access. UI environment navigation is not authorization.

Preparation only, clean candidate checkout:

```sh
npm run hosting:prepare -- <candidate-SHA>
npm run hosting:prepare -- <candidate-SHA> sandbox
# Future V2 artifact preparation, not deployment:
npm run hosting:prepare -- <candidate-SHA> production v2
```

Preparation enforces HEAD, clean tracked tree, aliases, project, environment,
presentation marker, expected files, hashes, no symlinks/temporaries/fixtures.
The narrow approved V2 lazy asset families are allowed only in a V2-bound
Production manifest. Default CURRENT excludes V2 JS/catalog/harnesses.
Foundation CSS keeps legacy aliases pixel-equivalent; CSS tokens can exist without
V2 activation. No .env files, config snapshots, compiled app bundles, customer
records, credentials or raw cloud inventories enter the review package.

## Validation

- Focused operational/V2 units: 59 files / 765 tests.
- Full unit suite: 127 files / 1,411 tests.
- Hosting/environment/build guards: 26 tests.
- Disposable Firestore/Storage emulator security: 78 tests, synthetic project,
  isolated ports; existing user's emulators untouched. Installed JDK21 reused.
- Browser: 369 checks (354 Chromium, 15 WebKit): integrated43, real App26,
  production-like CURRENT/V2 4, Job Detail175, Shell19, Dashboard30, Services11,
  primitives31, CURRENT pixel-equivalence30.
- Light EN / dark PT; ES detail and localization; 360/390/768/1280/1440 widths;
  keyboard/ARIA/focus/confirmation/Back/filter/containment regressions.
- Production CURRENT, explicit candidate V2 and Sandbox builds and prepared
  manifests, fixture exclusion, source audit and whitespace checks.

Browser providers are synthetic, external requests aborted, writes explicitly
rejected. Emulator security does not imply phone notification display or full
authenticated cloud operational success. Logs retain initial failures as history
but final logs are identified separately; no failed tests are silently omitted.

## Release evidence gates

| Gate | Evidence / status |
|---|---|
| A engineering | Passed local suites/builds/guards/reviews; exact manifest in ZIP |
| B local operator | Irving accepted integrated approved source; RC fixes synthetic-reviewed |
| C authenticated Sandbox | Passed for isolated accepted source, not a deployed exact RC delta |
| D full operational backend | Pending; sandbox Functions/Storage billing-gated; emulator evidence only |
| E physical iPhone V2 | Pending; earlier CURRENT Safari/photo transport evidence is not V2 proof |
| F Gabi acceptance | Pending |
| G Production authorization | Not granted; no release performed |

No unresolved P0/P1 presentation/security defect found in this RC review.
Dependency audits are a separate inherited warning, not a clean-security claim:
root runtime has 4 high advisory findings; Functions runtime has 11 moderate,
1 high and 1 critical (`proxy-addr`, GHSA-jqcg-44mw-7w3h). Package/lockfiles and
Functions remain unchanged; exploitability of the deployed bundle is not proven
by npm audit. No automatic dependency update is performed. Triage these findings
explicitly in the release decision; presentation tests do not clear them.
The existing real-photo/notification reliability questions are not solved by
presentation source preservation. Do not claim rollout/device/user success.

## Future controlled release — only after explicit GO

1. Re-fetch; verify approved SHA, ancestry/base, live backend/Rules and rollback
   version have not drifted. Repeat targeted suites and inspect exact config.
2. Obtain required operational/iPhone/Gabi decisions; choose quiet window.
3. Integrate approved RC only under separate authorization. Build with explicit
   `hosting:prepare -- <approved-SHA> production v2`; inspect manifest/config.
4. Separately authorize/execute `firebase deploy --only hosting --project clean-flow-prototipo`.
   No Functions/Rules/Storage/indexes/secrets/billing changes needed.
5. Read-only verify HTTP200, marker/presentation, HTML/chunk hashes, Production
   binding, no fixtures, no SW fetch listener, manager/public entry availability.
6. Irving checks installed Production iPhone PWA + Safari update/resume/navigation
   before involving Gabi. Never mutate real records as automated smoke fixtures.

## Hosting-only rollback — NOT executed

Target CURRENT version captured now: `6130ee0f019cbff4`, build `5c2e524...`.
Existing installed Firebase CLI supports immutable-version source syntax
(`hosting-clone.js` inspected), so future authorized rollback is:

```sh
firebase hosting:clone clean-flow-prototipo@6130ee0f019cbff4 clean-flow-prototipo:live --project clean-flow-prototipo
```

Alternatively use Firebase Console Hosting release history Roll back to that
exact version. Reconfirm version is retained before rollout; never guess a live
channel as the rollback source. No backend rollback is needed because backend
does not change. Verify marker/assets and fresh/resumed Safari/PWA after rollback;
already-open browser clients may retain old code until navigation/update.
Do not unregister notification workers or change tokens to force an update.

**Recommendation:** READY FOR PRODUCTION RELEASE DECISION as an inactive RC;
hold deployment until remaining gates, dependency advisory triage and explicit
authorization are resolved.
