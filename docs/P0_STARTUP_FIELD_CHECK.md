# CleanFlow P0 field check

Use this card with the affected operator's consent. Observe an ordinary failure
in the existing Safari tab or installed app before trying a synthetic candidate.
Keep the affected window open until you record its state. A new tab, a reload or
a reinstall can lose the evidence. The operator can continue their work after
recording one observation.

| Record | What to enter |
| --- | --- |
| Time | Local time to the nearest minute and time zone. |
| Device | Mac or iPhone, OS and Safari version, and Safari tab, Mac web app or Home Screen app. |
| Entry | Manager Home or Agenda. For an operational link write only its category. |
| Trigger | Fresh open, reopening from the background, wake, or network transition. Record Wi-Fi or cellular and whether the network returned. |
| First visible state | Safari could not open the page, blank page, Opening CleanFlow, Checking sign-in, Checking manager access, Loading dashboard, Agenda waiting, or ready. |
| Outcome | Approximate seconds until ready or an error appeared. State whether it recovered by itself, after another action, or stayed stuck. |
| Build | Record the build only if it was captured in the affected tab. A separate public version check records what Hosting served at probe time. |

Run the existing public probes around the reported time from an independent
runner. Compare their document, asset and render outcomes to the observed stage.
The probes exercise public entries. For a populated Dashboard, sign in on an
isolated origin with a synthetic account and verify the full result after resume.

If Checking sign-in persists and another CleanFlow tab is idle, record that
fact. With the operator's permission and after checking the other tab has no
unsaved work, close only that tab and observe whether the original one recovers.
This distinguishes the two-tab Auth symptom reproduced in the lab.

If the operator already has Web Inspector enabled and consents to its use, open
the console for the affected tab or installed app. The following expression
returns selected fields from the two CleanFlow session-local diagnostic rings.
It pairs events recorded in the same second as the current navigation.
Two reloads in that second can share a timestamp. Older builds can only
provide recent events without a navigation stamp, which are returned separately. Production may have only the manager
ring, and an inaccessible page may have neither ring. The observation card
still applies in those cases.

```js
(() => {
  const shellStages = new Set([
    "html_ready", "script_error", "stylesheet_error", "entry_exception",
    "entry_timeout", "stylesheet_timeout", "stylesheet_ready", "react_mounted", "entry_ready",
    "render_error", "worker_registration_error",
    "online_recovery", "version_recovery", "asset_recovery", "manual_reload",
  ]);
  const appStages = new Set([
    "auth_resolved", "access_verification_started", "cache_snapshot_seen",
    "server_membership_confirmed", "access_denied", "verification_timeout",
    "verification_error", "listener_error", "lifecycle_retry", "manual_retry",
    "recovered_after_retry", "outer_deadline_expired", "lifecycle_retry_suppressed",
    "auth_restore_started", "auth_restore_resolved", "auth_restore_timeout",
    "auth_restore_error", "auth_signin_timeout", "dashboard_phase_started",
    "dashboard_phase_completed", "dashboard_load_started", "dashboard_load_ready",
    "dashboard_load_error", "dashboard_load_timeout", "dashboard_recovery",
    "cleaner_startup_started", "cleaner_startup_ready", "cleaner_startup_timeout",
    "cleaner_startup_error",
  ]);
  const phases = new Set([
    "dashboard_read_module", "core_reads", "offers", "issues", "cleaner_names",
    "cleaner_auth", "cleaner_membership", "cleaner_agenda",
  ]);
  const reasons = new Set([
    "timeout", "offline", "unavailable", "permission-denied", "unauthenticated",
    "unknown", "pageshow", "visible", "online", "manual", "deadline-exceeded",
    "resource-exhausted", "failed-precondition", "firestore-unknown", "auto",
  ]);
  const entries = new Set(["manager_entry", "agenda"]);
  const build = /^[a-f0-9]{40}(?:-cleaner-push|-inbox-off)?$/;
  const navigation = Math.round(performance.timeOrigin / 1000);
  const validInteger = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;

  function read(key, allowedStages, limit) {
    let rows;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return { status: "missing" };
      if (raw.length > 65536) return { status: "invalid" };
      rows = JSON.parse(raw);
    } catch {
      return { status: "unavailable" };
    }
    if (!Array.isArray(rows)) return { status: "invalid" };
    const current = [];
    const unlinked = [];
    for (const row of rows.slice(-limit)) {
      if (!allowedStages.has(row?.stage)) continue;
      const event = { stage: row.stage };
      if (phases.has(row.phase)) event.phase = row.phase;
      if (reasons.has(row.reason)) event.reason = row.reason;
      if (entries.has(row.entry)) event.entry = row.entry;
      if (validInteger(row.durationMs, 600000)) event.durationMs = row.durationMs;
      if (validInteger(row.elapsedMs, 86400000)) event.elapsedMs = row.elapsedMs;
      if (validInteger(row.attempt, 10000)) event.attempt = row.attempt;
      if (typeof row.buildId === "string" && build.test(row.buildId)) event.buildId = row.buildId;
      if (row.navigationSecond === navigation) current.push(event);
      else if (row.navigationSecond === undefined) unlinked.push(event);
    }
    return { status: "available", current, recentWithoutNavigationStamp: unlinked };
  }

  return JSON.stringify({
    shell: read("cleanflow.startup.diagnostics", shellStages, 20),
    app: read("cleanflow.manager-access.diagnostics", appStages, 30),
  }, null, 2);
})()
```

Copy only the returned text and the completed observation card. The expression
makes no network request and never reads URL, account, clipboard, cookies or
operational data. If there is no existing Inspector access, use only the card.

A compiled loopback demo is suitable for native Safari on its own host. Its
Firebase emulator connections use that device's loopback interface. A second
device therefore needs its own approved synthetic setup to test authenticated
flows. Opening a public entry on a second device can still establish whether
the document and its assets render there. Test the installed iPhone Home Screen
app in its existing window when recording a field incident.
