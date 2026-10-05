const origins = new Set(["https://my.hospitable.com", "https://app.guesty.com"]);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    const url = new URL(sender.url || "about:blank");
    if (!origins.has(url.origin) || !/^\/(calendar|reservations)(?:\/|$)/.test(url.pathname)) return { error: "ORIGIN_DENIED" };
    // Own-extension storage contains only explicit local pairing, not platform sessions.
    const { observer } = await chrome.storage.local.get("observer");
    if (!observer) return { error: "NOT_PAIRED" };
    if (message.type === "SHADOW_CONFIG") return { sources: observer.sources };
    if (message.type !== "SHADOW_OBSERVATION") return { error: "UNKNOWN_MESSAGE" };
    const provider = url.hostname === "my.hospitable.com" ? "BROWSER_DOM_HOSPITABLE" : "BROWSER_DOM_GUESTY";
    if (message.poll?.sourceId !== observer.sources?.[provider]
      || !Array.isArray(message.poll.observations)
      || message.poll.observations.some(row => row.sourceProvider !== provider || row.sourceType !== "BROWSER_DOM")) return { error: "SOURCE_SCOPE_DENIED" };
    if (!Number.isInteger(observer.port) || observer.port < 1024 || observer.port > 65535
      || !/^[a-f0-9]{64}$/.test(observer.pairingKey || "")) return { error: "INVALID_PAIRING" };
    const response = await fetch(`http://127.0.0.1:${observer.port}/observations`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Observer-Pairing": observer.pairingKey },
      body: JSON.stringify(message.poll), credentials: "omit", redirect: "error", signal: AbortSignal.timeout(5000),
    });
    return { result: response.ok ? "SHADOW_OBSERVED" : "LOCAL_OBSERVER_REJECTED" };
  })().then(respond, () => respond({ error: "LOCAL_OBSERVER_UNAVAILABLE" }));
  return true;
});
