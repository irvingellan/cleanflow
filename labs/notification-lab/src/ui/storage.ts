// Local, per-browser DEMO persistence. No sync, no telemetry, no upload.
// Every key starts with PREFIX so "Clear all" only touches lab data.
import type { Op } from "../engine/session.ts";
import type { Locale } from "../engine/types.ts";

export const PREFIX = "cleanflow-notification-lab:v1:";
const SNAPSHOT = `${PREFIX}snapshot`;
const PREFS = `${PREFIX}prefs`;

export interface Snapshot {
  scenarioId: string;
  seed: number;
  ops: Op[];
  savedAt: string;
}

export interface Prefs {
  locale: Locale;
  mode: "gabi" | "lab";
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const saveSnapshot = (s: Snapshot) => write(SNAPSHOT, s);
export const loadSnapshot = () => read<Snapshot>(SNAPSHOT);
export const savePrefs = (p: Prefs) => write(PREFS, p);
export const loadPrefs = () => read<Prefs>(PREFS);

/** Removes only this lab's keys. Returns how many were removed. */
export function clearLabData(): number {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
    return keys.length;
  } catch {
    return 0;
  }
}
