// Cleaner Hub + notification readiness — presentation model (prototype only).
// Every state here is derived from EVIDENCE fields that Codex's functional layer
// would return. Nothing is assumed healthy without evidence.

import { addDays } from "../model/time.js";

/* ---------- Device readiness ---------- */

export const READINESS = ["ready", "install", "enable", "reconnect", "checking", "unsupported", "unknown"];

/**
 * Evidence for ONE device, as the functional layer would report it.
 * displayMode: "browser" (tab) | "standalone" (opened from Home Screen) | "unknown"
 * permission: "default" | "granted" | "denied" | "unknown"
 * registration: "none" | "active" | "stale" | "error" | "unknown"  (server-side record for THIS device)
 * appVersion: "current" | "outdated" | "unknown"                   (service worker / app shell)
 * lastTest: { result: "confirmed" | "accepted" | "failed", at } | null
 *   "confirmed" = the device itself reported display, or the person said they saw it.
 *   "accepted"  = provider accepted the request; display NOT confirmed.
 */
export function deviceReadiness(ev) {
  if (!ev) return { state: "unknown", reasons: ["noEvidence"], action: "support" };
  if (ev.checking) return { state: "checking", reasons: [], action: null };
  if (ev.supported === false) return { state: "unsupported", reasons: [ev.platform === "ios" ? "iosTooOld" : "browserNoPush"], action: "inbox" };
  if (ev.platform === "ios" && ev.displayMode === "browser") return { state: "install", reasons: ["iosNeedsHomeScreen", "cantSeeInstall"], action: "install" };
  if (ev.permission === "denied") return { state: "enable", reasons: ["permissionDenied"], action: "unblock" };
  if (ev.permission === "default") return { state: "enable", reasons: ["permissionNotAsked"], action: "allow" };
  if (ev.permission === "unknown") return { state: "unknown", reasons: ["permissionUnknown"], action: "check" };
  if (ev.registration === "none" || ev.registration === "error") return { state: "reconnect", reasons: [ev.registration === "error" ? "registrationError" : "registrationMissing"], action: "reconnect" };
  if (ev.registration === "stale") return { state: "reconnect", reasons: ["registrationStale"], action: "reconnect" };
  if (ev.appVersion === "outdated") return { state: "reconnect", reasons: ["appOutdated"], action: "update" };
  if (ev.registration === "unknown") return { state: "unknown", reasons: ["registrationUnknown"], action: "check" };
  // Registered. Only a confirmed test makes it "ready"; registration alone is not proof.
  if (ev.lastTest?.result === "confirmed") return { state: "ready", reasons: ["testConfirmed"], action: "test" };
  if (ev.lastTest?.result === "failed") return { state: "reconnect", reasons: ["testFailed"], action: "reconnect" };
  if (ev.lastTest?.result === "accepted") return { state: "unknown", reasons: ["acceptedNotConfirmed"], action: "test" };
  return { state: "unknown", reasons: ["registeredNotTested"], action: "test" };
}

export const READINESS_TONE = { ready: "success", install: "attention", enable: "attention", reconnect: "warning", checking: "info", unsupported: "neutral", unknown: "neutral" };
export const READINESS_ICON = { ready: "checkCircle", install: "phone", enable: "bell", reconnect: "refresh", checking: "refresh", unsupported: "x", unknown: "info" };

/** What the app can and cannot verify from where it is running. */
export function evidenceLines(ev) {
  const lines = [];
  lines.push({ key: "displayMode", value: ev.displayMode, verified: ev.displayMode !== "unknown" });
  if (ev.displayMode === "browser") lines.push({ key: "installElsewhere", value: "unknown", verified: false });
  lines.push({ key: "permission", value: ev.permission, verified: ev.permission !== "unknown" });
  lines.push({ key: "registration", value: ev.registration, verified: !["unknown"].includes(ev.registration) });
  lines.push({ key: "appVersion", value: ev.appVersion, verified: ev.appVersion !== "unknown" });
  lines.push({ key: "lastTest", value: ev.lastTest?.result || "never", verified: ev.lastTest?.result === "confirmed" });
  return lines;
}

