import { useRef, useState } from "react";

const empty = { byJob: new Map(), feedback: null };

/** A verified answer belongs to one cleaner session, Job and schedule revision. */
export function useAgendaReschedules({ service, sessionVersion, entries }) {
  const [responses, setResponses] = useState(empty);
  const inFlight = useRef(new Map());
  function reset() {
    inFlight.current.clear();
    setResponses(empty);
  }
  async function submit({ jobId, revision, propertyName }, operation) {
    if (!Number.isSafeInteger(revision) || inFlight.current.get(jobId) === revision) return { state: "superseded" };
    const version = sessionVersion.current;
    inFlight.current.set(jobId, revision);
    function update(state, announce) {
      if (version !== sessionVersion.current || inFlight.current.get(jobId) !== revision) return false;
      const reply = { jobId, revision, state, propertyName };
      setResponses(previous => ({ byJob: new Map(previous.byJob).set(jobId, reply), feedback: announce ? reply : null }));
      return true;
    }
    update("sending", false);
    try {
      const result = await operation();
      if (result?.state === "superseded") return result;
      if (result?.scheduleRevision !== revision || !["CONFIRMED", "DECLINED"].includes(result.state)) throw new Error("Missing schedule decision.");
      update(result.state, true);
      return result;
    } catch (error) {
      const stale = error?.details?.reason === "stale-schedule";
      if (update(stale ? "stale" : "error", true) && stale) service.reconnectAgenda?.().catch(() => undefined);
      throw error;
    } finally {
      if (version === sessionVersion.current && inFlight.current.get(jobId) === revision) inFlight.current.delete(jobId);
    }
  }
  function answer(entry, decision) {
    if (entry.reschedule?.state !== "PENDING") return;
    const revision = entry.reschedule.scheduleRevision;
    void submit({ jobId: entry.jobId, revision, propertyName: entry.propertyName },
      () => service.respondToAgendaReschedule(entry.jobId, { decision, scheduleRevision: revision })).catch(() => undefined);
  }
  function apply(entries) {
    if (!responses.byJob.size) return entries;
    return entries.flatMap(entry => {
      const reply = responses.byJob.get(entry.jobId);
      if (!reply || entry.kind !== "ASSIGNED" || entry.scheduleRevision !== reply.revision) return [entry];
      // A declined legacy projection may still lack its own confirmation when the Inbox answers.
      if (reply.state === "DECLINED" && !Object.hasOwn(entry, "reschedule")) return [];
      if (entry.reschedule?.state !== "PENDING" || entry.reschedule.scheduleRevision !== reply.revision) return [entry];
      if (reply.state === "DECLINED") return [];
      if (reply.state === "CONFIRMED") return [{ ...entry, reschedule: { ...entry.reschedule, state: reply.state } }];
      return [{ ...entry, rescheduleBusy: reply.state === "sending" || reply.state === "stale" }];
    });
  }
  const reply = responses.feedback;
  const current = reply && entries.find(entry => entry.kind === "ASSIGNED" && entry.jobId === reply.jobId);
  // A late result cannot describe a different change, even with the same Job id.
  const superseded = current && current.scheduleRevision !== reply.revision && reply.state !== "stale";
  const feedback = superseded || (!current && reply?.state === "CONFIRMED") ? null : reply;
  return { apply, answer, reset, feedback, byJob: responses.byJob, submit };
}
