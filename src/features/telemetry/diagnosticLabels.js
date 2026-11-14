// Human labels for diagnostics: a person and a device instead of raw IDs.
const platformNames = { macos: "Mac", ios: "iPhone/iPad", ipados: "iPad", android: "Android", windows: "Windows", linux: "Linux", chromeos: "Chromebook" };
const browserNames = { safari: "Safari", chrome: "Chrome", firefox: "Firefox", edge: "Edge", samsung: "Samsung Internet" };

function titled(value, names) {
  if (typeof value !== "string" || !value) return null;
  return names[value.toLowerCase()] || value.charAt(0).toUpperCase() + value.slice(1);
}

/** "Mac · Safari", "iPhone/iPad · app instalado". The browser/platform key stays the filter value. */
export function deviceLabel({ browser, platform, standalone } = {}, installedLabel = "app") {
  const parts = [titled(platform, platformNames), standalone === true ? installedLabel : titled(browser, browserNames)].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

export function deviceKeyLabel(key, installedLabel) {
  const [browser, platform] = String(key || "").split("/");
  return deviceLabel({ browser, platform }, installedLabel);
}

/** The signed-in person is named; other accounts show a short, stable reference. */
export function personLabel(uid, currentUser, { you, otherAccount }) {
  if (typeof uid !== "string" || !uid) return "—";
  if (currentUser?.uid && uid === currentUser.uid) return currentUser.email ? `${you} (${currentUser.email})` : you;
  return `${otherAccount} · ${uid.slice(0, 6)}`;
}
