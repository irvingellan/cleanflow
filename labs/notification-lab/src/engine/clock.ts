// Deterministic time and randomness helpers. No Date.now(), no Math.random().

/** mulberry32: small, fast, reproducible PRNG. Returns [value 0..1, nextState]. */
export function nextRandom(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  hour: number;
  minute: number;
}

export function zonedParts(epoch: number, timeZone: string): ZonedParts {
  const map: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(epoch))) map[part.type] = part.value;
  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute);
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    hour,
    minute,
  };
}

function offsetMs(epoch: number, timeZone: string): number {
  const map: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(epoch))) map[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

/** Wall-clock date + time in a time zone → epoch milliseconds. */
export function zonedToEpoch(date: string, time: string, timeZone: string): number {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  return second;
}

export function addDays(date: string, days: number): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** Is the wall time inside [start, end) quiet hours, which may wrap midnight. */
export function inQuietHours(time: string, start: string, end: string): boolean {
  const t = minutesOf(time);
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}
