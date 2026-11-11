# Startup reliability — local release candidate

This candidate starts at verified Production source
`0f9735f5641815f00f6ef0912621dee6cb62b9a8`, Hosting version
`b66d088c9aaaa728`. Public GitHub main is not the release baseline. Work in an
isolated checkout and use approved private source custody before any remote
integration. [#83](https://github.com/irvingellan/cleanflow/issues/83) owns
source reconciliation.

The entry HTML has a fallback independent of the main JavaScript and CSS.
The compiled stylesheet downloads without blocking that fallback's first
paint. The operational interface becomes visible when React has committed
and the stylesheet applies. The 15-second budget uses elapsed wall time on
resume. Before the operational interface opens, a failed entry asset may
trigger one reload after reconnection, a different deployment marker, or a
same-origin check that returns the expected MIME type. This applies to the
plain manager and agenda entries.
A JavaScript exception is reported by stage, without exception text. Language
preferences remain optional when browser storage denies access. An HTML document
that does not reach the device cannot render an application fallback.

The manager session observer has a 12-second UI deadline. It may still resolve
and proceed to server-backed manager verification. A confirmed network return can
open one fresh verification window; cached membership is insufficient and the
revocation listener remains in place. Dashboard still uses server reads with a
20-second deadline. Its one-time queries use Firestore Lite. The reader
ships in the entry JavaScript and initializes on its first query after
manager verification. The server evaluates the same Firebase Auth and
Firestore Rules for each query. The full SDK retains the membership listener
and revocation path. Each Dashboard attempt runs at most four queries
concurrently across all its phases. In the compiled WebKit desktop experiment,
the unbounded control failed before HTTP headers in all three attempts.
All three attempts with the four-read limit loaded the populated Dashboard.
A transient read can retry once in the foreground while
the error stays visible. Firestore Lite reports fetch failures without an HTTP
status as a Firebase `unknown` error. That SDK code also gets one retry and is
recorded as `firestore-unknown`, separately from unclassified application errors.
Late or expired requests cannot publish data or launch
later phases. Cleaner Hub bounds the first session, membership and agenda waits, and
still requires server-confirmed active membership before exposing private data.
The legacy public Offer entry bounds the initial GET, including reading the body.

Diagnostics reuse the existing session-local ring for manager verification and
add Auth, Dashboard and Cleaner Hub phases. A separate ring starts in HTML
before the module. Stage, elapsed time, build marker and coarse environment
describe the failure. The Dashboard reader silences Lite SDK messages that
can include request paths or query bodies. The app's allowlisted diagnostics
record these failures locally. The existing remotely collected aggregate page/operation telemetry
keeps its prior schema and coverage.

Use [public probes](../scripts/cleanflowPublicProbe.md) to check Hosting,
entry assets and anonymous browser readiness. A synthetic manager run
exercises the signed-in data. Use [retention preparation](../scripts/prepareStartupHostingRetention.md)
to build local, hash-verified forward and compatible rollback files. Only hashed
assets cross versions; entry HTML, version markers, manifests and workers do not.
Older pages can then still fetch their script even after the Hosting switch.
The root worker still takes control and announces an available build. It no
longer navigates an open document during activation. The older worker's
fallback navigation could replace a usable document with a network error,
including during login or unfinished work. The entry HTML acknowledges older
workers before React commits so a rollback does not interrupt the candidate
document. The root worker still has no fetch handler or operational cache.
Dedicated notification workers keep their existing routes and behavior.

Local browser commands, with Node 22 and Java 21 installed:

```sh
npm test
node e2e/pwa-entry/run.mjs
node --test scripts/prepareHosting.test.mjs scripts/prepareStartupHostingRetention.test.mjs
VITE_CLEANFLOW_EMULATOR_FIRESTORE_PORT=18180 VITE_CLEANFLOW_EMULATOR_AUTH_PORT=19180 \
  firebase emulators:exec --config firebase.cleaner-hub-test.json --project demo-cleanflow \
  --only auth,firestore 'playwright test --config=playwright.p0-startup.config.js'
```

The WebKit config uses a fresh manager-only fixture by default. Set
`CLEANFLOW_P0_STRESS=1` before the same command to seed jobs and exercise all
Dashboard queries. The tests check which collections return successful REST
responses and verify that Firestore denies queries from signed-out and
non-manager sessions.

With the earlier Watch transport, a repeated full-fixture test completed
one of four runs using SDK defaults and four of four with fetch streams
disabled. The Firestore Lite experiment also completed all four runs and
used direct queries. A transient 503 on the earlier separate reader module
was cached by WebKit in the same document. Including the reader in the entry
keeps JavaScript failures in the existing pre-React recovery path. Dashboard
data requires current server results for every phase. Consult [DEC-055](DECISIONS.md#dec-055--direct-server-reads-for-the-manager-dashboard)
and use the [field check](P0_STARTUP_FIELD_CHECK.md) to record the actual
stage on the affected Mac and iPhone. The [upstream Firestore WebKit report](https://github.com/firebase/firebase-js-sdk/issues/9789)
and [Auth persistence report](https://github.com/firebase/firebase-js-sdk/issues/10540)
describe separate mechanisms to compare with those observations. In a local
two-tab test, a held Firebase Auth IndexedDB transaction stalled the second
tab with and without a saved synthetic session. Closing the holding tab
allowed the pending observer to finish in the same document. The Auth
watchdog gives a bounded error while the SDK remains blocked. Use the opt-in
[Auth IndexedDB qualification](../e2e/auth-idb/README.md) to check the current
behavior and require saved-session recovery while the lock is still held
when qualifying the upstream fix in a stable SDK.

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