/* ---------- Cleaner schedule ---------- */

const ACTIVE = ["ASSIGNED", "IN_PROGRESS"];
export function scheduleFor(data, cleanerId) {
  const today = data.clock.date;
  const mine = data.jobs.filter(j => j.cleanerIds.includes(cleanerId));
  const sort = (a, b) => (a.date === b.date ? (a.start || "99").localeCompare(b.start || "99") : a.date < b.date ? -1 : 1);
  const offers = data.jobs.filter(j => j.offers.some(o => o.cleanerId === cleanerId) && !j.cleanerIds.includes(cleanerId) && j.status !== "COMPLETED");
  return {
    today: mine.filter(j => j.date === today && ACTIVE.includes(j.status)).sort(sort),
    upcoming: mine.filter(j => j.date > today && ACTIVE.includes(j.status)).sort(sort),
    completed: mine.filter(j => j.status === "COMPLETED" && j.date >= addDays(today, -14)).sort(sort).reverse(),
    offers: offers.sort(sort),
    changes: (data.hub?.changes || []).filter(c => c.cleanerId === cleanerId).slice().sort((a, b) => (b.at.date === a.at.date ? b.at.min - a.at.min : b.at.date < a.at.date ? -1 : 1)),
  };
}

/** Coverage of the schedule source. "verified" is the only state that allows a definitive "no work". */
export const COVERAGE = ["verified", "partial", "pending", "unknown"];
export function emptyMessageKey(coverage) {
  return coverage === "verified" ? "hb.empty.verified" : "hb.empty.notDefinitive";
}

/* ---------- Inbox audience ---------- */

/** Manager events have no `audience`; cleaner events carry { cleanerId }. */
export function inboxFor(list, role, cleanerId) {
  if (role === "cleaner") return list.filter(n => n.audience?.cleanerId === cleanerId);
  return list.filter(n => !n.audience);
}

/* ---------- Scenarios A–O (one coherent state) ---------- */

export const SCENARIOS = [
  { id: "A", role: "cleaner", device: { displayMode: "standalone", permission: "granted", registration: "active", lastTest: "confirmed" }, screen: "agenda" },
  { id: "B", role: "cleaner", device: { displayMode: "browser", permission: "default", registration: "none", lastTest: null }, screen: "onboarding" },
  { id: "C", role: "cleaner", device: { displayMode: "standalone", permission: "default", registration: "none", lastTest: null }, screen: "setup" },
  { id: "D", role: "cleaner", device: { displayMode: "standalone", permission: "default", registration: "none", lastTest: null }, screen: "setup" },
  { id: "E", role: "cleaner", device: { displayMode: "standalone", permission: "granted", registration: "none", lastTest: null }, screen: "setup" },
  { id: "F", role: "cleaner", device: { displayMode: "standalone", permission: "granted", registration: "active", lastTest: null }, screen: "setup" },
  { id: "G", role: "cleaner", device: { displayMode: "standalone", permission: "granted", registration: "active", lastTest: "accepted" }, screen: "setup" },
  { id: "H", role: "cleaner", device: { displayMode: "standalone", permission: "granted", registration: "stale", lastTest: "accepted" }, screen: "inbox", event: "missed" },
  { id: "I", role: "manager", screen: "devices" },
  { id: "J", role: "manager", screen: "devices", device: "m1" },
  { id: "K", role: "cleaner", screen: "agenda", event: "moved" },
  { id: "L", role: "cleaner", screen: "offers", event: "interested" },
  { id: "M", role: "cleaner", screen: "agenda", event: "revoked" },
  { id: "N", role: "cleaner", screen: "agenda", coverage: "partial" },
  { id: "O", role: "manager", screen: "away" },
];
