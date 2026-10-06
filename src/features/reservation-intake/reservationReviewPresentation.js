export function intakeDate(value, language = "en") {
  if (!value) return "—";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat({ en: "en-US", pt: "pt-BR", es: "es-ES" }[language] || "en-US", {
    dateStyle: "medium", ...(dateOnly ? {} : { timeStyle: "short" }), timeZone: "UTC",
  }).format(date) + (dateOnly ? "" : " · UTC");
}

export function intakeShortDate(value, language = "en") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return intakeDate(value, language);
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "—";
  return new Intl.DateTimeFormat({ en: "en-US", pt: "pt-BR", es: "es-ES" }[language] || "en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

export function intakeDayChange(diff) {
  if (!diff || ![diff.before, diff.after].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value || ""))) return null;
  if ([diff.before, diff.after].some(value => intakeShortDate(value) === "—")) return null;
  const days = (Date.parse(`${diff.after}T00:00:00Z`) - Date.parse(`${diff.before}T00:00:00Z`)) / 86400000;
  return Number.isInteger(days) ? days : null;
}

export function intakeSource(row, generic) {
  if (row.sourceProvider === "GENERIC_ICAL" && row.sourceType === "ICAL") return generic;
  const provider = { GUESTY: "Guesty", HOSPITABLE: "Hospitable" }[row.sourceProvider] || row.sourceProvider || "—";
  return `${provider} · ${row.sourceType === "ICAL" ? "iCal" : row.sourceType || "—"}`;
}

// Unread server decisions are not guessed from the shadow change classification.
export function matchesIntakeTriage(row, decision, filter) {
  if (!filter) return true;
  if (["PROMOTED", "IGNORED"].includes(filter)) return decision?.state === filter;
  if (filter === "NEW") return decision?.state === "NEW" || !decision && row.changeType === "NEW";
  if (filter === "POSSIBLE_CANCELLED") return ["SOURCE_DISAPPEARED", "POSSIBLE_CANCELLED"].includes(row.changeType)
    || ["CANCELLED", "CANCELED"].includes(row.sourceReservationStatus?.toUpperCase())
    || ["SOURCE_DISAPPEARED", "POSSIBLE_CANCELLED"].includes(decision?.discrepancy?.signal);
  if (filter === "NEEDS_REVIEW") return decision?.discrepancy?.reviewRequired
    || decision?.state === "NEEDS_REVIEW" || !decision && row.changeType !== "NEW";
  if (filter === "PROPERTY_REQUIRED") return !["PROMOTED", "IGNORED"].includes(decision?.state) && !decision?.propertyId;
  if (filter === "CHANGED") return ["DATES_CHANGED", "STATUS_CHANGED", "PROPERTY_MAPPING_CHANGED", "CONFLICT"].includes(row.changeType) || decision?.discrepancy?.reviewRequired;
  return row.changeType === filter;
}
