// Cloud Functions scale to zero when idle, and the first call after that waits
// for a cold start (~4 s each). Waking the functions a screen ahead of need
// hides that wait at no cost. Each function is woken at most once per interval
// per browser, and failures are ignored: warming never blocks the app.
export const warmIntervalMs = 8 * 60 * 1000;
const keyPrefix = "cleanflow.functionWarmup.";

function browserStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function warmFunctions(tasks, { now = Date.now(), storage = browserStorage() } = {}) {
  const started = [];
  for (const [name, run] of tasks) {
    let last = 0;
    try {
      last = Number(storage?.getItem(keyPrefix + name)) || 0;
    } catch {
      last = 0;
    }
    if (last && now - last < warmIntervalMs) continue;
    try {
      storage?.setItem(keyPrefix + name, String(now));
    } catch {
      // Without storage the interval is per page view; still bounded.
    }
    started.push(name);
    Promise.resolve().then(run).catch(() => {});
  }
  return started;
}

/** Warms now and again whenever the page comes back to the foreground. */
export function startFunctionWarmup(tasks) {
  if (typeof document === "undefined") return () => {};
  warmFunctions(tasks);
  const onVisible = () => {
    if (document.visibilityState === "visible") warmFunctions(tasks);
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
}
