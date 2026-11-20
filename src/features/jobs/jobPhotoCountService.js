import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { currentOrganizationId } from "../../services/organization/currentOrganization.js";
import { functions } from "../../services/firebase/client.js";

const getJobPhotoCountsCall = httpsCallable(functions, "getJobPhotoCounts");
const batchSize = 100;
// Completed services keep their photos; their counts are reused for the session.
let completedCounts = new Map();

export function photoCountCandidates(jobs) {
  return jobs.filter((job) => ["IN_PROGRESS", "COMPLETED"].includes(job.operationalStatus));
}

export async function fetchJobPhotoCounts(jobIds) {
  const session = completedCounts;
  const organizationId = currentOrganizationId();
  const counts = {};
  for (let offset = 0; offset < jobIds.length; offset += batchSize) {
    const result = await getJobPhotoCountsCall({ jobIds: jobIds.slice(offset, offset + batchSize) });
    if (session !== completedCounts || organizationId !== currentOrganizationId()) return {};
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
  const organizationId = currentOrganizationId();
  const session = completedCounts;
  const [snapshot, setSnapshot] = useState({ session, organizationId, counts: {}, isLoading: false });

  useEffect(() => {
    let current = true;
    const cacheKey = id => `${organizationId}/${id}`;
    const cached = {};
    const missing = [];
    for (const job of candidates) {
      if (job.operationalStatus === "COMPLETED" && session.has(cacheKey(job.id))) cached[job.id] = session.get(cacheKey(job.id));
      else missing.push(job);
    }
    function publish(counts, isLoading) {
      setSnapshot(previous => ({
        session, organizationId,
        counts: { ...(previous.session === session && previous.organizationId === organizationId ? previous.counts : {}), ...counts },
        isLoading,
      }));
    }
    publish(cached, missing.length > 0);
    if (!missing.length) return undefined;
    const stillCurrent = () => current && session === completedCounts && organizationId === currentOrganizationId();
    load(missing.map((job) => job.id)).then((result) => {
      if (!stillCurrent()) return;
      const next = {};
      for (const job of missing) {
        const count = Number.isInteger(result?.[job.id]?.photoCount) ? result[job.id].photoCount : 0;
        next[job.id] = count;
        if (job.operationalStatus === "COMPLETED") session.set(cacheKey(job.id), count);
      }
      publish(next, false);
    }).catch(() => {
      if (stillCurrent()) publish({}, false);
    });
    return () => { current = false; };
  }, [key, organizationId, session]); // eslint-disable-line react-hooks/exhaustive-deps

  return snapshot.session === session && snapshot.organizationId === organizationId
    ? { counts: snapshot.counts, isLoading: snapshot.isLoading }
    : { counts: {}, isLoading: true };
}

export function clearJobPhotoCountCache() {
  // Retire pending reads as well as stored counts when the account changes.
  completedCounts = new Map();
}
