// Operational time helpers. All business days are calendar days in
// America/Los_Angeles, represented as "YYYY-MM-DD" keys and "HH:MM" local times,
// the same shape the product already stores (scheduledDate / scheduledStart).
export const OPERATIONAL_TIME_ZONE = "America/Los_Angeles";

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: OPERATIONAL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

export function laDateKey(instant = new Date()) {
  const parts = Object.fromEntries(dayKeyFormatter.formatToParts(instant).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function keyToUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function addDays(key, days) {
  const date = keyToUtc(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayDiff(fromKey, toKey) {
  return Math.round((keyToUtc(toKey) - keyToUtc(fromKey)) / 86400000);
}

export function weekdayIndex(key) { return keyToUtc(key).getUTCDay(); }

/** Monday-based operational week, like the current Dashboard "This week". */
export function startOfWeek(key) {
  const offset = (weekdayIndex(key) + 6) % 7;
  return addDays(key, -offset);
}

export function rangeFor(kind, anchor, today) {
  if (kind === "today") return { kind, start: today, end: today, anchor: today };
  if (kind === "tomorrow") { const t = addDays(today, 1); return { kind, start: t, end: t, anchor: t }; }
  if (kind === "week") { const s = startOfWeek(anchor); return { kind, start: s, end: addDays(s, 6), anchor }; }
  return { kind: "day", start: anchor, end: anchor, anchor };
}

/** Moves a range by one unit (a day, or a week) and keeps its kind meaningful. */
export function shiftRange(range, direction, today) {
  if (range.kind === "week") return rangeFor("week", addDays(range.anchor, 7 * direction), today);
  const next = addDays(range.start, direction);
  if (next === today) return rangeFor("today", next, today);
  if (next === addDays(today, 1)) return rangeFor("tomorrow", next, today);
  return rangeFor("day", next, today);
}

export function inRange(key, range) { return key >= range.start && key <= range.end; }

export function rangeDays(range) {
  const days = [];
  for (let key = range.start; key <= range.end; key = addDays(key, 1)) days.push(key);
  return days;
}

const localeOf = lang => ({ pt: "pt-BR", en: "en-US", es: "es-US" }[lang] || "pt-BR");

export function formatDay(key, lang, style = "medium") {
  const options = style === "long"
    ? { weekday: "long", day: "numeric", month: "long" }
    : style === "short" ? { day: "numeric", month: "short" }
      : { weekday: "short", day: "numeric", month: "short" };
  return new Intl.DateTimeFormat(localeOf(lang), { ...options, timeZone: "UTC" }).format(keyToUtc(key));
}

export function formatTime(hhmm, lang) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (lang === "en") {
    const suffix = h < 12 ? "AM" : "PM";
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function minutesOf(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function hhmm(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes from the demo clock until a service starts. Null when the time is not set. */
export function minutesUntil(now, dateKey, start) {
  if (!start) return null;
  return dayDiff(now.date, dateKey) * 1440 + minutesOf(start) - now.minutes;
}

export function relativeDayKind(now, key) {
  const diff = dayDiff(now.date, key);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff < 0 ? "past" : "later";
}
