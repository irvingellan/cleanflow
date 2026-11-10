# CleanFlow public startup checks

Run from the repository root with Node 22 and the locked repository dependencies.

```sh
node scripts/cleanflowPublicProbe.mjs
node scripts/cleanflowPublicProbe.mjs --host firebaseapp.com
node scripts/cleanflowPublicProbe.mjs --browser webkit
node scripts/cleanflowPublicProbe.mjs --browser chromium
```

The CLI accepts only the two Production Firebase Hosting origins. Each invocation
prints one JSON record with the UTC sample time, origin, phase, build ID, elapsed
times, HTTP status and allowlisted outcome codes. Exit status 1 means a probe
failed. Exit status 2 means the runner or invocation failed. An unavailable
browser is a runner problem and is identified by `BROWSER_UNAVAILABLE`.

| Phase | Pass condition | Coverage |
| --- | --- | --- |
| HTTP | `/` and `/agenda` return HTML with the expected policy and Vite references. The version binds to Production. Both PWA manifests point to their expected entry. All four workers respond as JavaScript with the expected policy and the root worker matches the version. JS and CSS referenced by the entry pages respond to HEAD with the expected MIME type. | Detects redirects, CDN or origin errors, a version request with an incomplete body, stale root workers, and an HTML rewrite masquerading as a JavaScript file. HEAD does not read or execute asset bodies. |
| Anonymous browser | A fresh browser context displays both manager login fields and the enabled submit control, and a separate context shows the cleaner access-code field with its submit control disabled until input. The browser fetches and executes the entry JavaScript without an uncaught exception or failed critical static request during this interval. | Exercises entry rendering at 1280×720 without account credentials. The probe permits only allowlisted same-origin static GETs, blocks Service Workers and WebSockets, and rejects redirects without following them. It checks public startup with these restrictions. Real Safari, installed workers, authenticated membership, Dashboard data and notification delivery require separate checks. |

`--expected-build <full-commit-SHA>` pins the expected marker for an authorized
release verification. The Hosting release workflow still compares the exact
published bytes with the approved preparation manifest. Leave the SHA unpinned
for routine availability sampling.

Add `--dashboard-asset assets/dashboardReads-<hash>.js` with the exact path
from the reviewed manifest to check the dynamically imported Dashboard chunk
during release verification.
This is a separate HTTP and MIME check. The anonymous pages do not load
the authenticated Dashboard or run its chunk, so test execution of that
import with a synthetic authorized manager on an isolated origin.

## Schedule proposal

The repository contains the runnable probe and commands. No schedule is active.
Use a scheduler on an existing approved runner to run both HTTP commands every
5 minutes. Run the WebKit browser command every 30 minutes from a runner with the
Playwright WebKit build for the locked version. Chromium can confirm a WebKit
failure or act as a comparison browser. Set a 60-second outer job deadline and
keep one invocation per host and phase active at a time. A second approved
vantage point helps distinguish a local route or CDN edge from a wider failure.
Review Hosting transfer after the first day before increasing browser frequency.
HTTP asset checks use HEAD to keep routine traffic small.

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
