import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { appVersion } from "../../appVersion.js";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";
const sessionStorageKey = "cleanflow.manager-page-load.session-id";
const deviceStorageKey = "cleanflow.manager-page-load.device-id";
const allowedPages = new Set(["dashboard", "jobs", "properties", "clients", "cleaners", "payouts"]);

function randomIdentifier(environment) {
  if (typeof environment.crypto?.randomUUID === "function") return environment.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function storedIdentifier(storage, key, environment) {
  try {
    const current = storage?.getItem(key);
    if (typeof current === "string" && current.length > 0) return current;
    const created = randomIdentifier(environment);
    storage?.setItem(key, created);
    return created;
  } catch {
    return randomIdentifier(environment);
  }
}

function classifyBrowser(userAgent = "") {
  if (/edg\//i.test(userAgent)) return "edge";
  if (/firefox\//i.test(userAgent)) return "firefox";
  if (/chrome|chromium|crios/i.test(userAgent)) return "chrome";
  if (/safari/i.test(userAgent)) return "safari";
  return "other";
}

function classifyPlatform(userAgent = "", platform = "") {
  const source = `${userAgent} ${platform}`;
  if (/iphone|ipad|ipod/i.test(source)) return "ios";
  if (/android/i.test(source)) return "android";
  if (/mac/i.test(source)) return "macos";
  if (/win/i.test(source)) return "windows";
  if (/linux/i.test(source)) return "linux";
  return "other";
}

function connectionSummary(connection) {
  if (!connection) return undefined;
  const summary = {};
  if (typeof connection.effectiveType === "string") summary.effectiveType = connection.effectiveType;
  if (Number.isFinite(connection.rtt)) summary.rtt = Math.round(connection.rtt);
  if (Number.isFinite(connection.downlink)) summary.downlink = connection.downlink;
  if (typeof connection.saveData === "boolean") summary.saveData = connection.saveData;
  return Object.keys(summary).length > 0 ? summary : undefined;
}

function boundedDuration(value) {
  return Math.max(0, Math.min(600_000, Math.round(Number(value) || 0)));
}

/** Builds a deliberately coarse, customer-data-free event for pilot latency comparison. */
export function buildManagerPageLoadEvent({ page, durationMs, dataDurationMs, result, uid }, environment = globalThis) {
  if (!allowedPages.has(page) || !["success", "error"].includes(result) || !uid) return null;
  const navigator = environment.navigator || {};
  const window = environment.window || environment;
  const matchMedia = typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : null;
  const standalone = navigator.standalone === true || Boolean(matchMedia?.("(display-mode: standalone)").matches);
  const connection = connectionSummary(navigator.connection);

  return {
    page,
    durationMs: boundedDuration(durationMs),
    dataDurationMs: boundedDuration(dataDurationMs),
    result,
    uid,
    sessionId: storedIdentifier(environment.sessionStorage, sessionStorageKey, environment),
    deviceId: storedIdentifier(environment.localStorage, deviceStorageKey, environment),
    deviceClass: Number(window.innerWidth) < 768 ? "mobile" : "desktop",
    browser: classifyBrowser(navigator.userAgent),
    platform: classifyPlatform(navigator.userAgent, navigator.platform),
    standalone,
    viewport: {
      width: Math.max(0, Math.round(Number(window.innerWidth) || 0)),
      height: Math.max(0, Math.round(Number(window.innerHeight) || 0)),
    },
    appVersion,
    ...(connection ? { connection } : {}),
  };
}

export function recordManagerPageLoad(input) {
  const event = buildManagerPageLoadEvent(input);
  if (!event) return Promise.resolve();

  try {
    return addDoc(collection(db, "organizations", organizationId, "managerPageLoadEvents"), {
      ...event,
      createdAt: serverTimestamp(),
    }).catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}
