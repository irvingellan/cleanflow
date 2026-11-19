import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Scheduled reminders cover every organization, each inside its own paths, and
// one organization's failure never blocks another's reminder.
const state = vi.hoisted(() => ({ database: null, sendEach: null, logger: null, devices: null, claims: null, inbox: null }));
vi.mock("../runtime/firebase.js", () => ({
  get db() { return state.database; },
  liveMessaging: () => ({ sendEach: (messages) => state.sendEach(messages) }),
  organizationReference: (organizationId) => state.database.collection("organizations").doc(organizationId),
}));
vi.mock("../runtime/params.js", () => ({ managerReminderProviderParam: { value: () => "fcm" } }));
vi.mock("../runtime/devCenter.js", () => ({ allowedDeveloperUids: () => ["developer"] }));
vi.mock("firebase-functions", () => ({ logger: { info: (...args) => state.logger.info(...args), error: (...args) => state.logger.error(...args) } }));
vi.mock("../managerFcmDelivery.js", async (original) => ({
  ...(await original()),
  loadEligibleManagerPushDevices: async (database, organizationId) => state.devices(organizationId),
}));
vi.mock("../managerReminders.js", async (original) => ({
  ...(await original()),
  claimReminderDelivery: async ({ deliveryReference, deliveryData }) => state.claims(deliveryReference, deliveryData),
}));
vi.mock("../notificationInboxEvents.js", async (original) => ({
  ...(await original()),
  createManagerReminderInboxItem: (transaction, organization, reminder, eventId) => state.inbox(organization, reminder, eventId),
}));

import { reminderDeliveryId } from "../managerReminders.js";
import { defaultOrganizationId } from "../runtime/organization.js";
import {
  previewManagerReminder,
  processManagerReminderWindow,
  sendTodayExecutionReminder,
  sendTomorrowPlanningReminder,
} from "./managerNotifications.js";

const now = new Date("2026-11-04T16:00:00Z");
const job = (scheduledDate, extra = {}) => ({ scheduledDate, operationalStatus: "ASSIGNED", assignedCleanerId: "cleaner", ...extra });
const device = (organizationId) => ({
  id: `device-${organizationId}`,
  data: () => ({ token: `token-${organizationId}-${"x".repeat(40)}`, language: "en", organizationId }),
});

function fakeDatabase({ jobs, failingOrganizations = [] }) {
  const reads = [];
  const updates = [];
  const organization = (organizationId) => ({
    id: organizationId,
    path: `organizations/${organizationId}`,
    collection: (name) => ({
      doc: (id) => ({
        id,
        path: `organizations/${organizationId}/${name}/${id}`,
        update: async (data) => { updates.push({ path: `organizations/${organizationId}/${name}/${id}`, data }); },
      }),
      where: (field, operator, value) => ({
        get: async () => {
          reads.push(`organizations/${organizationId}/${name}`);
          if (failingOrganizations.includes(organizationId)) throw Object.assign(new Error("unavailable"), { code: "unavailable" });
          return { docs: (jobs[organizationId] || []).filter((entry) => entry[field] === value).map((entry) => ({ data: () => entry })) };
        },
      }),
    }),
  });
  return {
    reads,
    updates,
    collection: (name) => {
      if (name !== "organizations") throw new Error(`Unexpected collection ${name}`);
      return { listDocuments: async () => Object.keys(jobs).map((id) => ({ id })), doc: organization };
    },
    runTransaction: async (work) => work({ get: async () => ({ exists: false }) }),
  };
}

function arrange(options) {
  state.database = fakeDatabase(options);
  state.logger = { info: vi.fn(), error: vi.fn() };
  state.sendEach = vi.fn(async (messages) => ({
    responses: messages.map((message, index) => ({ success: true, messageId: `message-${index}` })), successCount: messages.length, failureCount: 0,
  }));
  state.devices = vi.fn(async (organizationId) => [device(organizationId)]);
  state.claims = vi.fn(async () => true);
  state.inbox = vi.fn();
  return state;
}

const twoOrganizations = () => ({
  "org-a": [job("2026-11-04"), job("2026-11-04", { assignedCleanerId: null }), job("2026-11-05")],
  "org-b": [job("2026-11-04"), job("2026-11-05"), job("2026-11-05"), job("2026-11-05")],
});

// The scheduled handlers read the real clock: 08:00 on 2026-11-04 in the reminder timezone.
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

