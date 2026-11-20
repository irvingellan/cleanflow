import { describe, expect, it, vi } from "vitest";
import { cleanerUnavailabilityForRequest } from "./cleanerUnavailability.js";
import { unavailabilityPeriodError } from "./unavailabilityPeriod.js";

const organizationId = "sample";
const cleanerId = "worker";
const claims = { organizationId, cleanerId, sessionId: "current" };
const auth = { uid: "account", token: { cleanerHub: claims } };
const manager = { uid: "manager", token: {} };
const today = "2028-02-28";
const nowMs = Date.parse("2028-02-29T04:00:00Z"); // Still February 28 in the operating timezone.
const day = { startDate: today, endDate: today };
const root = "organizations/" + organizationId;
const blockRoot = root + "/cleanerUnavailability/";
const guardPath = root + "/cleanerUnavailabilityState/" + cleanerId;

describe("availability period validation", () => {
  it.each([
    [day, null],
    [{ startDate: "2028-02-29", endDate: "2028-02-29" }, null],
    [{ startDate: "2027-02-28", endDate: today }, null],
    [{ startDate: today, endDate: "2029-02-26" }, null],
    [{ startDate: today, endDate: "2029-02-27" }, null],
    [{ startDate: today, endDate: "2029-02-28" }, "duration"],
    [{ startDate: "2029-02-29", endDate: "2029-03-01" }, "dates"],
    [{ startDate: "2028-2-28", endDate: today }, "dates"],
    [{ startDate: "0000-01-01", endDate: today }, "dates"],
    [{ startDate: "2028-02-29", endDate: today }, "dates"],
    [{ startDate: "2028-02-27", endDate: "2028-02-27" }, "past"],
    [{ ...day, startTime: "00:00", endTime: "23:59" }, null],
    [{ ...day, startTime: "9:01", endTime: "11:30" }, "times"],
    [{ ...day, startTime: "10:60", endTime: "13:00" }, "times"],
    [{ ...day, startTime: "12:00", endTime: "12:00" }, "times"],
    [{ ...day, startTime: "12:00", endTime: "00:00" }, "times"],
    [{ ...day, startTime: "13:00", endTime: "24:00" }, "times"],
    [{ ...day, startTime: "", endTime: "" }, "times"],
    [{ ...day, startTime: null, endTime: null }, "times"],
    [{ ...day, startTime: "09:00" }, "times"],
    [{ ...day, endTime: "11:00" }, "times"],
    [{ ...day, endDate: "2028-02-29", startTime: "09:00", endTime: "10:00" }, "times"],
  ])("checks the period %j", (period, error) => {
    expect(unavailabilityPeriodError(period, today)).toBe(error);
  });
});

function fixture(overrides = {}) {
  const records = {
    [root + "/members/account"]: { ...claims, active: true, role: "CLEANER" },
    [root + "/members/manager"]: { active: true, role: "MANAGER" },
    [root + "/cleaners/worker"]: { active: true },
    ...overrides,
  };
  function reference(path, filters = [], maximum = 0) {
    return {
      path, id: path.split("/").at(-1), filters, maximum,
      collection: id => reference(path + "/" + id),
      doc: id => reference(path + "/" + id),
      where: (key, op, value) => reference(path, [...filters, { key, op, value }]),
      limit: n => reference(path, filters, n),
    };
  }
  function snapshot(ref) {
    return { id: ref.id, data: () => records[ref.path], exists: Boolean(records[ref.path]) };
  }
  const transaction = {
    getAll: vi.fn(async (...refs) => refs.map(snapshot)),
    get: vi.fn(async query => {
      const docs = Object.entries(records).filter(([path, value]) => path.startsWith(query.path + "/")
        && query.filters.every(({ key, op, value: bound }) => op === "==" ? value[key] === bound : value[key] >= bound))
        .slice(0, query.maximum).map(([path]) => snapshot(reference(path)));
      return { docs, size: docs.length };
    }),
    set: vi.fn((ref, data) => { records[ref.path] = data; }),
    create: vi.fn((ref, data) => { records[ref.path] = data; }),
    delete: vi.fn(ref => { delete records[ref.path]; }),
  };
  const database = { collection: reference, runTransaction: vi.fn(async callback => callback(transaction)) };
  function invoke(action, data, role = "CLEANER", credentials = role === "MANAGER" ? manager : auth) {
    return cleanerUnavailabilityForRequest(database, {
      organizationId, role, action, request: { data, auth: credentials }, nowMs,
    });
  }
  return { records, transaction, database, invoke };
}

