import { describe, expect, it, vi } from "vitest";
import { listNotificationInboxForRequest } from "./notificationInbox.js";

const organizationId = "sample-org", cleanerId = "recipient", sessionId = "current";
const auth = { uid: "account", token: { cleanerHub: { organizationId, cleanerId, sessionId } } };
const first = { jobId: "active-job", scheduleRevision: 2 };

function databaseFixture(records, feed = null) {
  function reference(path) {
    const ref = { path, id: path.split("/").at(-1), doc: id => reference(path + "/" + id), collection: id => reference(path + "/" + id) };
    if (feed && ref.path === feed.path) ref.where = ref.orderBy = ref.limit = () => ref;
    return ref;
  }
  const read = ref => ({ ref, data: () => records[ref.path] });
  const getAll = vi.fn(async (...refs) => refs.map(read));
  const database = {
    doc: reference, collection: reference,
    runTransaction: vi.fn(async body => body({ get: ref => ref.path === feed?.path ? feed : read(ref), getAll })),
  };
  return { database, getAll };
}

function query(database, data, caller = auth) {
  return listNotificationInboxForRequest(database, { organizationId, request: { auth: caller, data: { role: "CLEANER", ...data } } });
}

describe("bounded lookup for older materialized schedules", () => {
  it("reads unique source documents, returns only the current recipient's revisions, and never opens a write transaction", async () => {
    const root = "organizations/" + organizationId;
    const jobPath = root + "/jobs/active-job";
    const source = {
      organizationId, schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: [cleanerId],
      scheduledDate: "2026-11-23", scheduleRevision: 2,
      scheduleConfirmation: { revision: 2, byCleaner: { [cleanerId]: { state: "PENDING", assignmentId: "assignment" } } },
    };
    const { database, getAll } = databaseFixture({
      [root + "/members/account"]: { organizationId, cleanerId, sessionId, role: "CLEANER", active: true },
      [root + "/cleaners/recipient"]: { active: true },
      [jobPath]: source,
      [root + "/jobs/other-job"]: { ...source, assignedCleanerIds: ["different"] },
      [jobPath + "/assignments/assignment"]: { organizationId, cleanerId, jobId: first.jobId, isActive: true },
      [jobPath + "/scheduleHistory/2"]: {
        scheduleRevision: 2, previousScheduledDate: "2026-11-21", newScheduledDate: source.scheduledDate,
      },
    });
    const result = await query(database, { agendaRevisions: [first, { ...first, scheduleRevision: 1 },
      { ...first, jobId: "other-job" }, { ...first, jobId: "unknown-job" }] });
    expect(result).toEqual({ confirmations: [{ ...first, reschedule: {
      state: "PENDING", scheduleRevision: 2, scheduledDate: "2026-11-23", scheduledStart: null, previousScheduledDate: "2026-11-21",
    } }] });
    expect(database.runTransaction.mock.calls[0][1]).toEqual({ readOnly: true });
    expect(getAll.mock.calls.map(refs => refs.map(ref => ref.path))).toEqual([
      [jobPath, root + "/jobs/other-job", root + "/jobs/unknown-job"], [jobPath + "/assignments/assignment", jobPath + "/scheduleHistory/2"],
    ]);
  });

  it("rejects a manager, revoked session and mismatched organization without reading jobs", async () => {
    const { database, getAll } = databaseFixture({});
    await expect(query(database, { role: "MANAGER", agendaRevisions: [first] })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(query(database, { agendaRevisions: [first] })).rejects.toMatchObject({ code: "permission-denied" });
    const foreign = { ...auth, token: { cleanerHub: { ...auth.token.cleanerHub, organizationId: "other" } } };
    await expect(query(database, { agendaRevisions: [first] }, foreign)).rejects.toMatchObject({ code: "permission-denied" });
    expect(getAll).not.toHaveBeenCalled();
  });

  it("rejects empty, oversized, duplicate and malformed pair lists and mixed modes before fetching documents", async () => {
    const { database } = databaseFixture({});
    const oversized = Array.from({ length: 26 }, (_, i) => ({ ...first, jobId: String(i) }));
    for (const data of [
      { agendaRevisions: [] }, { agendaRevisions: oversized }, { agendaRevisions: [first, first] },
      { agendaRevisions: [null] }, { agendaRevisions: [{ ...first, jobId: "../job" }] },
      { agendaRevisions: [{ ...first, jobId: " " }] }, { agendaRevisions: [{ ...first, scheduleRevision: 0 }] },
      { agendaRevisions: [{ ...first, cleanerId: "other" }] }, { agendaRevisions: [first], pageSize: 1 },
    ]) {
      await expect(query(database, data)).rejects.toMatchObject({ code: "invalid-argument" });
    }
    expect(database.runTransaction).not.toHaveBeenCalled();
  });
});

it("includes a Job locator only beside a currently authorized schedule response", async () => {
  const root = "organizations/" + organizationId;
  const feed = { path: root + "/cleanerNotificationInboxes/recipient/items" };
  const events = [
    ["RESCHEDULED", "owned", 3], ["RESCHEDULED", "owned", 2], ["RESCHEDULED", "removed", 3],
    ["RESCHEDULED", "missing", 3], ["UNASSIGNED", "removed", 3], ["ASSIGNED", "owned", 3],
  ];
  feed.docs = events.map(([type, jobId, scheduleRevision], i) => {
    const id = String(i).padStart(64, "0");
    return { id, data: () => ({
      organizationId, cleanerId, jobId, scheduleRevision, type, eventId: id,
      eventVersion: 1, processingState: "STORED", createdAt: { toMillis: () => 1 },
    }) };
  });
  feed.size = feed.docs.length;
  const source = {
    organizationId, assignedCleanerId: cleanerId, operationalStatus: "ASSIGNED", scheduleRevision: 3,
    scheduledDate: "2026-11-23", scheduleConfirmation: { revision: 3, byCleaner: { [cleanerId]: { state: "PENDING", assignmentId: null } } },
  };
  const { database } = databaseFixture({
    [root + "/members/account"]: { organizationId, cleanerId, sessionId, role: "CLEANER", active: true },
    [root + "/cleaners/recipient"]: { active: true },
    [root + "/jobs/owned"]: source,
    [root + "/jobs/removed"]: { ...source, assignedCleanerId: "replacement" },
  }, feed);
  const { items } = await query(database, {});
  expect(items[0]).toMatchObject({ openable: true, jobId: "owned", reschedule: { state: "PENDING" } });
  for (const item of items.slice(1)) {
    expect(item).not.toHaveProperty("jobId");
    expect(item).not.toHaveProperty("reschedule");
  }
});