describe("manager reminders per organization", () => {
  it("sends each organization its own reminder, from its own Jobs, to its own devices", async () => {
    const { database, sendEach, claims, inbox, devices } = arrange({ jobs: twoOrganizations() });

    const outcomes = await sendTodayExecutionReminder();

    expect(outcomes.map(({ jobCount, attentionCount, deliveryStatus }) => ({ jobCount, attentionCount, deliveryStatus })))
      .toEqual([
        { jobCount: 2, attentionCount: 1, deliveryStatus: "SENT" },
        { jobCount: 1, attentionCount: 0, deliveryStatus: "SENT" },
      ]);
    expect(database.reads).toEqual(["organizations/org-a/jobs", "organizations/org-b/jobs"]);
    expect(devices.mock.calls.map(([organizationId]) => organizationId)).toEqual(["org-a", "org-b"]);
    expect(sendEach.mock.calls.map(([messages]) => messages.map(({ token }) => token)))
      .toEqual([[device("org-a").data().token], [device("org-b").data().token]]);

    const reminder = (organizationId) => ({ targetDate: "2026-11-04", type: "TODAY_07", organizationId });
    expect(claims.mock.calls.map(([reference, data]) => [reference.path, data.organizationId, data.jobCount])).toEqual([
      [`organizations/org-a/managerReminderDeliveries/${reminderDeliveryId("org-a", reminder("org-a"))}`, "org-a", 2],
      [`organizations/org-b/managerReminderDeliveries/${reminderDeliveryId("org-b", reminder("org-b"))}`, "org-b", 1],
    ]);
    expect(inbox.mock.calls.map(([organization]) => organization.path)).toEqual(["organizations/org-a", "organizations/org-b"]);
    expect(database.updates.map(({ path }) => path.split("/").slice(0, 3).join("/")))
      .toEqual(["organizations/org-a/managerReminderDeliveries", "organizations/org-b/managerReminderDeliveries"]);
  });

  it("uses tomorrow's Jobs of each organization for the evening reminder", async () => {
    arrange({ jobs: twoOrganizations() });

    const outcomes = await sendTomorrowPlanningReminder();

    expect(outcomes.map(({ targetDate, jobCount }) => ({ targetDate, jobCount }))).toEqual([
      { targetDate: "2026-11-05", jobCount: 1 },
      { targetDate: "2026-11-05", jobCount: 3 },
    ]);
  });

  it("skips an organization without Jobs and still reminds the other one", async () => {
    const { sendEach, claims, inbox } = arrange({ jobs: { "org-a": [], "org-b": [job("2026-11-04")] } });

    const outcomes = await sendTodayExecutionReminder();

    expect(outcomes.map(({ skipped, jobCount }) => ({ skipped, jobCount })))
      .toEqual([{ skipped: "no-jobs", jobCount: 0 }, { skipped: undefined, jobCount: 1 }]);
    expect(claims).toHaveBeenCalledTimes(1);
    expect(inbox.mock.calls.map(([organization]) => organization.path)).toEqual(["organizations/org-b"]);
    expect(sendEach).toHaveBeenCalledTimes(1);
  });

  it("one organization's failure does not block another's reminder, and the run still fails", async () => {
    const { sendEach, claims, logger } = arrange({ jobs: twoOrganizations(), failingOrganizations: ["org-a"] });

    await expect(sendTodayExecutionReminder()).rejects.toMatchObject({ code: "unavailable" });

    expect(claims.mock.calls.map(([, data]) => data.organizationId)).toEqual(["org-b"]);
    expect(sendEach.mock.calls.map(([messages]) => messages.map(({ token }) => token)))
      .toEqual([[device("org-b").data().token]]);
    expect(logger.error).toHaveBeenCalledWith("Manager reminder failed for one organization.", {
      organizationId: "org-a", reminderType: "TODAY_07", errorCode: "unavailable",
    });
  });

  it("an already claimed window is skipped for that organization only", async () => {
    const { sendEach, claims } = arrange({ jobs: twoOrganizations() });
    claims.mockImplementation(async (reference, data) => data.organizationId !== "org-a");

    const outcomes = await sendTodayExecutionReminder();

    expect(outcomes.map(({ skipped }) => skipped)).toEqual(["already-claimed", undefined]);
    expect(sendEach.mock.calls.map(([messages]) => messages.map(({ token }) => token)))
      .toEqual([[device("org-b").data().token]]);
  });

  it("without an organization, the window is the default organization's", async () => {
    const { database, claims } = arrange({ jobs: { [defaultOrganizationId]: [job("2026-11-04")], "org-b": [job("2026-11-04")] } });

    await processManagerReminderWindow("TODAY_07", { now });

    expect(database.reads).toEqual([`organizations/${defaultOrganizationId}/jobs`]);
    expect(claims.mock.calls.map(([, data]) => data.organizationId)).toEqual([defaultOrganizationId]);
  });
});

describe("previewManagerReminder", () => {
  const request = (token = {}) => ({
    auth: { uid: "developer", token }, data: { type: "TODAY_07", now: now.toISOString(), language: "en" },
  });

  it("previews the developer's own organization, or the default one without a claim", async () => {
    const { database } = arrange({ jobs: { [defaultOrganizationId]: [job("2026-11-04")], "org-b": [job("2026-11-04"), job("2026-11-04")] } });

    expect((await previewManagerReminder(request())).reminder.jobCount).toBe(1);
    expect((await previewManagerReminder(request({ organizationId: "org-b" }))).reminder.jobCount).toBe(2);
    expect(database.reads).toEqual([`organizations/${defaultOrganizationId}/jobs`, "organizations/org-b/jobs"]);
  });

  it("refuses a malformed organization claim and a caller who is not a developer", async () => {
    const { database } = arrange({ jobs: twoOrganizations() });

    await expect(previewManagerReminder(request({ organizationId: "Org/B" }))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(previewManagerReminder({ ...request({ organizationId: "org-b" }), auth: { uid: "manager", token: { organizationId: "org-b" } } }))
      .rejects.toMatchObject({ code: "permission-denied" });
    expect(database.reads).toEqual([]);
  });
});
