import { useEffect, useRef, useState } from "react";

const maximumBatch = 25;

function needsLookup(entry) {
  return entry.kind === "ASSIGNED" && entry.jobStatus === "ASSIGNED"
    && Number.isSafeInteger(entry.scheduleRevision) && entry.scheduleRevision > 0
    && !Object.hasOwn(entry, "reschedule");
}

/** Older projections lack the recipient's confirmation. Resolve once per active Job revision. */
export function useLegacyAgendaReschedules({ entries, scope, online, service, attempt }) {
  const cache = useRef(null);
  const [, refresh] = useState(0);
  const pairs = scope && service.loadAgendaReschedules ? entries.filter(needsLookup)
    .map(entry => [entry.jobId, entry.scheduleRevision]).sort(([a], [b]) => a.localeCompare(b)) : [];
  const signature = JSON.stringify(pairs);
  useEffect(() => () => { cache.current = null; }, []);
  useEffect(() => {
    if (!scope || signature === "[]") {
      cache.current = null;
      return undefined;
    }
    if (cache.current?.scope !== scope) cache.current = { scope, records: new Map() };
    const request = cache.current;
    const revisions = new Map(JSON.parse(signature));
    for (const [id, record] of request.records) {
      if (record.revision !== revisions.get(id)) request.records.delete(id);
    }
    if (!online) return undefined;

    const load = async batch => {
      const pending = new Map(batch.map(([jobId, revision]) => [jobId, { revision }]));
      pending.forEach((record, jobId) => request.records.set(jobId, record));
      try {
        const response = await service.loadAgendaReschedules(batch.map(([jobId, scheduleRevision]) => ({ jobId, scheduleRevision })));
        if (cache.current !== request) return;
        if (!Array.isArray(response?.confirmations)) throw new Error("Missing confirmation list.");
        const byJob = new Map(response.confirmations.map(item => [item.jobId, item]));
        for (const [jobId, record] of pending) {
          if (request.records.get(jobId) !== record) continue;
          const item = byJob.get(jobId);
          // An omitted entry is a verified absence, not a reason to poll again.
          record.reschedule = item?.scheduleRevision === record.revision && item.reschedule?.scheduleRevision === record.revision
            ? item.reschedule : null;
        }
        refresh(value => value + 1);
      } catch {
        // Leave the rest of the agenda usable. A later online/resume/retry can recover.
        for (const [id, record] of pending) if (request.records.get(id) === record) request.records.delete(id);
      }
    };
    const resume = () => {
      if (document.visibilityState === "hidden" || navigator.onLine === false) return;
      const missing = [...revisions].filter(([id]) => !request.records.has(id));
      for (let i = 0; i < missing.length; i += maximumBatch) void load(missing.slice(i, i + maximumBatch));
    };
    resume();
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [scope, online, service, attempt, signature]);

  if (!scope || cache.current?.scope !== scope || !pairs.length) return entries;
  return entries.map(entry => {
    const record = cache.current.records.get(entry.jobId);
    return needsLookup(entry) && record?.revision === entry.scheduleRevision && record.reschedule
      ? { ...entry, reschedule: record.reschedule } : entry;
  });
}
