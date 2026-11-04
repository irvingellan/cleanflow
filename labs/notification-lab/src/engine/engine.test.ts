import { describe, expect, it } from "vitest";
import { GABI_SCENARIOS, SCENARIOS, scenarioById } from "../scenarios/registry.ts";
import { applyCommand, drainPipeline, readableEntries } from "./engine.ts";
import { cleanerAgenda, inboxItems, lockScreenPushes } from "./selectors.ts";
import { createSession, fingerprint, isTerminal, manual, replay, run, step } from "./session.ts";
import { createWorld } from "./world.ts";

const runScenario = (id: string, seed = 4242) => run(createSession(scenarioById(id), seed));

describe("scenario catalog", () => {
  it("has the 23 canonical scenarios and 10 failures, unique ids", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(33);
    expect(ids.filter((id) => id.startsWith("M"))).toHaveLength(11);
    expect(ids.filter((id) => id.startsWith("C"))).toHaveLength(12);
    expect(ids.filter((id) => id.startsWith("F"))).toHaveLength(10);
    expect(GABI_SCENARIOS.length).toBeGreaterThanOrEqual(6);
  });

  it("never presents a non-published scenario as published", () => {
    for (const s of SCENARIOS) {
      if (!s.realProductStatus.includes("PUBLISHED")) expect(s.proposal, s.id).toBe(true);
    }
    expect(SCENARIOS.filter((s) => !s.proposal).map((s) => s.id)).toEqual(["M01", "M03", "M04", "M05", "M06"]);
  });

  it.each(SCENARIOS.map((s) => s.id))("%s runs to a terminal state and every expectation holds", (id) => {
    const session = runScenario(id);
    expect(isTerminal(session)).toBe(true);
    const failed = session.scenario.checks.filter((c) => !c.test(session.world)).map((c) => c.id);
    expect(failed).toEqual([]);
    // Every recipient of a created event is one of the expected recipients.
    const recipients = new Set(session.world.inbox.map((e) => e.userId));
    for (const r of recipients) expect(session.scenario.expectedRecipients, `${id} → ${r}`).toContain(r);
  });
});

describe("determinism", () => {
  it("Replay rebuilds exactly the same world, including manual actions", () => {
    let s = step(step(createSession(scenarioById("C01"))));
    s = manual(s, { type: "SET_ONLINE", deviceId: "bia-android", online: false });
    s = run(s);
    s = manual(s, { type: "MARK_ALL_READ", deviceId: "ana-iphone" });
    expect(fingerprint(replay(s).world)).toBe(fingerprint(s.world));
  });

  it("same seed gives the same race winner; Step advances one transition", () => {
    const a = runScenario("F04", 7);
    const b = runScenario("F04", 7);
    expect(a.world.jobs["job-maple"]!.assignedCleanerId).toBe(b.world.jobs["job-maple"]!.assignedCleanerId);
    const winners = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => runScenario("F04", seed).world.jobs["job-maple"]!.assignedCleanerId));
    expect(winners).toEqual(new Set(["ana", "bia"])); // the seed decides, both outcomes reachable
    const s0 = createSession(scenarioById("C03"));
    const s1 = step(s0);
    expect(s1.world.events).toHaveLength(1);
    expect(s1.world.inbox).toHaveLength(0); // inbox comes in a later transition
    expect(step(step(s1)).world.inbox).toHaveLength(1);
  });

  it("uses no wall clock: two runs at different real times are identical", () => {
    expect(fingerprint(runScenario("M05").world)).toBe(fingerprint(runScenario("M05").world));
  });
});

