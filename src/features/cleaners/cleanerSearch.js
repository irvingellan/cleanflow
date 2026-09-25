export function normalizeCleanerSearchText(value) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()
    : "";
}

export function filterCleanersByName(cleaners, query) {
  const normalizedQuery = normalizeCleanerSearchText(query);
  if (!normalizedQuery) return cleaners;
  return cleaners.filter((cleaner) =>
    normalizeCleanerSearchText(cleaner?.name).includes(normalizedQuery),
  );
}
