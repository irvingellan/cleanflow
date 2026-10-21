// Presentation only. Deliberately no provider, prototype store or domain mutation imports.
export function workspaceV3Enabled({ mode, authorized, search = "" } = {}) {
  return ["sandbox", "emulator"].includes(mode) && authorized === true
    && new URLSearchParams(search).get("workspace") === "v3";
}
export function laDateKey(instant = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function validDay(key) {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(`${key}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key;
}
function addDays(key, count) {
  if (!validDay(key)) throw Error("Invalid operational date");
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
// Adapted selectively from the original V3 calendar-key helpers, not its state store.
export function rangeFor(kind, anchor, today = laDateKey()) {
  if (kind === "today") anchor = today;
  if (kind === "tomorrow") anchor = addDays(today, 1);
  if (!validDay(anchor)) throw Error("Invalid operational date");
  const start = kind === "week"
    ? addDays(anchor, -((new Date(`${anchor}T12:00:00Z`).getUTCDay() + 6) % 7)) : anchor;
  return { kind, anchor, start, end: kind === "week" ? addDays(start, 6) : start };
}
export function shiftRange(range, direction, today = laDateKey()) {
  const next = addDays(range.anchor, (range.kind === "week" ? 7 : 1) * direction);
  const kind = range.kind === "week" ? "week" : next === today ? "today" : next === addDays(today, 1) ? "tomorrow" : "day";
  return rangeFor(kind, next, today);
}
export function inRange(key, range) {
  return validDay(key) && key >= range.start && key <= range.end;
}
