# Firebase Auth IndexedDB qualification

This optional WebKit test reproduces [Firebase SDK #10540](https://github.com/firebase/firebase-js-sdk/issues/10540)
using two tabs in a fresh, headless browser context. It runs against the
existing synthetic field preview. It does not use an installed browser profile
or seed the emulators again.

From a clean checkout, start the preview with Node 22 and Java 21.

```sh
node scripts/runStartupFieldPreview.mjs
```

Keep it running. In a second terminal in the same checkout, run the test with
the current locked SDK.

```sh
CLEANFLOW_AUTH_IDB_EXPECT=baseline ./node_modules/.bin/playwright test --config=playwright.auth-idb.config.js
```

After a stable Firebase release includes [the upstream correction](https://github.com/firebase/firebase-js-sdk/pull/10553),
use an approved upgrade candidate with its own exact preview build and run:

```sh
CLEANFLOW_AUTH_IDB_EXPECT=fixed ./node_modules/.bin/playwright test --config=playwright.auth-idb.config.js
```

Both modes verify the exact commit, emulator project and loopback policy before
opening the browser. The first tab holds an IndexedDB read transaction by
chaining count requests. The second tab shares the same origin and context.
The test separately covers a signed-out browser and a saved session for the
synthetic manager.

- `baseline` requires the 12-second Auth recovery state. The observer must stay
  pending after retry while the transaction is held. Closing the first tab
  must then show the correct signed-out or authorized state in the second tab
  without reloading or entering credentials again.
- `fixed` requires that same result before the transaction is released and
  before the Auth watchdog expires.

The output contains stage names, attempt numbers, durations and reload counts.
An induced transaction in WebKit verifies the SDK behavior in this fixture.
Physical Safari suspension and the reported device incident require their own
observations.
