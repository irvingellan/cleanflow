/* Inlined before the module graph, so it can report even a missing entry asset. */
(() => {
  const startedAt = performance.timeOrigin || Date.now();
  const budget = 15_000;
  const storageKey = "cleanflow.startup.diagnostics";
  const reloadKey = "cleanflow.startup.reloaded";
  const known = new Set([
    "html_ready", "script_error", "stylesheet_error", "entry_exception",
    "entry_timeout", "react_mounted", "render_error", "worker_registration_error",
    "online_recovery", "version_recovery", "manual_reload",
  ]);
  const script = document.currentScript;
  const buildPattern = /^(?:[a-f0-9]{40}|\d+\.\d+\.\d+-[\dT:.Z-]+)(?:-cleaner-push|-inbox-off)?$/;
  const buildId = buildPattern.test(script?.dataset.build) ? script.dataset.build : "";
  const route = script?.dataset.entry === "agenda" ? "agenda" : "manager_entry";
  const copy = {
    en: ["Opening CleanFlow…", "CleanFlow did not finish opening. Check your connection and try again.", "Try again"],
    pt: ["Abrindo o CleanFlow…", "O CleanFlow não terminou de abrir. Verifique sua conexão e tente novamente.", "Tentar novamente"],
    es: ["Abriendo CleanFlow…", "CleanFlow no terminó de abrir. Comprueba tu conexión y vuelve a intentarlo.", "Intentar de nuevo"],
  };
  let mounted = false;
  let failed = false;
  let sawOffline = navigator.onLine === false;
  let reconnected = false;
  let watchdog;
  let checkedVersion = false;

  function record(stage) {
    try {
      let stored;
      try { stored = JSON.parse(sessionStorage.getItem(storageKey) || "[]"); } catch { /* start a fresh ring */ }
      const clean = (Array.isArray(stored) ? stored : []).slice(-19)
        .filter((entry) => known.has(entry?.stage) && ["manager_entry", "agenda"].includes(entry.entry)
          && Number.isInteger(entry.durationMs) && entry.durationMs >= 0 && entry.durationMs <= 600_000
          && Number.isInteger(entry.navigationSecond))
        .map((entry) => ({
          stage: entry.stage, durationMs: entry.durationMs, navigationSecond: entry.navigationSecond,
          entry: entry.entry, buildId: buildPattern.test(entry.buildId) ? entry.buildId : "",
        }));
      clean.push({
        stage, entry: route, buildId, navigationSecond: Math.round(startedAt / 1000),
        durationMs: Math.min(600_000, Math.max(0, Math.round(Date.now() - startedAt))),
      });
      sessionStorage.setItem(storageKey, JSON.stringify(clean));
    } catch {
      // Diagnostics must not interfere with opening the app (including private browsing).
    }
  }

  function shell() {
    return document.getElementById("cleanflow-startup");
  }

  function apply() {
    const panel = shell();
    if (!panel) return;
    let language;
    try { language = localStorage.getItem("cleanflow-language"); } catch { /* storage is optional */ }
    if (!Object.hasOwn(copy, language)) language = navigator.language?.split("-")[0];
    const messages = Object.hasOwn(copy, language) ? copy[language] : copy[route === "agenda" ? "pt" : "en"];
    panel.hidden = mounted && !failed;
    panel.querySelector("[data-startup-pending]").textContent = messages[0];
    panel.querySelector("[data-startup-alert]").textContent = messages[1];
    panel.querySelector("[data-startup-retry]").textContent = messages[2];
    panel.querySelector("[data-startup-pending]").hidden = failed;
    panel.querySelector("[data-startup-alert]").hidden = !failed;
    panel.querySelector("[data-startup-retry]").hidden = !failed;
  }

  function mayReload() {
    // Only known entry routes, before React has handled any user action.
    return !mounted && failed && navigator.onLine !== false
      && !location.search && ["/", "/agenda", "/agenda/", "/agenda.html"].includes(location.pathname);
  }

  function reloadOnce(stage) {
    if (!mayReload()) return;
    try {
      if (sessionStorage.getItem(reloadKey)) return;
      sessionStorage.setItem(reloadKey, "1");
    } catch { return; }
    record(stage);
    location.reload();
  }

  function retryOnline() {
    if (reconnected) reloadOnce("online_recovery");
  }

  async function checkVersion() {
    if (checkedVersion || !buildId || !mayReload()) return;
    checkedVersion = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_500);
    try {
      const response = await fetch("/version.json", {
        cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal,
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
      const version = await response.json();
      const deployed = version?.deploymentId || version?.buildId;
      if (!controller.signal.aborted && buildPattern.test(deployed) && deployed !== buildId) {
        reloadOnce("version_recovery");
      }
    } catch {
      // A failed probe does not prevent the visible recovery state.
    } finally {
      clearTimeout(timer);
    }
  }

  function fail(stage) {
    record(stage);
    failed = true;
    apply();
    retryOnline();
    if (stage === "script_error") void checkVersion();
  }

  function expire(force) {
    if (!mounted && !failed && (force === true || Date.now() - startedAt >= budget)) fail("entry_timeout");
  }

  function onError(event) {
    if (!mounted && event.target?.tagName === "LINK" && event.target.rel === "stylesheet") {
      record("stylesheet_error");
    } else if (!mounted && event.target?.tagName === "SCRIPT" && event.target.type === "module") {
      fail("script_error");
    } else if (!mounted && event.target === window && event instanceof ErrorEvent) {
      fail("entry_exception");
    }
  }

  window.__cleanflowStartup = {
    mounted() {
      if (mounted) return;
      mounted = true;
      failed = false;
      clearTimeout(watchdog);
      try { sessionStorage.removeItem(reloadKey); } catch { /* storage is optional */ }
      record("react_mounted");
      apply();
    },
    renderFailed: () => fail("render_error"),
    workerFailed: () => record("worker_registration_error"),
  };
  record("html_ready");
  watchdog = setTimeout(() => expire(true), budget);
  window.addEventListener("error", onError, true);
  window.addEventListener("pageshow", expire);
  window.addEventListener("offline", () => { if (!mounted) sawOffline = true; });
  window.addEventListener("online", () => {
    if (!sawOffline) return;
    reconnected = true;
    retryOnline();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") expire();
  });
  document.addEventListener("click", (event) => {
    if (event.target === shell()?.querySelector("[data-startup-retry]")) {
      record("manual_reload");
      location.reload();
    }
  });
  // This script runs from <head>; the body may not exist yet. On a hung module
  // the watchdog can still reveal the body fallback before DOMContentLoaded.
  document.addEventListener("DOMContentLoaded", apply, { once: true });
})();
