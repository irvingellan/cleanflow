import { describe, expect, it } from "vitest";
import { deriveNotificationReadiness, messagingWorkerReadiness } from "./notificationReadiness.js";
const origin = "https://synthetic.example";
const ready = { scope: `${origin}/firebase-messaging-push/`, active: { scriptURL: `${origin}/firebase-messaging-sw.js` } };
describe("messaging worker identity", () => {
  it("recognizes only the exact same-origin messaging scope and script", () => {
    expect(messagingWorkerReadiness(ready, origin)).toBe("ready");
  });
  it.each([
    { ...ready, scope: `${origin}/` },
    { ...ready, scope: "https://other.example/firebase-messaging-push/" },
    { ...ready, active: { scriptURL: `${origin}/sw.js` } },
    { ...ready, active: { scriptURL: "https://other.example/firebase-messaging-sw.js" } },
    { ...ready, active: { scriptURL: `${origin}/firebase-messaging-sw.js?other=1` } },
    { active: {} },
  ])("never accepts root, wrong, or unverifiable workers %j", worker => {
    expect(messagingWorkerReadiness(worker, origin)).toBe("mismatch");
  });
  it("keeps a missing active worker distinct from a mismatched active worker", () => {
    expect(messagingWorkerReadiness(null, origin)).toBe("missing");
    expect(messagingWorkerReadiness({ ...ready, active: null }, origin)).toBe("missing");
  });
});
describe("headless readiness", () => {
  const known = { platform: "ios", standalone: true, notificationPermission: "granted", worker: "ready", fcmRegistration: "registered" };
  it("reports UNKNOWN delivery even when this standalone context is registered", () => {
    expect(deriveNotificationReadiness(known)).toEqual({
      context: "standalone", installation: "running-standalone", permission: "granted", worker: "ready", registration: "registered", ready: true, reason: "registered", delivery: "UNKNOWN",
    });
  });
  it("does not call an iOS browser tab installed or push ready", () => {
    expect(deriveNotificationReadiness({ ...known, standalone: false })).toMatchObject({ context: "browser-tab", installation: "unknown", ready: false, reason: "ios-standalone-required", delivery: "UNKNOWN" });
  });
  it.each([
    [{ notificationPermission: "unsupported" }, "unsupported"],
    [{ notificationPermission: "default" }, "permission-default"],
    [{ notificationPermission: "denied" }, "permission-denied"],
    [{ worker: "mismatch" }, "worker-mismatch"],
    [{ worker: "missing" }, "worker-missing"],
    [{ worker: "error" }, "worker-error"],
    [{ fcmRegistration: "unknown" }, "registration-unknown"],
    [{ fcmRegistration: "missing" }, "registration-missing"],
    [{ fcmRegistration: "error" }, "registration-error"],
  ])("exposes a locale-independent reason %s", (patch, reason) => {
    expect(deriveNotificationReadiness({ ...known, ...patch, language: "pt" })).toMatchObject({ ready: false, reason, delivery: "UNKNOWN" });
  });
});
