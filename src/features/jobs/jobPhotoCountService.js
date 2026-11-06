import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

const getJobPhotoCountsCall = httpsCallable(functions, "getJobPhotoCounts");
const batchSize = 100;
// Completed services keep their photos; their counts are reused for the session.
const completedCounts = new Map();

export function photoCountCandidates(jobs) {
  return jobs.filter((job) => ["IN_PROGRESS", "COMPLETED"].includes(job.operationalStatus));
}

export async function fetchJobPhotoCounts(jobIds) {
  const counts = {};
  for (let offset = 0; offset < jobIds.length; offset += batchSize) {
    const result = await getJobPhotoCountsCall({ jobIds: jobIds.slice(offset, offset + batchSize) });
    Object.assign(counts, result.data?.counts || {});
  }
  return counts;
}

/**
 * Photo counts for the services that can have photos (in progress or
 * completed). Returns { counts: {jobId: number}, isLoading }.
 */
export function useJobPhotoCounts(jobs, load = fetchJobPhotoCounts) {
  const candidates = useMemo(() => photoCountCandidates(jobs), [jobs]);
  const key = candidates.map((job) => `${job.id}:${job.operationalStatus}`).join("|");
  const [counts, setCounts] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let current = true;
    const cached = {};
    const missing = [];
    for (const job of candidates) {
      if (job.operationalStatus === "COMPLETED" && completedCounts.has(job.id)) cached[job.id] = completedCounts.get(job.id);
      else missing.push(job);
    }
    if (Object.keys(cached).length) setCounts((value) => ({ ...value, ...cached }));
    if (!missing.length) { setIsLoading(false); return undefined; }
    setIsLoading(true);
    load(missing.map((job) => job.id)).then((result) => {
      const next = {};
      for (const job of missing) {
        const count = Number.isInteger(result?.[job.id]?.photoCount) ? result[job.id].photoCount : 0;
        next[job.id] = count;
        if (job.operationalStatus === "COMPLETED") completedCounts.set(job.id, count);
      }
      if (current) setCounts((value) => ({ ...value, ...next }));
    }).catch(() => {}).finally(() => {
      if (current) setIsLoading(false);
    });
    return () => { current = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { counts, isLoading };
}

export function clearJobPhotoCountCache() {
  completedCounts.clear();
}
