import { describe, expect, it } from "vitest";
import {
  acknowledgePublicOfferAssignment,
  assignmentAcknowledgmentState,
  loadPublicOfferAssignmentAcknowledgment,
} from "./publicOfferAssignmentAcknowledgment.js";

const organizationId = "cleanflow-demo";
const jobPath = `organizations/${organizationId}/jobs/job-a`;
const offerPath = `${jobPath}/offers/offer-a`;
const assignmentPath = `${jobPath}/assignments/assignment-a`;
const now = new Date("2026-09-27T12:00:00.000Z");
const tokenHash = "current-token-hash";

function fakeDatabase(initial = {}) {
  const records = new Map(Object.entries(initial));
  let updateCount = 0;

  function makeReference(path) {
    const parts = path.split("/");
    return {
      path,
      id: parts.at(-1),
      collection(name) {
        return makeReference(`${path}/${name}`);
      },
      doc(id) {
        return makeReference(`${path}/${id}`);
      },
      async get() {
        const prefix = `${path}/`;
        const docs = [...records.entries()]
          .filter(([recordPath]) => recordPath.startsWith(prefix)
            && !recordPath.slice(prefix.length).includes("/"))
          .map(([recordPath, data]) => ({
            id: recordPath.split("/").at(-1),
            ref: makeReference(recordPath),
            data: () => data,
          }));
        return { docs };
      },
    };
  }

  const database = {
    doc: makeReference,
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(reference) {
          if (records.has(reference.path)) {
            return { exists: true, data: () => records.get(reference.path) };
          }
          const prefix = `${reference.path}/`;
          const docs = [...records.entries()]
            .filter(([recordPath]) => recordPath.startsWith(prefix)
              && !recordPath.slice(prefix.length).includes("/"))
            .map(([recordPath, data]) => ({
              id: recordPath.split("/").at(-1),
              ref: makeReference(recordPath),
              data: () => data,
            }));
          return { exists: false, docs };
        },
        update(reference, patch) {
          writes.push({ reference, patch });
        },
        create(reference, patch) {
          if (records.has(reference.path)) throw new Error("Synthetic event already exists.");
          writes.push({ reference, patch });
        },
      };
      const result = await callback(transaction);
      for (const { reference, patch } of writes) {
        records.set(reference.path, { ...records.get(reference.path), ...patch });
        updateCount += 1;
      }
      return result;
    },
  };

  return { database, records, get updateCount() { return updateCount; } };
}

function validRecords(overrides = {}) {
  return {
    [jobPath]: {
      schemaVersion: 2,
      operationalStatus: "ASSIGNED",
      assignedCleanerIds: ["cleaner-a"],
      notes: "Manager-only note",
      clientPrice: 350,
      cleanerPayout: 200,
      ...overrides.job,
    },
    [offerPath]: {
      cleanerId: "cleaner-a",
      status: "INTERESTED",
      publicOfferTokenHash: tokenHash,
      publicOfferExpiresAt: { toMillis: () => now.getTime() + 60_000 },
      offeredCompensation: 125,
      ...overrides.offer,
    },
    [assignmentPath]: {
      organizationId,
      jobId: "job-a",
      cleanerId: "cleaner-a",
      sourceOfferId: "offer-a",
      isActive: true,
      executionStatus: "ASSIGNED",
      ...overrides.assignment,
    },
  };
}

function request(database, options = {}) {
  return acknowledgePublicOfferAssignment(database, {
    organizationId,
    jobReference: database.doc(jobPath),
    offerReference: database.doc(offerPath),
    tokenHash,
    now,
    ...options,
  });
}

