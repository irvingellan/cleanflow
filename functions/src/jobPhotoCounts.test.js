import { describe, expect, it } from "vitest";
import { loadJobPhotoCounts, maximumPhotoCountJobs, photoCountFromRun, validPhotoCountRequest } from "./jobPhotoCounts.js";

function fakeDatabase(documents) {
  const ref = (path) => ({
    path,
    collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }),
  });
  return {
    doc: ref,
    getAll: async (...refs) => refs.map(({ path }) => ({ exists: Boolean(documents[path]), data: () => documents[path] })),
  };
}

describe("job photo counts", () => {
  it("counts gallery photos for new checklists and the single photo for older ones", () => {
    expect(photoCountFromRun({ evidencePolicy: { version: 2 } }, { photos: [{ status: "SAVED" }, { status: "SAVED" }, {}, { status: "PENDING" }] }, null)).toBe(3);
    expect(photoCountFromRun({}, null, { status: "SAVED" })).toBe(1);
    expect(photoCountFromRun({}, null, null)).toBe(0);
    expect(photoCountFromRun(null, null, null)).toBe(0);
  });

  it("returns counts only, for the requested Jobs that have a checklist", async () => {
    const base = "organizations/org/jobs";
    const database = fakeDatabase({
      [`${base}/a/checklistRuns/initial`]: { status: "READY_FOR_REVIEW", evidencePolicy: { version: 2 }, resolvedDefinition: { secret: "x" } },
      [`${base}/a/checklistRuns/initial/evidenceState/current`]: { photos: [{ status: "SAVED", storagePath: "private/path" }, { status: "SAVED" }] },
      [`${base}/b/checklistRuns/initial`]: { status: "DRAFT" },
      [`${base}/b/checklistRuns/initial/evidence/living-belongings`]: { status: "SAVED" },
    });
    const result = await loadJobPhotoCounts(database, { organizationId: "org", jobIds: ["a", "b", "c"] });
    expect(result).toEqual({ counts: {
      a: { photoCount: 2, checklistStatus: "READY_FOR_REVIEW" },
      b: { photoCount: 1, checklistStatus: "DRAFT" },
    } });
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("accepts only a bounded list of distinct Job ids", () => {
    expect(validPhotoCountRequest(["a", "b"])).toBe(true);
    expect(validPhotoCountRequest([])).toBe(false);
    expect(validPhotoCountRequest(["a", "a"])).toBe(false);
    expect(validPhotoCountRequest(["a/b"])).toBe(false);
    expect(validPhotoCountRequest(Array.from({ length: maximumPhotoCountJobs + 1 }, (_, i) => `j${i}`))).toBe(false);
    expect(validPhotoCountRequest("a")).toBe(false);
  });
});
