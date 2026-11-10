# Startup reliability — local release candidate

This candidate starts at verified Production source
`0f9735f5641815f00f6ef0912621dee6cb62b9a8`, Hosting version
`b66d088c9aaaa728`. Public GitHub main is not the release baseline. Work in an
isolated checkout and use approved private source custody before any remote
integration. [#83](https://github.com/irvingellan/cleanflow/issues/83) owns
source reconciliation.

The entry HTML has a fallback independent of the main JavaScript and CSS.
Its 15-second budget uses elapsed wall time on resume. A failed module may
reopen once before React commits, on observed reconnection or a confirmed
different deployment marker, only on the plain manager and agenda entries.
A JavaScript exception is reported by stage, without exception text. Language
preferences remain optional when browser storage denies access. An HTML document
that does not reach the device cannot render an application fallback.

The manager session observer has a 12-second UI deadline. It may still resolve
and proceed to server-backed manager verification. A confirmed network return can
open one fresh verification window; cached membership is insufficient and the
revocation listener remains in place. Dashboard still uses server reads with a
20-second deadline. It can retry one transient read in the foreground without
hiding the error. Late or expired requests cannot publish data or launch later
phases. Cleaner Hub bounds the first session, membership and agenda waits, and
still requires server-confirmed active membership before exposing private data.
The legacy public Offer entry bounds the initial GET, including reading the body.

Diagnostics reuse the existing session-local ring for manager verification and
add Auth, Dashboard and Cleaner Hub phases. A separate ring starts in HTML
before the module. Stage, elapsed time, build marker and coarse environment
describe the failure. No new remote telemetry, quota-consuming diagnostic writes,
raw exception strings, URLs, tokens, operational data or production rule changes
are required. The existing remotely collected aggregate page/operation telemetry
keeps its prior schema and coverage.

Use [public probes](../scripts/cleanflowPublicProbe.md) to distinguish reachable
Hosting and correct files from anonymous browser readiness. The probe does not
establish signed-in availability. Use [retention preparation](../scripts/prepareStartupHostingRetention.md)
to build local, hash-verified forward and compatible rollback files. Only hashed
assets cross versions; entry HTML, version markers, manifests and workers do not.
Older pages can then still fetch their script even after the Hosting switch.

Local browser commands, with Node 22 and Java 21 installed:

```sh
npm test
node e2e/pwa-entry/run.mjs
node --test scripts/prepareHosting.test.mjs scripts/prepareStartupHostingRetention.test.mjs
VITE_CLEANFLOW_EMULATOR_FIRESTORE_PORT=18180 VITE_CLEANFLOW_EMULATOR_AUTH_PORT=19180 \
  firebase emulators:exec --config firebase.cleaner-hub-test.json --project demo-cleanflow \
  --only auth,firestore 'playwright test --config=playwright.p0-startup.config.js'
```

The WebKit config uses a fresh manager-only fixture by default to assert the
Auth and core Firestore recovery path. Set `CLEANFLOW_P0_STRESS=1` before the
same command to seed jobs and exercise all downstream Dashboard reads. In
initial stress runs, WebKit reached the server reads and retried, but later
queries did not all settle; Chromium completed the full fixture. The same
stress command with `VITE_CLEANFLOW_EMULATOR_FORCE_LONG_POLLING=true` compares
Firestore transport only in local emulators; deployed builds ignore the flag.
Treat a populated, representative WebKit Dashboard as a release gate. Compare
[Firebase's WebKit transport report](https://github.com/firebase/firebase-js-sdk/issues/9789)
and [Auth persistence report](https://github.com/firebase/firebase-js-sdk/issues/10540)
against the affected devices before changing SDK or transport settings.

Before any approved release, recheck the exact live version and review both
sealed directories against the source and Hosting configuration. Run anonymous
probes and synthetic signed-in checks on an isolated origin. Exercise a prior
page against candidate assets and a candidate page against compatible rollback
assets. Verify both PWA install entries, Safari reopen and notification click
routing, and verify current-device notification delivery only through a consented
test account/device. Require specific approval for a Hosting-only rollout; verify
both aliases and hashes after the switch, and use the prepared compatible
rollback on any regression. Do not invoke a prior notification rollout tool
whose publish/rollback path changes Functions.

[#48](https://github.com/irvingellan/cleanflow/issues/48),
[#61](https://github.com/irvingellan/cleanflow/issues/61) and
[#87](https://github.com/irvingellan/cleanflow/issues/87) remain open for field
confirmation. Playwright WebKit is not the installed Safari build, Intel
performance or an iOS Home Screen session. No Hosting migration is proposed
without repeated, independently confirmed provider-side failures.