describe("public cleaner assignment acknowledgment", () => {
  it("acknowledges only the active Assignment sourced from the current Offer", async () => {
    const { database, records } = fakeDatabase(validRecords());
    const originalJob = records.get(jobPath);
    const originalOffer = records.get(offerPath);

    await expect(request(database)).resolves.toEqual({ state: "confirmed", repeated: false });
    expect(records.get(assignmentPath)).toMatchObject({
      cleanerAcknowledgedOfferId: "offer-a",
      cleanerAcknowledgedAt: expect.anything(),
    });
    expect(records.get(jobPath)).toBe(originalJob);
    expect(records.get(offerPath)).toBe(originalOffer);
    expect(records.get(offerPath).status).toBe("INTERESTED");
  });

  it("is idempotent when the cleaner repeats the acknowledgment", async () => {
    const { database } = fakeDatabase(validRecords());
    await request(database);
    await expect(request(database)).resolves.toEqual({ state: "confirmed", repeated: true });
  });

  it("does not let another interested cleaner use their Offer link to confirm this Assignment", async () => {
    const otherOfferPath = `${jobPath}/offers/offer-b`;
    const otherOffer = {
      cleanerId: "cleaner-b",
      status: "INTERESTED",
      publicOfferTokenHash: "cleaner-b-token-hash",
      publicOfferExpiresAt: { toMillis: () => now.getTime() + 60_000 },
    };
    const { database, records, updateCount } = fakeDatabase({
      ...validRecords(),
      [otherOfferPath]: otherOffer,
    });

    const result = await acknowledgePublicOfferAssignment(database, {
      organizationId,
      jobReference: database.doc(jobPath),
      offerReference: database.doc(otherOfferPath),
      tokenHash: "cleaner-b-token-hash",
      now,
    });
    expect(result).toEqual({ state: "unavailable" });
    expect(records.get(assignmentPath)).not.toHaveProperty("cleanerAcknowledgedAt");
    expect(updateCount).toBe(0);
  });

  it.each([
    ["unassigned interested Offer", { job: { operationalStatus: "OFFERED", assignedCleanerIds: [] } }, "unavailable"],
    ["archived Job", { job: { archivedAt: { toDate: () => now } } }, "unavailable"],
    ["wrong organization Assignment", { assignment: { organizationId: "other-org" } }, "unavailable"],
    ["removed Assignment", { assignment: { isActive: false } }, "unavailable"],
    ["replacement Assignment from a different Offer", {
      assignment: { sourceOfferId: "offer-b" },
    }, "unavailable"],
    ["old acknowledgment attached to a different Offer", {
      assignment: {
        cleanerAcknowledgedAt: { seconds: 1 },
        cleanerAcknowledgedOfferId: "offer-b",
      },
    }, "unavailable"],
    ["stale Offer status", { offer: { status: "DECLINED" } }, "unavailable"],
    ["expired capability", { offer: { publicOfferExpiresAt: { toMillis: () => now.getTime() } } }, "expired"],
    ["replaced capability", { offer: { publicOfferTokenHash: "old-token-hash" } }, "not-found"],
    ["legacy Job", { job: { schemaVersion: 1 } }, "unavailable"],
  ])("denies %s without mutation", async (_name, overrides, state) => {
    const { database, records, updateCount } = fakeDatabase(validRecords(overrides));
    const beforeAssignment = { ...records.get(assignmentPath) };

    await expect(request(database)).resolves.toMatchObject({ state });
    expect(records.get(assignmentPath)).toEqual(beforeAssignment);
    expect(updateCount).toBe(0);
  });

  it("fails closed for a reference from a different organization", async () => {
    const { database, updateCount } = fakeDatabase(validRecords());
    const result = await request(database, {
      jobReference: database.doc("organizations/other-org/jobs/job-a"),
    });
    expect(result).toEqual({ state: "unavailable" });
    expect(updateCount).toBe(0);
  });

  it("projects only a coarse acknowledgment state for the matching cleaner and Offer", async () => {
    const pending = fakeDatabase(validRecords());
    await expect(loadPublicOfferAssignmentAcknowledgment(pending.database, {
      organizationId,
      jobId: "job-a",
      job: pending.records.get(jobPath),
      offerId: "offer-a",
      offer: pending.records.get(offerPath),
      tokenHash,
      now,
    })).resolves.toBe("AWAITING_CONFIRMATION");

    await request(pending.database);
    await expect(loadPublicOfferAssignmentAcknowledgment(pending.database, {
      organizationId,
      jobId: "job-a",
      job: pending.records.get(jobPath),
      offerId: "offer-a",
      offer: pending.records.get(offerPath),
      tokenHash,
      now,
    })).resolves.toBe("CONFIRMED");
  });

  it("does not expose or acknowledge an archived Job's Assignment and leaves every record unchanged", async () => {
    const fixture = fakeDatabase(validRecords({ job: { archivedAt: now } }));
    const before = [...fixture.records.entries()];

    await expect(loadPublicOfferAssignmentAcknowledgment(fixture.database, {
      organizationId,
      jobId: "job-a",
      job: fixture.records.get(jobPath),
      offerId: "offer-a",
      offer: fixture.records.get(offerPath),
      tokenHash,
      now,
    })).resolves.toBeNull();
    await expect(request(fixture.database)).resolves.toEqual({ state: "unavailable" });

    expect([...fixture.records.entries()]).toEqual(before);
    expect(fixture.updateCount).toBe(0);
  });

  it("does not transfer an old acknowledgment to a new source Offer", () => {
    expect(assignmentAcknowledgmentState({
      sourceOfferId: "replacement-offer",
      cleanerAcknowledgedOfferId: "original-offer",
      cleanerAcknowledgedAt: now,
    })).toBeNull();
  });
});
