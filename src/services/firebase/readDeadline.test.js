import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A server read that never answers must end as an ordinary rejection after the
// read deadline, so the screen's existing error state (and its retry) appears
// instead of a loading state that never ends.
const lite = vi.hoisted(() => {
  const never = () => new Promise(() => {});
  return { getDocs: vi.fn(never), getDoc: vi.fn(never) };
});

vi.mock("firebase/firestore");
vi.mock("firebase/functions");
vi.mock("firebase/auth");
vi.mock("firebase/firestore/lite", () => ({
  getDocs: lite.getDocs,
  getDoc: lite.getDoc,
  getFirestore: () => ({}),
  setLogLevel: () => {},
  connectFirestoreEmulator: () => {},
  collection: (_database, ...path) => ({ path: path.join("/") }),
  doc: (_database, ...path) => ({ path: path.join("/") }),
  query: (target, ...constraints) => ({ target, constraints }),
  where: (...condition) => ({ where: condition }),
  orderBy: (...order) => ({ orderBy: order }),
  limit: (count) => ({ limit: count }),
  startAfter: (cursor) => ({ startAfter: cursor }),
  documentId: () => "__name__",
  Timestamp: { fromDate: (date) => date },
}));
vi.mock("./client.js", () => ({
  db: {}, functions: {}, firebaseApp: {}, useFirebaseEmulators: false, emulatorPorts: {},
}));

import { getJobOffers } from "../../features/jobs/jobOfferService.js";
import { getJobAssignments } from "../../features/jobs/assignmentService.js";
import { getJobIssues } from "../../features/issues/issueService.js";
import { getClientJobHistory, getCleanerJobHistory, getJobs, getPropertyJobHistory } from "../../features/jobs/jobService.js";
import { getActiveClients, getClientContact, getClients } from "../../features/clients/clientService.js";
import { getProperties, getPropertiesForClient } from "../../features/properties/propertyService.js";
import { getAllCleaners, getCleanerContactsById, getCleaners } from "../../features/cleaners/cleanerService.js";
import { getCleanerHubAccess } from "../../features/cleaners/cleanerHubAccessService.js";
import { getRecentPayouts, getUnpaidCompletedJobs } from "../../features/payouts/payoutService.js";
import { getManagerOperationEvents, getManagerPageLoadEvents } from "../../features/telemetry/managerPageLoadDiagnosticsService.js";
import { withReadDeadline } from "./serverReads.js";

const reads = [
  ["Job Detail offers", () => getJobOffers("job-1")],
  ["Job Detail assignments", () => getJobAssignments("job-1")],
  ["Job Detail issues", () => getJobIssues("job-1")],
  ["Jobs list", () => getJobs()],
  ["property Job history", () => getPropertyJobHistory("property-1")],
  ["cleaner Job history", () => getCleanerJobHistory("cleaner-1")],
  ["client Job history", () => getClientJobHistory("client-1", ["property-1"])],
  ["clients list", () => getClients()],
  ["active clients of the property form", () => getActiveClients()],
  ["client contact of the report controls", () => getClientContact("client-1")],
  ["properties list", () => getProperties()],
  ["properties of a client", () => getPropertiesForClient("client-1")],
  ["cleaners list", () => getAllCleaners()],
  ["active cleaners of Job Detail", () => getCleaners()],
  ["cleaner contacts of Job Detail", () => getCleanerContactsById(["cleaner-1"])],
  ["cleaner app access", () => getCleanerHubAccess("cleaner-1")],
  ["unpaid completed Jobs", () => getUnpaidCompletedJobs()],
  ["recent payouts", () => getRecentPayouts()],
  ["page load diagnostics", () => getManagerPageLoadEvents()],
  ["operation diagnostics", () => getManagerOperationEvents()],
];

describe("manager screen reads have a deadline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each(reads)("%s: a read that never answers is rejected at the deadline", async (_screen, read) => {
    const outcome = read().then(() => "answered", (error) => error.code);

    await vi.advanceTimersByTimeAsync(14_999);
    await expect(Promise.race([outcome, Promise.resolve("still waiting")])).resolves.toBe("still waiting");

    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toBe("deadline-exceeded");
    expect(lite.getDocs.mock.calls.length + lite.getDoc.mock.calls.length).toBeGreaterThan(0);
  });

  it("a read that answers in time is returned unchanged and leaves no timer behind", async () => {
    await expect(withReadDeadline(Promise.resolve("records"))).resolves.toBe("records");
    expect(vi.getTimerCount()).toBe(0);
  });
});
