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
export const managerOperationDiagnosticsLimit = 500;
export const managerOperationPage = "job-detail";
export const managerOperationNames = ["offers", "issues", "assignments", "checklist-run", "checklist-capability", "cleaners"];
export const managerOperationVisitLimit = 20;

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

/** Reads bounded timing metadata only; Job records and operation payloads are never queried. */
export async function getManagerOperationEvents({ windowDays = 7, now = Date.now() } = {}) {
  const cutoff = Timestamp.fromDate(new Date(now - windowDays * 24 * 60 * 60 * 1000));
  const events = collection(db, "organizations", organizationId, "managerOperationEvents");
  const snapshot = await getDocs(query(
    events,
    where("createdAt", ">=", cutoff),
    orderBy("createdAt", "desc"),
    limit(managerOperationDiagnosticsLimit),
  ));

  return snapshot.docs.map((document) => {
    const event = document.data();
    return {
      id: document.id,
      page: event.page,
      operation: event.operation,
      phase: event.phase,
      pageVisitId: event.pageVisitId,
      startedAtMs: event.startedAtMs,
      durationMs: event.durationMs,
      result: event.result,
      uid: event.uid,
      sessionId: event.sessionId,
      deviceId: event.deviceId,
      deviceClass: event.deviceClass,
      browser: event.browser,
      platform: event.platform,
      viewport: event.viewport,
      appVersion: event.appVersion,
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

export function summarizeManagerOperationEvents(events) {
  const byOperation = new Map(managerOperationNames.map((operation) => [operation, []]));
  for (const event of events) {
    if (byOperation.has(event.operation)) byOperation.get(event.operation).push(event);
  }
  return managerOperationNames.map((operation) => {
    const operationEvents = byOperation.get(operation);
    return {
      operation,
      ...summarize(operationEvents),
      errorCount: operationEvents.filter((event) => event.result === "error").length,
    };
  });
}

function createdAtMilliseconds(value) {
  if (value?.toMillis) return value.toMillis();
  const time = value?.toDate ? value.toDate().getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** Relative starts preserve parallel timing within one browser visit. */
export function groupRecentJobDetailVisits(events) {
  const byVisit = new Map();
  for (const event of events) {
    if (event.page !== managerOperationPage || typeof event.pageVisitId !== "string" || !event.pageVisitId
      || !Number.isFinite(event.startedAtMs) || !Number.isFinite(event.durationMs) || event.durationMs < 0) continue;
    const visit = byVisit.get(event.pageVisitId) || {
      id: event.pageVisitId,
      startedAtMs: event.startedAtMs,
      endedAtMs: event.startedAtMs + event.durationMs,
      latestAtMs: 0,
      events: [],
    };
    visit.startedAtMs = Math.min(visit.startedAtMs, event.startedAtMs);
    visit.endedAtMs = Math.max(visit.endedAtMs, event.startedAtMs + event.durationMs);
    visit.latestAtMs = Math.max(visit.latestAtMs, createdAtMilliseconds(event.createdAt));
    visit.events.push(event);
    byVisit.set(event.pageVisitId, visit);
  }
  return [...byVisit.values()]
    .map((visit) => ({
      ...visit,
      spanMs: Math.max(1, visit.endedAtMs - visit.startedAtMs),
      events: visit.events.sort((first, second) => first.startedAtMs - second.startedAtMs
        || first.operation.localeCompare(second.operation)),
    }))
    .sort((first, second) => second.latestAtMs - first.latestAtMs || second.startedAtMs - first.startedAtMs)
    .slice(0, managerOperationVisitLimit);
}
