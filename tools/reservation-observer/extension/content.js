(() => {
  let timer, inFlight = false, dirty = false;
  const extract = async () => {
    if (inFlight) { dirty = true; return; }
    inFlight = true;
    try {
      const config = await chrome.runtime.sendMessage({ type: "SHADOW_CONFIG" });
      const sourceId = config?.sources?.[location.hostname];
      if (!sourceId) return; // Explicit local pairing/enablement required.
      const poll = globalThis.ReservationBridgeParser.parse(document, location, sourceId, new Date().toISOString());
      await chrome.runtime.sendMessage({ type: "SHADOW_OBSERVATION", poll });
    } catch { /* Local receiver unavailable: do not log page/account/error data. */ }
    finally { inFlight = false; if (dirty) { dirty = false; schedule(); } }
  };
  function schedule() { clearTimeout(timer); timer = setTimeout(extract, 750); }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  schedule();
})();
