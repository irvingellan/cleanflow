const localeByLanguage = { en: "en-US", pt: "pt-BR", es: "es-ES" };
const missingValue = "Not provided";

export function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

export function formatPrice(value, translate = null, language = "en") {
  if (!hasValue(value)) {
    return translate ? translate("common.notProvided") : missingValue;
  }

  return new Intl.NumberFormat(localeByLanguage[language] || "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(value, translate = null, language = "en") {
  if (!value) {
    return translate ? translate("common.notProvided") : missingValue;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(localeByLanguage[language] || "en-US", {
    dateStyle: "medium",
  }).format(date);
}

export function formatShortWeekday(value, language = "en") {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(localeByLanguage[language] || "en-US", {
    weekday: "short",
  })
    .format(date)
    .replace(/\.$/, "");
}

export function formatCreatedAt(value, language = "en") {
  if (!value || typeof value.toDate !== "function") {
    return null;
  }

  return new Intl.DateTimeFormat(localeByLanguage[language] || "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value.toDate());
}

const statusTranslationKeys = {
  UNASSIGNED: "status.unassigned",
  OFFERED: "status.offered",
  ASSIGNED: "status.assigned",
  IN_PROGRESS: "status.inProgress",
  COMPLETED: "status.completed",
  PENDING: "status.pending",
  INTERESTED: "status.interested",
  DECLINED: "status.declined",
  OPEN: "status.open",
  RESOLVED: "status.resolved",
};

const statusFallbackMessages = {
  "status.unassigned": "Unassigned",
  "status.offered": "Offered",
  "status.assigned": "Assigned",
  "status.inProgress": "In progress",
  "status.completed": "Completed",
  "status.pending": "Pending",
  "status.interested": "Interested",
  "status.declined": "Not available",
  "status.open": "Open",
  "status.resolved": "Resolved",
};

export function formatStatus(status, translate = null) {
  const key = statusTranslationKeys[status];

  return key && translate
    ? translate(key)
    : key
      ? statusFallbackMessages[key]
      : missingValue;
}

export function formatOperationalStatus(status, translate = null) {
  return formatStatus(status, translate);
}
