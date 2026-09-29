import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  checklistCapabilityState,
  issueChecklistCapabilityForManager,
  loadPublicChecklistCapability,
  projectChecklistCapabilityForManager,
} from "./checklistCapabilityService.js";

const now = new Date("2026-09-20T12:00:00Z");
const activeCapability = {
  status: "ACTIVE", cleanerId: "cleaner-a", contextRevision: 2,
  expiresAt: Timestamp.fromMillis(now.getTime() + 60_000),
};
const job = { operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-a"], checklistContextRevision: 2 };
const run = { status: "DRAFT" };

describe("Checklist capability state", () => {
  it("treats a matching eligible DRAFT context as active", () => {
    expect(checklistCapabilityState(activeCapability, job, run, now)).toBe("ACTIVE");
    expect(checklistCapabilityState(activeCapability, job, { status: "READY_FOR_REVIEW" }, now)).toBe("ACTIVE");
  });

  it("invalidates expiry, revision, archive, cleaner and Run state without revealing a token", () => {
    expect(checklistCapabilityState({ ...activeCapability, expiresAt: Timestamp.fromMillis(now.getTime()) }, job, run, now)).toBe("EXPIRED");
    expect(checklistCapabilityState(activeCapability, { ...job, checklistContextRevision: 3 }, run, now)).toBe("STALE");
    expect(checklistCapabilityState(activeCapability, { ...job, archivedAt: true }, run, now)).toBe("STALE");
    expect(checklistCapabilityState(activeCapability, { ...job, assignedCleanerIds: ["cleaner-b"] }, run, now)).toBe("STALE");
    expect(checklistCapabilityState(activeCapability, job, { status: "ABANDONED" }, now)).toBe("STALE");
    expect(checklistCapabilityState(activeCapability, job, { status: "SUBMITTED" }, now)).toBe("STALE");
  });

  it("keeps manager summaries free of the bearer hash and raw record context", () => {
    const summary = projectChecklistCapabilityForManager({ ...activeCapability, tokenHash: "secret", jobId: "job" }, job, run, now);
    expect(summary).toEqual(expect.objectContaining({ state: "ACTIVE", cleanerId: "cleaner-a" }));
    expect(JSON.stringify(summary)).not.toContain("secret");
    expect(JSON.stringify(summary)).not.toContain("job");
  });
});

describe("public checklist language projection", () => {
  it("reads only the capability-scoped Cleaner language and keeps profile contact fields private", async () => {
    const tokenHash = "safe-hash";
    const capabilityPath = "organizations/org-a/jobs/job-a/checklistRuns/initial/checklistCapabilities/active";
    const capability = {
      status: "ACTIVE",
      tokenHash,
      cleanerId: "cleaner-a",
      contextRevision: 0,
      expiresAt: Timestamp.fromMillis(now.getTime() + 60_000),
    };
    const job = {
      operationalStatus: "ASSIGNED",
      assignedCleanerId: "cleaner-a",
      assignedCleanerName: "Ana",
      checklistContextRevision: 0,
      propertyName: "Safe Property",
      scheduledDate: "2026-09-20",
    };
    const run = {
      status: "DRAFT",
      propertySnapshot: { propertyName: "Safe Property" },
      jobSnapshot: { scheduledDate: "2026-09-20" },
      resolvedDefinition: { sections: [], inventoryItems: [], requiredPhotoTypes: [] },
    };
    const cleaner = {
      preferredLanguage: "es",
      phone: "private phone",
      email: "private email",
      internalNotes: "private notes",
    };
    const dataByPath = new Map([
      [capabilityPath, capability],
      ["organizations/org-a/jobs/job-a", job],
      ["organizations/org-a/jobs/job-a/checklistRuns/initial", run],
      ["organizations/org-a/jobs/job-a/checklistRuns/initial/drafts/current", null],
      ["organizations/org-a/cleaners/cleaner-a", cleaner],
    ]);
    const reference = (path) => ({
      path,
      collection: (name) => ({
        doc: (id) => reference(`${path}/${name}/${id}`),
        where: () => ({ collectionPath: `${path}/${name}` }),
      }),
    });
    const database = {
      collectionGroup: () => ({
        where: () => ({
          limit: () => ({
            get: async () => ({ size: 1, docs: [{ ref: reference(capabilityPath) }] }),
          }),
        }),
      }),
      doc: reference,
      runTransaction: async (callback) => callback({
        get: async (ref) => {
          const data = dataByPath.get(ref.path);
          return { exists: data !== undefined && data !== null, data: () => data };
        },
      }),
    };

    const result = await loadPublicChecklistCapability(database, {
      organizationId: "org-a",
      tokenHash,
      now,
    });

    expect(result.checklist.preferredLanguage).toBe("es");
    expect(result.checklist.assignedCleanerName).toBe("Ana");
    expect(JSON.stringify(result.checklist)).not.toContain("private phone");
    expect(JSON.stringify(result.checklist)).not.toContain("private email");
    expect(JSON.stringify(result.checklist)).not.toContain("private notes");
  });
});

describe("stale checklist capability reissue", () => {
  it("keeps the existing DRAFT and saved answers while replacing a link after context revision advances", async () => {
    const reissueNow = new Date("2030-09-20T12:00:00Z");
    const organizationId = "org-a";
    const jobId = "job-a";
    const runId = "initial";
    const jobPath = `organizations/${organizationId}/jobs/${jobId}`;
    const runPath = `${jobPath}/checklistRuns/${runId}`;
    const capabilityPath = `${runPath}/checklistCapabilities/active`;
    const draftPath = `${runPath}/drafts/current`;
    const savedRun = {
      status: "DRAFT",
      resolvedDefinition: { sections: [], inventoryItems: [], requiredPhotoTypes: [] },
      propertySnapshot: { propertyName: "Fictional Property" },
    };
    const savedDraft = { revision: 2, checklistAnswers: {}, inventoryAnswers: {}, generalNotes: "Saved answer" };
    const records = new Map([
      [jobPath, {
        operationalStatus: "ASSIGNED",
        assignedCleanerId: "cleaner-a",
        assignedCleanerName: "Fictional Cleaner",
        checklistContextRevision: 3,
      }],
      [runPath, savedRun],
      [draftPath, savedDraft],
      [capabilityPath, {
        status: "ACTIVE", cleanerId: "cleaner-a", contextRevision: 1,
        tokenHash: "old-hash", expiresAt: Timestamp.fromMillis(reissueNow.getTime() + 60_000),
      }],
    ]);
    const snapshot = (path) => ({
      exists: records.has(path),
      data: () => records.get(path),
    });
    const reference = (path) => ({
      path,
      get: async () => snapshot(path),
      collection: (name) => ({ doc: (id) => reference(`${path}/${name}/${id}`) }),
    });
    const database = {
      doc: reference,
      collectionGroup: () => ({
        where: (_field, _operator, tokenHash) => ({
          limit: () => ({
            get: async () => {
              const docs = [...records.entries()]
                .filter(([path, data]) => path.endsWith("/checklistCapabilities/active") && data.tokenHash === tokenHash)
                .map(([path]) => ({ ref: reference(path) }));
              return { size: docs.length, docs };
            },
          }),
        }),
      }),
      runTransaction: async (callback) => {
        const writes = [];
        const result = await callback({
          get: async (ref) => snapshot(ref.path),
          set: (ref, data) => writes.push({ path: ref.path, data }),
        });
        for (const write of writes) records.set(write.path, write.data);
        return result;
      },
    };

    const oldLinkBefore = await loadPublicChecklistCapability(database, {
      organizationId, tokenHash: "old-hash", now: reissueNow,
    });
    expect(oldLinkBefore.state).toBe("stale");

    const reissue = await issueChecklistCapabilityForManager(database, {
      organizationId, jobId, runId, cleanerId: "cleaner-a", actorUid: "manager-a",
      token: "new-token", tokenHash: "new-hash", now: reissueNow,
    });
    expect(reissue.capability.state).toBe("ACTIVE");
    expect(records.get(capabilityPath)).toMatchObject({
      status: "ACTIVE", contextRevision: 3, cleanerId: "cleaner-a", tokenHash: "new-hash", rotation: 1,
    });
    expect(records.get(runPath)).toEqual(savedRun);
    expect(records.get(draftPath)).toEqual(savedDraft);

    const oldLinkAfter = await loadPublicChecklistCapability(database, {
      organizationId, tokenHash: "old-hash", now: reissueNow,
    });
    const newLink = await loadPublicChecklistCapability(database, {
      organizationId, tokenHash: "new-hash", now: reissueNow,
    });
    expect(oldLinkAfter.state).toBe("not-found");
    expect(newLink.state).toBe("active");
    expect(newLink.draft.generalNotes).toBe("Saved answer");
    expect(newLink.draft.revision).toBe(2);
  });
});
