// A lazy entry chunk that cannot be downloaded leaves React with nothing to render.
// The HTML startup shell owns that screen: it shows its message and the retry button.
export function guardEntryLoad(load, target = window) {
  let settled = false;
  const fail = () => {
    if (settled) return;
    settled = true;
    target.__cleanflowStartup?.renderFailed();
  };
  // Vite reports a failed chunk or preload here before the import itself rejects.
  const onPreloadError = () => fail();
  target.addEventListener("vite:preloadError", onPreloadError);
  const release = () => target.removeEventListener("vite:preloadError", onPreloadError);
  return load().then((module) => {
    settled = true;
    release();
    return module;
  }, (error) => {
    const shell = target.__cleanflowStartup;
    fail();
    release();
    // Without the startup shell (tests, embedded previews) the failure must stay visible.
    if (!shell) throw error;
    // The shell already replaced the screen; keep React suspended instead of crashing twice.
    return new Promise(() => {});
  });
}