describe("delivery honesty", () => {
  it("provider accepted is never displayed without an explicit simulation", () => {
    const w = createWorld(1);
    applyCommand(w, { type: "ASSIGN", jobId: "job-maple", cleanerId: "ana" });
    drainPipeline(w);
    const attempt = w.attempts.find((a) => a.userId === "ana")!;
    expect(attempt.providerResult).toBe("ACCEPTED");
    expect(attempt.displayedAt).toBeNull();
    expect(lockScreenPushes(w, "ana-iphone")).toHaveLength(0);
    applyCommand(w, { type: "SIMULATE_DISPLAY", deviceId: "ana-iphone" });
    expect(lockScreenPushes(w, "ana-iphone")).toHaveLength(1);
  });

  it("F09 timeout stays UNKNOWN and cannot be displayed or retried", () => {
    const s = runScenario("F09");
    const attempts = s.world.attempts.filter((a) => a.userId === "ana");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.providerResult).toBe("UNKNOWN");
    expect(attempts[0]!.displayedAt).toBeNull();
    expect(s.world.timeline.some((r) => r.step === "BUSINESS_REJECTED" && r.reason === "display_requires_provider_accepted")).toBe(true);
  });

  it("permission denied keeps the inbox but never shows a push", () => {
    const s = runScenario("F01");
    expect(inboxItems(s.world, "ana-iphone")).toHaveLength(1);
    expect(lockScreenPushes(s.world, "ana-iphone")).toHaveLength(0);
  });

  it("quiet hours hold normal pushes but keep the inbox entry", () => {
    const w = createWorld(1, { clock: { date: "2026-11-04", time: "22:30" } });
    applyCommand(w, { type: "ASSIGN", jobId: "job-maple", cleanerId: "ana" });
    drainPipeline(w);
    expect(w.inbox.filter((e) => e.userId === "ana")).toHaveLength(1);
    expect(w.attempts).toHaveLength(0);
    expect(w.timeline.some((r) => r.reason === "quiet_hours")).toBe(true);
    applyCommand(w, { type: "RESCHEDULE", jobId: "job-maple", date: "2026-11-06", start: "09:00" });
    drainPipeline(w);
    expect(w.attempts).toHaveLength(1); // high priority still attempts
  });
});

describe("isolation (DEMO rules — to be re-verified by Codex with emulator tests)", () => {
  it("a cleaner never reads another cleaner's inbox, offers or amounts", () => {
    const s = runScenario("C01");
    for (const [device, user] of [["ana-iphone", "ana"], ["bia-android", "bia"], ["carla-iphone", "carla"]] as const) {
      expect(readableEntries(s.world, device).every((e) => e.userId === user)).toBe(true);
      const offers = cleanerAgenda(s.world, device).offers;
      expect(offers).toHaveLength(1);
      expect(offers[0]!.amount).toBe(Object.values(s.world.offers).find((o) => o.cleanerId === user)!.amount);
    }
  });

  it("another organization sees nothing", () => {
    const s = runScenario("C01");
    expect(readableEntries(s.world, "dora-android")).toHaveLength(0);
    expect(cleanerAgenda(s.world, "dora-android").offers).toHaveLength(0);
    expect(s.world.inbox.some((e) => e.userId === "dora")).toBe(false);
  });

  it("switching the account hides the previous person's notices", () => {
    let s = run(createSession(scenarioById("C03")));
    expect(inboxItems(s.world, "bia-android")).toHaveLength(1);
    s = manual(s, { type: "SWITCH_ACCOUNT", deviceId: "bia-android", userId: "carla" });
    expect(inboxItems(s.world, "bia-android")).toHaveLength(0);
    expect(lockScreenPushes(s.world, "bia-android")).toHaveLength(0);
  });

  it("revoked access cannot read the inbox", () => {
    let s = run(createSession(scenarioById("C03")));
    s = manual(s, { type: "REVOKE_ACCESS", userId: "bia" });
    expect(readableEntries(s.world, "bia-android")).toHaveLength(0);
    s = manual(s, { type: "OPEN_INBOX_ENTRY", deviceId: "bia-android" });
    expect(s.world.openContext["bia-android"]?.kind).toBe("accessEnded");
  });

  it("offline devices only show what was confirmed before going offline", () => {
    let s = createSession(scenarioById("F08"));
    s = step(s); // offline
    s = run(s);
    expect(s.world.devices["ana-iphone"]!.online).toBe(true);
    const offline = run(createSession({ ...scenarioById("F08"), script: scenarioById("F08").script.slice(0, 2) }));
    expect(readableEntries(offline.world, "ana-iphone")).toHaveLength(0);
    expect(offline.world.inbox.filter((e) => e.userId === "ana")).toHaveLength(1);
  });
});
