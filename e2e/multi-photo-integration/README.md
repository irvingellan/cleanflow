# Checklist photo transport

Run from an isolated checkout with the repository's locked dependencies installed
in both package roots, Node 22, Java 21, and Playwright Chromium and WebKit.

```sh
node e2e/multi-photo-integration/run.mjs
```

The runner builds for `demo-cleanflow`, denies cloud credentials, and starts
Hosting, Functions, Auth, Firestore and Storage on the loopback ports in
`firebase.multiphoto-integration.json`. It needs a checkout without an existing
`functions/.secret.local`. The manager view uses its actual checklist component
with an authenticated callable adapter. Public checklist and report pages run
through the Hosting emulator.

The historical 20-photo/50 MiB fixture drops the receipt after a real upload.
Refreshing saved photos reads the server result and leaves the local selection
available for retry. A new photo can use the last server slot; retrying the
unconfirmed selection sends the same bytes and recovers the original receipt
at capacity. The test compares saved evidence and Storage generations across
refresh and retry.

The current 60-photo/120 MiB fixture uses 69-byte generated PNGs. The result
records upload PUT counts, photo body bytes and elapsed time for each selection.
The 65-selection scenario exercises the 60-photo limit and an HTTP 413.
Results in `.tmp/issue-81` describe loopback browser runs. The timings cover
selection through acknowledgment for those generated files. Network overhead,
device memory, camera images, installed PWA behavior and physical device
acceptance require their own measurements.