describe("availability calls", () => {
  it("writes the exact schema, keeps first authorship on retries, and serializes mutations on the same guard", async () => {
    const { records, transaction, invoke } = fixture();
    const { block } = await invoke("set", day);
    expect(block).toEqual({ id: expect.stringMatching(/^[a-f0-9]{64}$/), ...day, createdBy: "CLEANER" });
    expect(records[blockRoot + block.id]).toEqual({ organizationId, cleanerId, ...day, createdBy: "CLEANER", createdAt: expect.anything() });
    expect(transaction.getAll.mock.calls[1].map(ref => ref.path)).toEqual([blockRoot + block.id, guardPath]);
    expect(records[guardPath]).toEqual({ updatedAt: expect.anything() });

    const duplicate = await invoke("set", { ...day, cleanerId }, "MANAGER");
    expect(duplicate).toEqual({ block });
    expect(transaction.create).toHaveBeenCalledTimes(1);
    expect(transaction.get).toHaveBeenCalledTimes(1);
    expect(transaction.set).toHaveBeenCalledTimes(1);
    expect(await invoke("remove", { blockId: block.id, cleanerId }, "MANAGER")).toEqual({ removed: true });
    expect(await invoke("remove", { blockId: block.id })).toEqual({ removed: false });
    expect(transaction.set.mock.calls.map(([ref]) => ref.path)).toEqual([guardPath, guardPath]);
    expect(transaction.delete).toHaveBeenCalledTimes(1);
  });

  it("lists only current own data, allowing both actor types and ordering by the start", async () => {
    const { records, database, invoke } = fixture();
    const later = { ...day, startTime: "12:00", endTime: "14:00" };
    const { block: partial } = await invoke("set", { cleanerId, ...later }, "MANAGER");
    const { block: full } = await invoke("set", day);
    Object.assign(records, {
      [blockRoot + "past"]: { ...full, cleanerId, organizationId, startDate: "2028-02-27", endDate: "2028-02-27" },
      [blockRoot + "elsewhere"]: { ...full, cleanerId, organizationId: "other" },
      [blockRoot + "coworker"]: { ...full, organizationId, cleanerId: "another" },
      [blockRoot + "malformed"]: { ...full, organizationId, cleanerId, startTime: "09:00" },
    });
    records[blockRoot + full.id].internal = "private";
    expect(await invoke("list", {})).toEqual({ blocks: [full, { ...later, id: partial.id, createdBy: "MANAGER" }] });
    expect(database.runTransaction.mock.calls.at(-1)[1]).toEqual({ readOnly: true });
    expect(await invoke("remove", { blockId: partial.id })).toEqual({ removed: true });
    expect(await invoke("remove", { blockId: "coworker" })).toEqual({ removed: false });
    expect(await invoke("remove", { blockId: "elsewhere" })).toEqual({ removed: false });
    expect(records[blockRoot + "coworker"]).toBeDefined();
    expect(records[blockRoot + "elsewhere"]).toBeDefined();
  });

  it("requires a current same-organization membership and eligible profile before accessing availability", async () => {
    for (const [path, data, role] of [
      ["/members/account", { ...claims, active: true, role: "CLEANER", sessionId: "retired" }, "CLEANER"],
      ["/members/account", { ...claims, active: true, role: "CLEANER", organizationId: "elsewhere" }, "CLEANER"],
      ["/members/manager", { active: true, role: "MANAGER", organizationId: "elsewhere" }, "MANAGER"],
      ["/members/manager", { active: false, role: "MANAGER" }, "MANAGER"],
      ["/cleaners/worker", { active: true, organizationId: null }, "MANAGER"],
      ["/cleaners/worker", { active: true, organizationId: "elsewhere" }, "CLEANER"],
      ["/cleaners/worker", { active: true, archivedAt: "date" }, "CLEANER"],
      ["/cleaners/worker", { active: false }, "MANAGER"],
    ]) {
      const { invoke, transaction } = fixture({ [root + path]: data });
      const input = role === "MANAGER" ? { ...day, cleanerId } : day;
      await expect(invoke("set", input, role)).rejects.toMatchObject({ code: "permission-denied" });
      expect(transaction.getAll).toHaveBeenCalledTimes(1);
      expect(transaction.get).not.toHaveBeenCalled();
      expect(transaction.set).not.toHaveBeenCalled();
    }
  });

  it("rejects unrecognized input, invalid identifiers and absent or out-of-scope caller credentials", async () => {
    const { invoke, database } = fixture();
    for (const [action, input] of [
      ["list", null], ["list", []], ["list", new Date(nowMs)], ["list", { cleanerId }], ["list", { organizationId }],
      ["set", { ...day, cleanerId }], ["set", { ...day, reason: "extra" }], ["set", { ...day, createdBy: "MANAGER" }],
      ["set", { startDate: today }], ["remove", { blockId: "../other" }], ["remove", { blockId: "one", note: "extra" }],
    ]) {
      await expect(invoke(action, input)).rejects.toMatchObject({ code: "invalid-argument" });
    }
    await expect(invoke("set", day, "MANAGER")).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(invoke("list", {}, "CLEANER", { ...auth, token: { cleanerHub: { ...claims, organizationId: "other" } } }))
      .rejects.toMatchObject({ code: "permission-denied" });
    await expect(invoke("list", {}, "CLEANER", null)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(invoke("set", { ...day, cleanerId }, "MANAGER", { uid: "account", token: { firebase: { sign_in_provider: "anonymous" } } }))
      .rejects.toMatchObject({ code: "unauthenticated" });
    expect(database.runTransaction).not.toHaveBeenCalled();
  });

  it("excludes expired periods from capacity and replays a completed creation at the limit", async () => {
    const { records, transaction, invoke } = fixture();
    const { block } = await invoke("set", day);
    for (let i = 0; i < 28; i += 1) records[blockRoot + "seed" + i] = { ...day, organizationId, cleanerId, createdBy: "MANAGER" };
    records[blockRoot + "misplaced"] = { ...day, organizationId: "elsewhere", cleanerId, createdBy: "CLEANER" };
    records[blockRoot + "expired"] = { ...day, startDate: "2027-01-01", endDate: "2027-01-01", organizationId, cleanerId, createdBy: "MANAGER" };
    await invoke("set", { ...day, startTime: "09:00", endTime: "11:00" });
    await expect(invoke("set", { ...day, startTime: "12:00", endTime: "13:00" })).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(await invoke("set", day)).toEqual({ block });
    expect(transaction.create).toHaveBeenCalledTimes(2);
    expect(transaction.set).toHaveBeenCalledTimes(2);
  });
});
