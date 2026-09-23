import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";
export const managerPageLoadDiagnosticsLimit = 500;
export const managerPageLoadPages = ["dashboard", "jobs", "properties", "clients", "cleaners", "payouts"];

/** Reads only the existing bounded diagnostics window; no operational collections are queried. */
export async function getManagerPageLoadEvents({ windowDays = 7, now = Date.now() } = {}) {
  const cutoff = Timestamp.fromDate(new Date(now - windowDays * 24 * 60 * 60 * 1000));
  const events = collection(db, "organizations", organizationId, "managerPageLoadEvents");
  const snapshot = await getDocs(query(
    events,
    where("createdAt", ">=", cutoff),
    orderBy("createdAt", "desc"),
    limit(managerPageLoadDiagnosticsLimit),
  ));

  return snapshot.docs.map((document) => {
    const event = document.data();
    return {
      id: document.id,
      page: event.page,
      durationMs: event.durationMs,
      dataDurationMs: event.dataDurationMs,
      result: event.result,
      uid: event.uid,
      sessionId: event.sessionId,
      deviceId: event.deviceId,
      deviceClass: event.deviceClass,
      browser: event.browser,
      platform: event.platform,
      standalone: event.standalone,
      connection: event.connection,
      createdAt: event.createdAt,
    };
  });
}

export function durationSeverity(durationMs) {
  if (durationMs > 3000) return "slow";
  if (durationMs >= 1000) return "noticeable";
  return "normal";
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return null;
  return sortedValues[Math.max(0, Math.ceil(percentileValue * sortedValues.length) - 1)];
}

function summarize(events) {
  const durations = events.map((event) => event.durationMs).filter(Number.isFinite).sort((a, b) => a - b);
  if (durations.length === 0) {
    return { eventCount: events.length, averageMs: null, medianMs: null, p95Ms: null, slowest: null };
  }
  const middle = Math.floor(durations.length / 2);
  return {
    eventCount: events.length,
    averageMs: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
    medianMs: durations.length % 2 === 0
      ? Math.round((durations[middle - 1] + durations[middle]) / 2)
      : durations[middle],
    p95Ms: percentile(durations, 0.95),
    slowest: [...events].filter((event) => Number.isFinite(event.durationMs))
      .sort((first, second) => second.durationMs - first.durationMs)[0] || null,
  };
}

export function summarizeManagerPageLoadEvents(events) {
  const byPage = new Map(managerPageLoadPages.map((page) => [page, []]));
  for (const event of events) {
    if (byPage.has(event.page)) byPage.get(event.page).push(event);
  }
  return {
    ...summarize(events),
    byPage: managerPageLoadPages.map((page) => ({ page, ...summarize(byPage.get(page)) })),
  };
}
