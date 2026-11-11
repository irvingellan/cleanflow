# CleanFlow public startup checks

Run from the repository root with Node 22 and the locked repository dependencies.

```sh
node scripts/cleanflowPublicProbe.mjs
node scripts/cleanflowPublicProbe.mjs --host firebaseapp.com
node scripts/cleanflowPublicProbe.mjs --all-hosts
node scripts/cleanflowPublicProbe.mjs --all-hosts --browser webkit
node scripts/cleanflowPublicProbe.mjs --browser chromium
```

The CLI accepts only the two Production Firebase Hosting origins. The default
checks `web.app`. Use either `--all-hosts` or a specific `--host`. Each sampled
origin prints one JSON line with the UTC sample time, build ID, elapsed times,
HTTP status and allowlisted outcomes for each phase. Exit status 0 means all
requested checks passed, 1 means at least one probe failed, and 2 means a runner
or invocation error. A runner error takes precedence over a probe failure in the
exit status. The JSON lines keep both results. An unavailable browser reports
`BROWSER_UNAVAILABLE`.

| Phase | Pass condition | Coverage |
| --- | --- | --- |
| HTTP | `/` and `/agenda` return HTML with the expected policy and Vite references. The version binds to Production. Both PWA manifests point to their expected entry. All four workers respond as JavaScript with the expected policy and the root worker matches the version. JS and CSS referenced by the entry pages respond to HEAD with the expected MIME type. | Detects redirects, CDN or origin errors, a version request with an incomplete body, stale root workers, and an HTML rewrite masquerading as a JavaScript file. HEAD does not read or execute asset bodies. |
| Anonymous browser | A fresh browser context displays both manager login fields and the enabled submit control, and a separate context shows the cleaner access-code field with its submit control disabled until input. The browser fetches and executes the entry JavaScript without an uncaught exception or failed critical static request during this interval. | Exercises entry rendering at 1280×720 without account credentials. The probe permits only allowlisted same-origin static GETs, blocks Service Workers and WebSockets, and rejects redirects without following them. It checks public startup with these restrictions. Real Safari, installed workers, authenticated membership, Dashboard data and notification delivery require separate checks. |

`--expected-build <full-commit-SHA>` pins the expected marker for an authorized
release verification. The Hosting release workflow still compares the exact
published bytes with the approved preparation manifest. Leave the SHA unpinned
for routine availability sampling.

## Schedule proposal

On an existing Linux runner with Node 22, GNU `timeout`, and the locked
Playwright WebKit browser, adapt this crontab example to the runner's checkout,
Node executable, and writable log directory. Both jobs check the two aliases.
The WebKit job starts two minutes after a regular HTTP job so the 60-second
deadlines leave time between them.

```cron
CLEANFLOW_PROBE_REPO=/opt/cleanflow
CLEANFLOW_PROBE_NODE=/usr/local/bin/node
CLEANFLOW_PROBE_LOG_DIR=/var/log/cleanflow
*/5 * * * * cd "$CLEANFLOW_PROBE_REPO" && /usr/bin/timeout -k 5s 60s "$CLEANFLOW_PROBE_NODE" scripts/cleanflowPublicProbe.mjs --all-hosts >> "$CLEANFLOW_PROBE_LOG_DIR/http.ndjson"
2,32 * * * * cd "$CLEANFLOW_PROBE_REPO" && /usr/bin/timeout -k 5s 60s "$CLEANFLOW_PROBE_NODE" scripts/cleanflowPublicProbe.mjs --all-hosts --browser webkit >> "$CLEANFLOW_PROBE_LOG_DIR/webkit.ndjson"
```

Have the runner record the exit status and flag an invocation with a missing
origin line or a timeout status as a runner error. In another scheduler use
the same commands and a 60-second job deadline. Chromium can confirm a WebKit
failure. A second runner region can help isolate a local network or CDN edge.
Check Hosting transfer before increasing the browser frequency. HTTP asset
checks use HEAD to keep routine traffic small.

Retain the JSON records for 30 days in the runner's restricted logs. Associate
the runner region with each stream. The probe records no raw response body, page
text, token, query string, account information or browser error message. If one
sample fails, immediately repeat the same phase and host to rule out a transient
runner failure or an overlapping release. Investigate two consecutive failures
on the same phase, or failures confirmed from two independent vantage points.
Check the browser result before describing the site as available to visitors.
If HTTP fails, compare the code and path across both origins. If HTTP passes and
the browser fails, reproduce with the same engine and release, and compare the
critical resource count, page error count and form readiness.

## Local tests

```sh
node --test scripts/cleanflowPublicProbe.test.mjs
CLEANFLOW_PROBE_TEST_BROWSER=webkit node --test scripts/cleanflowPublicProbe.test.mjs
CLEANFLOW_PROBE_TEST_BROWSER=chromium node --test scripts/cleanflowPublicProbe.test.mjs
```

Tests use a localhost fixture and synthetic forms. Install the locked Playwright
browser binaries on the runner if needed. See the [Playwright browser setup](https://playwright.dev/docs/browsers)
and [network routing guide](https://playwright.dev/docs/network).
