export function diffReservation(previous, next) {
  const changeSet = {};
  for (const key of ["checkIn", "checkOut", "sourceReservationStatus", "propertyMappingState", "propertyMappingCandidateId", "guestName", "sourcePropertyName", "timezone"]) {
    if (previous[key] !== next[key]) changeSet[key] = { before: previous[key] ?? null, after: next[key] ?? null };
  }
  const keys = Object.keys(changeSet);
  const changeType = !keys.length ? "UNCHANGED" : keys.some(key => ["checkIn", "checkOut"].includes(key)) ? "DATES_CHANGED"
    : keys.includes("sourceReservationStatus") ? "STATUS_CHANGED"
      : keys.some(key => key.startsWith("propertyMapping")) ? "PROPERTY_MAPPING_CHANGED" : "UNKNOWN";
  return { changeType, changeSet };
}
