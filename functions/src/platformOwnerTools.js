import { isoDate, operationKinds } from "./platformOverview.js";

const pages = new Set(["dashboard", "jobs", "properties", "clients", "cleaners", "payouts"]);
const devices = new Set(["desktop", "mobile"]);
const failureLimit = 20;

export function publicFailure(event, kind) {
  const page = kind === "operation" && event.page === "job-detail" ? event.page
    : pages.has(event.page) ? event.page : null;
  return {
    at: isoDate(event.createdAt),
    kind,
    page,
    operation: kind === "operation" && operationKinds.includes(event.operation) ? event.operation : null,
    deviceClass: devices.has(event.deviceClass) ? event.deviceClass : null,
    appVersion: typeof event.appVersion === "string" && /^v?\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(event.appVersion)
      ? event.appVersion : null,
  };
}

export async function recentFailures(org) {
  async function last(collection, kind) {
    const snapshot = await org.collection(collection).where("result", "==", "error")
      .orderBy("createdAt", "desc").limit(failureLimit)
      .select("createdAt", "page", "operation", "deviceClass", "appVersion").get();
    return snapshot.docs.map(doc => publicFailure(doc.data(), kind));
  }
  const groups = await Promise.all([
    last("managerPageLoadEvents", "page"), last("managerOperationEvents", "operation"),
  ]);
  return groups.flat().filter(row => row.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, failureLimit);
}

// The handler authorizes each request before consulting this per-instance map.
// Bound retained snapshots and share in-flight reads, including explicit refreshes.
export function createSnapshotReader(now = Date.now) {
  const snapshots = new Map();
  return async function read(key, refresh, load) {
    const previous = snapshots.get(key);
    const time = now();
    if (previous?.pending) return previous.pending;
    if (!refresh && previous?.expiresAt > time) return previous.value;
    for (const [id, entry] of snapshots) {
      if (!entry.pending && entry.expiresAt <= time) snapshots.delete(id);
    }
    if (snapshots.size >= 100 && !snapshots.has(key)) snapshots.delete(snapshots.keys().next().value);
    const entry = {};
    snapshots.set(key, entry);
    entry.pending = Promise.resolve().then(load).then(result => {
      entry.value = { ...result, updatedAt: new Date(time).toISOString() };
      entry.expiresAt = now() + 60_000;
      return entry.value;
    }).catch(error => {
      if (snapshots.get(key) === entry) snapshots.delete(key);
      throw error;
    }).finally(() => { delete entry.pending; });
    return entry.pending;
  };
}
