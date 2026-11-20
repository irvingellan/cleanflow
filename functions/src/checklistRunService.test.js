import { describe, expect, it } from "vitest";
import { buildChecklistRunSnapshot } from "./checklistRunDefinition.js";
import { checklistSnapshotNeedsRefresh, newChecklistRun } from "./checklistRunService.js";
import { checklistWorkStarted } from "./checklistWork.js";

const job = { serviceType: "STANDARD", scheduledDate: "2026-11-25", scheduledStart: "09:00" };
const property = { id: "property-a", name: "Sample property" };
const original = buildChecklistRunSnapshot({ job, property });

describe("current checklist source context", () => {
  it.each([
    ["service type", { ...job, serviceType: "POST_CONSTRUCTION" }, property],
    ["property", job, { ...property, id: "property-b" }],
    ["property name", job, { ...property, name: "Updated sample" }],
    ["property checklist settings", job, { ...property, checklistSettings: { inventoryItems: [{ id: "sample", label: "Sample item" }] } }],
  ])("identifies an outdated snapshot after a change in %s", (_field, currentJob, currentProperty) => {
    const current = buildChecklistRunSnapshot({ job: currentJob, property: currentProperty });
    expect(checklistSnapshotNeedsRefresh(original, current)).toBe(true);
  });

  it("keeps a historical definition when source inputs still match, including legacy defaults", () => {
    const legacy = {
      ...original, definitionVersion: 1, resolvedDefinition: { sections: [] },
      propertyChecklistSettingsSnapshot: {}, jobSnapshot: { ...original.jobSnapshot },
    };
    delete legacy.jobSnapshot.serviceType;
    const next = buildChecklistRunSnapshot({
      job: { ...job, scheduledStart: "11:00", checklistContextRevision: 3 }, property: { ...property, internalNotes: "ignored" },
    });
    expect(checklistSnapshotNeedsRefresh(legacy, next)).toBe(false);
  });

  it("gives both entry points the same definition and records the Hub creator", () => {
    const options = { organizationId: "sample-org", jobId: "job-a", actorUid: "manager" };
    const manager = newChecklistRun(original, options);
    const cleaner = newChecklistRun(original, { ...options, actorUid: "cleaner", createdBy: "CLEANER_HUB" });
    expect(manager).not.toHaveProperty("createdBy");
    expect(cleaner).toEqual({ ...manager, createdAt: expect.anything(), createdByUid: "cleaner", createdBy: "CLEANER_HUB" });
  });
});

describe("work that freezes a checklist", () => {
  const runRef = { collection: collection => ({ doc: id => collection + "/" + id }) };
  it.each([
    ["new draft", "DRAFT", {}, false],
    ["saved answer", "DRAFT", { "drafts/current": { revision: 1 } }, true],
    ["evidence revision", "DRAFT", { "evidenceState/current": { revision: 1 } }, true],
    ["saved photo", "DRAFT", { "evidenceState/current": { photos: [{}] } }, true],
    ["legacy photo", "DRAFT", { "evidence/living-belongings": {} }, true],
    ["submitted", "READY_FOR_REVIEW", {}, true],
    ["abandoned", "ABANDONED", {}, true],
  ])("recognizes %s", async (_description, status, docs, started) => {
    const transaction = { get: async path => ({ exists: Object.hasOwn(docs, path), data: () => docs[path] }) };
    expect(await checklistWorkStarted(transaction, runRef, { status })).toBe(started);
  });
});
