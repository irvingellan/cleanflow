import { useCallback, useEffect, useRef, useState } from "react";
import { SCENARIOS, scenarioById } from "../scenarios/registry.ts";
import { applyRecorded, createSession, fingerprint, isTerminal, manual, replay as replayAll, run as runAll, step as stepOnce, type Op, type Session } from "../engine/session.ts";
import type { Command } from "../engine/types.ts";

export type Speed = "slow" | "normal" | "fast" | "instant";
export const SPEED_MS: Record<Speed, number> = { slow: 1400, normal: 650, fast: 220, instant: 0 };

export interface LinkState {
  scenarioId: string;
  seed: number;
  steps: number;
}

/** Internal link: scenario, seed and number of automatic steps. No data. */
export function encodeLink(s: Session): string {
  const steps = s.ops.filter((op) => op.kind !== "manual").length;
  return `#s=${encodeURIComponent(s.scenario.id)}&seed=${s.seed}&n=${steps}`;
}

export function decodeLink(hash: string): LinkState | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const id = params.get("s");
  if (!id || !SCENARIOS.some((sc) => sc.id === id)) return null;
  const seed = Number(params.get("seed") ?? 4242);
  const steps = Number(params.get("n") ?? 0);
  return { scenarioId: id, seed: Number.isFinite(seed) ? seed : 4242, steps: Number.isFinite(steps) ? Math.max(0, Math.min(steps, 500)) : 0 };
}

export function sessionFromLink(link: LinkState): Session {
  let s = createSession(scenarioById(link.scenarioId), link.seed);
  for (let i = 0; i < link.steps && !isTerminal(s); i += 1) s = stepOnce(s);
  return s;
}

export function useLab(initial: Session) {
  const [session, setSession] = useState<Session>(initial);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [replayQueue, setReplayQueue] = useState<{ ops: Op[]; target: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastReplay, setLastReplay] = useState<{ match: boolean; print: string; at: number } | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const flash = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  }, []);

  // Autoplay: one transition per tick until terminal.
  useEffect(() => {
    if (!playing) return;
    if (replayQueue) {
      if (!replayQueue.ops.length) {
        const print = fingerprint(session.world);
        setLastReplay({ match: print === replayQueue.target, print, at: Date.now() });
        setPlaying(false);
        setReplayQueue(null);
        return;
      }
      const id = window.setTimeout(() => {
        const [op, ...rest] = replayQueue.ops;
        setSession((s) => applyRecorded(s, op!));
        setReplayQueue({ ...replayQueue, ops: rest });
      }, SPEED_MS[speed] || 1);
      return () => window.clearTimeout(id);
    }
    if (isTerminal(session)) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setSession((s) => stepOnce(s)), SPEED_MS[speed] || 1);
    return () => window.clearTimeout(id);
  }, [playing, session, speed, replayQueue]);

  const selectScenario = useCallback((id: string, seed?: number) => {
    setPlaying(false);
    setReplayQueue(null);
    setSession((s) => createSession(scenarioById(id), seed ?? s.seed));
  }, []);

  const run = useCallback(() => {
    if (speed === "instant") {
      setPlaying(false);
      setSession((s) => runAll(s));
      return;
    }
    setPlaying(true);
  }, [speed]);

  const step = useCallback(() => {
    setPlaying(false);
    setReplayQueue(null);
    setSession((s) => stepOnce(s));
  }, []);

  const pause = useCallback(() => setPlaying(false), []);

  const reset = useCallback((seed?: number) => {
    setPlaying(false);
    setReplayQueue(null);
    setSession((s) => createSession(s.scenario, seed ?? s.seed));
  }, []);

  /** Restore the initial state and reproduce exactly the recorded operations. */
  const replay = useCallback(() => {
    setSession((s) => {
      const target = fingerprint(s.world);
      if (speed === "instant") {
        const again = replayAll(s);
        const print = fingerprint(again.world);
        setLastReplay({ match: print === target, print, at: Date.now() });
        setPlaying(false);
        setReplayQueue(null);
        return again;
      }
      setReplayQueue({ ops: [...s.ops], target });
      setPlaying(true);
      return createSession(s.scenario, s.seed);
    });
  }, [speed]);

  const apply = useCallback((command: Command) => {
    setPlaying(false);
    setReplayQueue(null);
    setSession((s) => manual(s, command));
  }, []);

  const load = useCallback((s: Session) => {
    setPlaying(false);
    setReplayQueue(null);
    setSession(s);
  }, []);

  const next = useCallback(() => {
    const idx = SCENARIOS.findIndex((sc) => sc.id === session.scenario.id);
    selectScenario(SCENARIOS[(idx + 1) % SCENARIOS.length]!.id);
  }, [session.scenario.id, selectScenario]);

  return {
    session,
    playing,
    speed,
    setSpeed,
    replaying: replayQueue !== null,
    replayTarget: replayQueue?.target ?? null,
    lastReplay,
    notice,
    flash,
    selectScenario,
    run,
    step,
    pause,
    reset,
    replay,
    apply,
    load,
    next,
  };
}

export type Lab = ReturnType<typeof useLab>;
