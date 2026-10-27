import { describe, expect, it } from "vitest";
import { buildDemoState } from "../model/demoData.js";
import { domainReducer } from "../model/store.js";
import { GALLERY, LIMITS, quotaOf, rejectReason, submissionSteps } from "./PhotoBatch.jsx";

const data = buildDemoState("2026-10-20");
const job = id => data.jobs.find(j => j.id === id);

describe("batch photo upload", () => {
  it("keeps the current Production limits as the default", () => {
    expect(LIMITS.current).toEqual({ photos: 20, totalMb: 50 });
    expect(LIMITS.perImageMb).toBe(5);
  });

  it("rejects HEIC and images over 5 MB in the picker", () => {
    expect(GALLERY.filter(rejectReason).map(g => rejectReason(g)).sort()).toEqual(["heic", "heic", "tooBig"]);
  });

  it("counts every draft photo, whatever its status, against the limit", () => {
    const photos = [{ n: 1, mb: 3, status: "saved" }, { n: 2, mb: 4, status: "queued" }, { n: 3, mb: 2, status: "failed" }];
    expect(quotaOf(photos, false)).toMatchObject({ used: 3, mb: 9, leftPhotos: 17, leftMb: 41 });
    expect(quotaOf(photos, true).leftPhotos).toBe(47);
  });

  it("retry re-queues only failed photos and removing frees the slot", () => {
    const photos = [
      { id: "a", itemId: "i1", status: "saved", n: 1 }, { id: "b", itemId: "i1", status: "failed", n: 2, willFail: true }, { id: "c", itemId: "i2", status: "saved", n: 3 },
    ];
    let d = domainReducer(data, { type: "CL_PHOTOS_ADD", jobId: "j07", photos });
    d = domainReducer(d, { type: "CL_RETRY_FAILED", jobId: "j07" });
    const after = d.jobs.find(j => j.id === "j07").checklist.photos;
    expect(after.find(p => p.id === "b")).toMatchObject({ status: "queued", willFail: false });
    expect(after.find(p => p.id === "a").status).toBe("saved");
    d = domainReducer(d, { type: "CL_PHOTO_REMOVE", jobId: "j07", photoId: "c" });
    expect(d.jobs.find(j => j.id === "j07").checklist.photos.some(p => p.id === "c")).toBe(false);
    expect(d.jobs.find(j => j.id === "j07").checklist.items.i2).toBe(false);
  });

  it("keeps saved, submitted, physically done and formally completed apart", () => {
    const submitted = submissionSteps(job("j05"), 0);
    expect(submitted).toMatchObject({ submitted: "done", physicallyDone: "done", formallyDone: "todo", evidence: "done" });
    const draft = submissionSteps(job("j07"), 3);
    expect(draft).toMatchObject({ draftSaved: "done", evidence: "warn", submitted: "todo", formallyDone: "todo" });
    expect(submissionSteps(job("j04"), 0).formallyDone).toBe("done");
  });
});
