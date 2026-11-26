import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  checklistCapabilityState,
  issueChecklistCapabilityForManager,
  loadPublicChecklistCapability,
  projectChecklistCapabilityForManager,
  savePublicChecklistDraft,
} from "./checklistCapabilityService.js";
import { buildChecklistRunSnapshot } from "./checklistRunDefinition.js";

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
  function setup() {
    const reissueNow = new Date("2030-09-20T12:00:00Z");
    const organizationId = "org-a";
    const jobId = "job-a";
    const runId = "initial";
    const jobPath = `organizations/${organizationId}/jobs/${jobId}`;
    const runPath = `${jobPath}/checklistRuns/${runId}`;
    const capabilityPath = `${runPath}/checklistCapabilities/active`;
    const draftPath = `${runPath}/drafts/current`;
    const propertyPath = `organizations/${organizationId}/properties/property-a`;
    const job = {
      operationalStatus: "ASSIGNED", assignedCleanerId: "cleaner-a", checklistContextRevision: 3,
      organizationId, propertyId: "property-a",
    };
    const property = { id: "property-a", name: "Sample property", organizationId };
    const savedRun = {
      ...buildChecklistRunSnapshot({ job, property }),
      status: "DRAFT", jobId, organizationId, createdByUid: "manager-a", evidencePolicy: { version: 2 },
    };
    const currentProperty = {
      ...property,
      checklistSettings: {
        additionalChecklistItems: [{ id: "custom-check-latch", sectionId: "kitchen", label: "Check latch" }],
      },
    };
    const records = new Map([
      [jobPath, job],
      [runPath, savedRun],
      [propertyPath, currentProperty],
      [capabilityPath, {
        status: "ACTIVE", cleanerId: "cleaner-a", contextRevision: 1,
        tokenHash: "old-hash", expiresAt: Timestamp.fromMillis(reissueNow.getTime() + 60_000),
      }],
    ]);
    const snapshot = (path) => ({
      id: path.split("/").at(-1),
      exists: records.has(path),
      data: () => records.get(path),
    });
    const reference = (path) => ({
      path,
      get: async () => snapshot(path),
      collection: (name) => ({ doc: (id) => reference(`${path}/${name}/${id}`) }),
    });
    const update = vi.fn();
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
          get: async (ref) => {
            expect(writes).toHaveLength(0);
            return snapshot(ref.path);
          },
          set: (ref, data) => writes.push({ path: ref.path, data }),
          create: (ref, data) => writes.push({ path: ref.path, data }),
          update: (ref, data) => {
            update(ref.path, data);
            writes.push({ path: ref.path, data: { ...records.get(ref.path), ...data } });
          },
        });
        for (const write of writes) records.set(write.path, write.data);
        return result;
      },
    };

    const issue = (tokenHash = "new-hash", org = organizationId) => issueChecklistCapabilityForManager(database, {
      organizationId: org, jobId, runId, cleanerId: "cleaner-a", actorUid: "manager-a",
      token: "new-token", tokenHash, now: reissueNow,
    });
    const open = (tokenHash) => loadPublicChecklistCapability(database, { organizationId, tokenHash, now: reissueNow });
    const save = (tokenHash, request) => savePublicChecklistDraft(database, {
      organizationId, tokenHash, request, now: reissueNow,
    });
    return { job, currentProperty, savedRun, records, jobPath, runPath, draftPath, propertyPath, capabilityPath, update, issue, open, save };
  }

  it("keeps the original items and legacy inventory definition on first issuance", async () => {
    const { savedRun, records, runPath, capabilityPath, update, issue, open } = setup();
    const legacyRun = {
      ...savedRun,
      definitionVersion: 1,
      resolvedDefinition: { ...savedRun.resolvedDefinition, definitionVersion: 1 },
    };
    records.set(runPath, legacyRun);
    records.delete(capabilityPath);

    const first = await issue();
    expect(first.capability.state).toBe("ACTIVE");
    expect(first.checklistRefresh).toBeNull();
    expect(records.get(runPath)).toBe(legacyRun);
    expect(update).not.toHaveBeenCalled();
    const result = await open("new-hash");
    expect(result.state).toBe("active");
    expect(result.draft.revision).toBe(0);
    expect(result.draft.checklistAnswers).not.toHaveProperty("custom-check-latch");
    expect(result.draft).not.toHaveProperty("inventoryQuantities");
  });

  it("keeps the existing DRAFT and saved answers while replacing a link after context revision advances", async () => {
    const { savedRun, records, runPath, draftPath, capabilityPath, update, issue, open } = setup();
    const savedDraft = { revision: 2, checklistAnswers: {}, inventoryAnswers: {}, generalNotes: "Saved answer" };
    records.set(draftPath, savedDraft);
    expect((await open("old-hash")).state).toBe("stale");

    const reissue = await issue();
    expect(reissue.capability.state).toBe("ACTIVE");
    expect(reissue.checklistRefresh).toBe("work-started");
    expect(records.get(capabilityPath)).toMatchObject({
      status: "ACTIVE", contextRevision: 3, cleanerId: "cleaner-a", tokenHash: "new-hash", rotation: 1,
    });
    expect(records.get(runPath)).toEqual(savedRun);
    expect(records.get(draftPath)).toEqual(savedDraft);
    expect(update).not.toHaveBeenCalled();

    const oldLinkAfter = await open("old-hash");
    const newLink = await open("new-hash");
    expect(oldLinkAfter.state).toBe("not-found");
    expect(newLink.state).toBe("active");
    expect(newLink.draft.generalNotes).toBe("Saved answer");
    expect(newLink.draft.revision).toBe(2);
  });

  it("uses the current property items on the new link and skips rewriting an identical snapshot on repeat", async () => {
    const { job, currentProperty, savedRun, records, jobPath, runPath, capabilityPath, update, issue, open } = setup();
    const current = buildChecklistRunSnapshot({ job, property: currentProperty });

    expect((await issue()).checklistRefresh).toBe("refreshed");
    expect(update).toHaveBeenCalledExactlyOnceWith(runPath, current);
    expect(records.get(runPath)).toEqual({ ...savedRun, ...current });
    expect(records.get(jobPath)).toBe(job);
    expect((await open("old-hash")).state).toBe("not-found");
    const result = await open("new-hash");
    expect(result.state).toBe("active");
    expect(result.checklist.sections.flatMap((section) => section.items)).toContainEqual(
      expect.objectContaining({ id: "custom-check-latch", label: "Check latch" }),
    );

    expect((await issue("repeat-hash")).checklistRefresh).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    expect(records.get(capabilityPath)).toMatchObject({ tokenHash: "repeat-hash", rotation: 2 });
  });

  it.each(["missing Property", "missing Property ID"])("keeps issuing a link with a %s", async (reason) => {
    const { records, job, jobPath, propertyPath, runPath, savedRun, capabilityPath, update, issue } = setup();
    if (reason === "missing Property") records.delete(propertyPath);
    else records.set(jobPath, { ...job, propertyId: null });
    const reissue = await issue();
    expect(reissue.checklistRefresh).toBeNull();
    expect(reissue.capability.state).toBe("ACTIVE");
    expect(update).not.toHaveBeenCalled();
    expect(records.get(runPath)).toEqual(savedRun);
    expect(records.get(capabilityPath)).toMatchObject({ tokenHash: "new-hash" });
  });

  it("keeps an existing revision-zero draft on reissue", async () => {
    const { records, savedRun, runPath, draftPath, update, issue, open } = setup();
    const storedDraft = { revision: 0, checklistAnswers: { "bed-remake": "DONE" } };
    records.set(draftPath, storedDraft);

    expect((await issue()).checklistRefresh).toBe("work-started");
    expect(update).not.toHaveBeenCalled();
    expect(records.get(runPath)).toBe(savedRun);
    expect(records.get(draftPath)).toBe(storedDraft);
    expect((await open("new-hash")).draft).toMatchObject({
      revision: 0,
      checklistAnswers: { "bed-remake": "DONE" },
    });
  });

  it("keeps the draft revision and stored receipts after its answers are cleared", async () => {
    const { records, savedRun, runPath, draftPath, capabilityPath, update, issue, open, save } = setup();
    records.delete(capabilityPath);
    await issue("first-hash");
    const answer = { mutationId: "draft-answer-0001", baseRevision: 0, changes: { checklistAnswers: { "bed-remake": "DONE" } } };
    const clear = { mutationId: "draft-answer-0002", baseRevision: 1, changes: { checklistAnswers: { "bed-remake": "UNANSWERED" } } };
    await save("first-hash", answer);
    await save("first-hash", clear);
    await expect(save("first-hash", clear)).resolves.toMatchObject({ duplicate: true, revision: 2 });
    const answerReceiptPath = `${runPath}/draftMutations/${answer.mutationId}`;
    const clearReceiptPath = `${runPath}/draftMutations/${clear.mutationId}`;
    const storedDraft = records.get(draftPath);
    const answerReceipt = records.get(answerReceiptPath);
    const clearReceipt = records.get(clearReceiptPath);
    expect(answerReceipt.revision).toBe(1);
    expect(clearReceipt.revision).toBe(2);

    expect((await issue()).checklistRefresh).toBe("work-started");
    expect(update).not.toHaveBeenCalled();
    expect(records.get(runPath)).toBe(savedRun);
    expect(records.get(draftPath)).toBe(storedDraft);
    expect(records.get(answerReceiptPath)).toBe(answerReceipt);
    expect(records.get(clearReceiptPath)).toBe(clearReceipt);
    expect((await open("new-hash")).draft).toMatchObject({
      revision: 2,
      checklistAnswers: { "bed-remake": "UNANSWERED" },
    });
  });

  it("refreshes a retired template even when the Property settings match", async () => {
    const { job, currentProperty, savedRun, records, runPath, update, issue } = setup();
    const current = buildChecklistRunSnapshot({ job, property: currentProperty });
    records.set(runPath, {
      ...savedRun, ...current,
      resolvedDefinition: { ...current.resolvedDefinition, sections: [] },
    });

    expect((await issue()).checklistRefresh).toBe("refreshed");
    expect(update).toHaveBeenCalledExactlyOnceWith(runPath, current);
  });

  it("keeps the Run and existing evidence when photo work is present", async () => {
    const { savedRun, records, runPath, update, issue } = setup();
    const evidencePath = `${runPath}/evidenceState/current`;
    const evidence = { revision: 1, photos: [{ evidenceId: "photo-a" }] };
    records.set(evidencePath, evidence);

    expect((await issue()).checklistRefresh).toBe("work-started");
    expect(records.get(runPath)).toBe(savedRun);
    expect(records.get(evidencePath)).toBe(evidence);
    expect(update).not.toHaveBeenCalled();
  });

  it("denies another organization's Job and leaves the current link and Run intact", async () => {
    const { records, job, jobPath, capabilityPath, issue, update } = setup();
    const previous = records.get(capabilityPath);
    await expect(issue("foreign-hash", "org-b")).rejects.toMatchObject({ code: "not-found" });
    records.set(jobPath, { ...job, organizationId: "org-b" });
    await expect(issue()).rejects.toMatchObject({ code: "permission-denied" });
    expect(records.get(capabilityPath)).toBe(previous);
    expect(update).not.toHaveBeenCalled();
  });
});
