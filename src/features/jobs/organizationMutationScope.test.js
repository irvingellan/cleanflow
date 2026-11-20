import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetCurrentOrganizationId, setCurrentOrganizationId } from "../../services/organization/currentOrganization.js";
import { assignCleanerDirectly, assignInterestedCleaner, removeAssignment, replaceAssignment } from "./assignmentService.js";
import { createJobOffers, createPublicOfferLink } from "./jobOfferService.js";

const mock = vi.hoisted(() => ({
  getDoc: vi.fn(), runTransaction: vi.fn(), call: vi.fn(), set: vi.fn(), update: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  collection: (_, ...parts) => parts.join("/"),
  doc: (parent, ...parts) => parts.length ? parts.join("/") : parent + "/new-assignment",
  getDoc: mock.getDoc, runTransaction: mock.runTransaction, serverTimestamp: () => "time",
}));
vi.mock("firebase/functions", () => ({ httpsCallable: (_, name) => data => mock.call(name, data) }));
vi.mock("../../services/firebase/client.js", () => ({ db: {}, functions: {} }));

const root = "organizations/first-company/jobs/service";
const snapshot = (data, id = "service") => ({ id, exists: () => true, data: () => data });
const job = { schemaVersion: 2, operationalStatus: "OFFERED", assignedCleanerIds: [] };

beforeEach(() => {
  vi.resetAllMocks();
  setCurrentOrganizationId("first-company");
  mock.getDoc.mockResolvedValue(snapshot(job));
});
afterEach(() => { resetCurrentOrganizationId(); vi.unstubAllGlobals(); });

function changeCompanyWhenReading(records) {
  mock.runTransaction.mockImplementation(async (_, callback) => callback({
    get: async reference => {
      await Promise.resolve();
      setCurrentOrganizationId("second-company");
      return snapshot(records[reference], reference.split("/").at(-1));
    },
    set: mock.set, update: mock.update,
  }));
}

it("creates manual invitations under the Job selected when the operation started", async () => {
  changeCompanyWhenReading({ [root]: job });
  await createJobOffers({ jobId: "service", cleaners: [{ id: "next", name: "Example" }] });
  expect(mock.set).toHaveBeenCalledWith(root + "/offers/next", expect.objectContaining({ cleanerId: "next" }));
  expect(mock.getDoc).toHaveBeenCalledWith(root);
});

it.each(["assign", "replace"])("keeps the assignment path and record in the same company for %s", async operation => {
  changeCompanyWhenReading({
    [root]: { ...job, assignedCleanerIds: operation === "replace" ? ["former"] : [] },
    [root + "/offers/next"]: { cleanerId: "next", status: "INTERESTED" },
    [root + "/assignments/old"]: { cleanerId: "former", isActive: true },
  });
  if (operation === "replace") await replaceAssignment("service", "old", "next", "manager");
  else await assignInterestedCleaner("service", "next");
  expect(mock.set).toHaveBeenCalledWith(root + "/assignments/new-assignment", expect.objectContaining({ organizationId: "first-company" }));
});

it("uses the original job reference after a direct assignment callable settles", async () => {
  mock.call.mockImplementation(async () => { setCurrentOrganizationId("second-company"); });
  await assignCleanerDirectly("service", "next");
  expect(mock.getDoc).toHaveBeenCalledWith(root);
});

it("does not call automatic removal under the newly selected company", async () => {
  mock.getDoc.mockImplementation(async () => {
    setCurrentOrganizationId("second-company");
    return snapshot({ ...job, offerDistributionMode: "FIRST_ACCEPT_WINS", automaticOfferBatch: { version: 2 } });
  });
  await expect(removeAssignment("service", "old", "manager")).rejects.toHaveProperty("code", "organization-changed");
  expect(mock.call).not.toHaveBeenCalled();
});

it("discards a pending public link when the active company changes during hashing", async () => {
  vi.stubGlobal("crypto", { getRandomValues: bytes => bytes.fill(7), subtle: { digest: async () => {
    setCurrentOrganizationId("second-company");
    return new Uint8Array(32).buffer;
  } } });
  await expect(createPublicOfferLink({ jobId: "service", cleanerId: "next", offeredCompensation: null }))
    .rejects.toHaveProperty("code", "organization-changed");
  expect(mock.runTransaction).not.toHaveBeenCalled();
});
