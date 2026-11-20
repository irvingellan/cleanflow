import { useEffect, useRef, useState } from "react";

/** Scope this hook to one authorized cleaner. Only server-confirmed changes enter the list. */
export function useAvailability(service) {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const active = useRef(null);

  useEffect(() => {
    const request = { busy: false };
    active.current = request;
    setData(null);
    setBusy(false);
    setError(null);
    async function load() {
      try {
        const result = await service.list();
        if (!Array.isArray(result?.blocks)) throw new Error("Missing availability list.");
        if (active.current === request) setData({ service, blocks: result.blocks });
      } catch {
        if (active.current === request) setData({ service, blocks: null });
      }
    }
    void load();
    return () => { active.current = null; };
  }, [service, attempt]);

  async function change(fields, remove = false) {
    const request = active.current;
    if (!request || request.busy || !data?.blocks || data.service !== service) return false;
    request.busy = true;
    setBusy(true);
    setError(null);
    try {
      const result = await (remove ? service.remove(fields) : service.set(fields));
      if (active.current !== request) return false;
      if (remove ? typeof result?.removed !== "boolean" : !result?.block?.id) throw new Error("Missing availability result.");
      setData(previous => {
        const id = remove ? fields.blockId : result.block.id;
        const blocks = previous.blocks.filter(block => block.id !== id);
        return { service, blocks: remove ? blocks : [...blocks, result.block] };
      });
      return true;
    } catch (failure) {
      if (active.current === request) {
        const denied = ["functions/permission-denied", "functions/unauthenticated"].includes(failure?.code);
        if (denied) setData({ service, blocks: null });
        else setError(failure?.code === "functions/resource-exhausted" ? "capacity" : "actionError");
      }
      return false;
    } finally {
      if (active.current === request) { request.busy = false; setBusy(false); }
    }
  }
  return {
    status: !data || data.service !== service ? "loading" : data.blocks ? "ready" : "error",
    blocks: data?.service === service && data.blocks ? data.blocks : [], busy, error, change,
    retry: () => setAttempt(value => value + 1), clearError: () => setError(null),
  };
}
