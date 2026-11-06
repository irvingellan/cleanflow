// Read-only photo counts for the manager's services list, so she can find the
// services that have checklist photos without opening each one. Counts only;
// no photo, path or checklist content leaves the server.

export const maximumPhotoCountJobs = 100;
const initialRunId = "initial";
const aliasRequirementId = "living-belongings";

function validJobId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !value.includes("/");
}

/** Saved photos of one Run: the gallery for policy v2, the single required photo before it. */
export function photoCountFromRun(run, galleryState, alias) {
  if (!run) return 0;
  if (run.evidencePolicy?.version === 2) {
    return (Array.isArray(galleryState?.photos) ? galleryState.photos : [])
      .filter((photo) => photo && (photo.status === undefined || photo.status === "SAVED")).length;
  }
  return alias?.status === "SAVED" ? 1 : 0;
}

export function validPhotoCountRequest(jobIds) {
  return Array.isArray(jobIds) && jobIds.length > 0 && jobIds.length <= maximumPhotoCountJobs
    && jobIds.every(validJobId) && new Set(jobIds).size === jobIds.length;
}

export async function loadJobPhotoCounts(database, { organizationId, jobIds }) {
  const runs = jobIds.map((jobId) => database.doc(`organizations/${organizationId}/jobs/${jobId}/checklistRuns/${initialRunId}`));
  const runSnapshots = await database.getAll(...runs);
  const follow = [];
  runSnapshots.forEach((snapshot, index) => {
    if (!snapshot.exists) return;
    const run = snapshot.data();
    const ref = run.evidencePolicy?.version === 2
      ? runs[index].collection("evidenceState").doc("current")
      : runs[index].collection("evidence").doc(aliasRequirementId);
    follow.push({ index, run, ref });
  });
  const details = follow.length ? await database.getAll(...follow.map((entry) => entry.ref)) : [];
  const counts = {};
  follow.forEach((entry, position) => {
    const data = details[position]?.exists ? details[position].data() : null;
    const count = entry.run.evidencePolicy?.version === 2
      ? photoCountFromRun(entry.run, data, null)
      : photoCountFromRun(entry.run, null, data);
    counts[jobIds[entry.index]] = { photoCount: count, checklistStatus: typeof entry.run.status === "string" ? entry.run.status : null };
  });
  return { counts };
}
