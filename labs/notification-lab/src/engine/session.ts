// Session = one scenario run. Step / Run / Replay are exact and deterministic:
// every operation is recorded, so Replay rebuilds the very same world.
import { applyCommand, drainPipeline, stepPipeline } from "./engine.ts";
import { createWorld } from "./world.ts";
import type { Command, World } from "./types.ts";
import type { Scenario } from "../scenarios/types.ts";

export type Op = { kind: "script"; index: number } | { kind: "step" } | { kind: "manual"; command: Command };

export interface Session {
  scenario: Scenario;
  seed: number;
  world: World;
  cursor: number;
  ops: Op[];
}

export function createSession(scenario: Scenario, seed = 4242): Session {
  return { scenario, seed, world: createWorld(seed, scenario.preconditions), cursor: 0, ops: [] };
}

export function isTerminal(s: Session): boolean {
  return s.world.queue.length === 0 && s.cursor >= s.scenario.script.length;
}

function clone(s: Session): Session {
  return { ...s, world: structuredClone(s.world), ops: [...s.ops] };
}

function applyOp(s: Session, op: Op): void {
  if (op.kind === "step") {
    stepPipeline(s.world);
  } else if (op.kind === "script") {
    applyCommand(s.world, s.scenario.script[op.index]!.command);
    s.cursor = op.index + 1;
  } else {
    drainPipeline(s.world);
    applyCommand(s.world, op.command);
    drainPipeline(s.world);
  }
  s.ops.push(op);
}

/** Advance exactly one transition: a queued pipeline step, else the next script command. */
export function step(s: Session): Session {
  if (isTerminal(s)) return s;
  const next = clone(s);
  applyOp(next, next.world.queue.length ? { kind: "step" } : { kind: "script", index: next.cursor });
  return next;
}

export function run(s: Session, limit = 2000): Session {
  let next = s;
  let n = 0;
  while (!isTerminal(next)) {
    next = step(next);
    n += 1;
    if (n > limit) throw new Error("scenario did not reach a terminal state");
  }
  return next;
}

/** A lab button: settles the pipeline, applies the command, settles again. */
export function manual(s: Session, command: Command): Session {
  const next = clone(s);
  applyOp(next, { kind: "manual", command });
  return next;
}

/** Rebuild from the initial state and re-apply exactly the same operations. */
export function replay(s: Session): Session {
  const fresh = createSession(s.scenario, s.seed);
  for (const op of s.ops) applyOp(fresh, op);
  return fresh;
}

export function reset(s: Session, seed = s.seed): Session {
  return createSession(s.scenario, seed);
}

/** FNV-1a over the canonical JSON of the world — equal worlds give equal prints. */
export function fingerprint(w: World): string {
  const text = JSON.stringify(w);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
