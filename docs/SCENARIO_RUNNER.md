# Local visual scenarios

The scenario runner reuses Playwright and the `demo-cleanflow` Firebase emulators.
It never targets production, sends WhatsApp/FCM/email, or needs an LLM/API token.
Run it from the repository root with Node dependencies and Playwright Chromium
already installed. On this Mac, Firebase emulators need Homebrew OpenJDK 21;
the runner uses `/opt/homebrew/opt/openjdk@21` when `JAVA_HOME` is unset.

```bash
npm run scenario -- manager-no-checklist --fast
npm run scenario -- manager-with-checklist --watch --mobile
npm run scenario -- offer-assignment --record
npm run scenario -- manager-no-checklist --fast --repeat 3
```

- `--fast` (default): headless, normal speed; retains trace, screenshot, and
  video only on failure.
- `--watch`: headed Chromium with about 400 ms slow motion. `--mobile` sets a
  390 × 844 viewport for the manager and public pages. Browser visibility
  requires a desktop session; if unavailable, use `--record`.
- `--record`: headless, retains Playwright trace and video for review. Failed
  runs also retain a screenshot. Evidence is in ignored `test-results/`.
- `--repeat N`: sequential, isolated synthetic fixture runs within one fresh
  emulator session. Each run uses unique fixture IDs; its Firestore documents
  are cleaned afterward. The emulator is discarded when the command exits.

The runner masks production Application Default Credentials, builds an
emulator-only Hosting bundle, then starts local Auth,
Firestore, Functions, Storage, and Hosting emulators. Public Offer, Checklist,
and Client Report requests go through the existing Hosting rewrites. It runs
only the selected scenario, prints named progress steps and a pass/fail summary,
and checks emulator Firestore state as well as browser UI. Synthetic photo
bytes are a tiny PNG; no customer data or bearer URLs belong in reports.
Scenario browser contexts block service workers so the app's PWA update cycle
cannot navigate a watched form mid-entry. These scenarios do not test PWA
update behavior.

The three scenarios cover manager direct Assignment and no-Run completion;
the full checklist/review/report path; and public Offer interest/decline,
manager Assignment, and Cleaner acknowledgment. Automated elapsed time is
test runtime, **not** human cleaning or manager time.

For occasional exploratory visual inspection, the existing optional
`agent-browser` workflow remains in [Visual smoke testing](VISUAL_TESTING.md).
It is deliberately separate from these deterministic scenarios.
