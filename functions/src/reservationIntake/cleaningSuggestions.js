const unavailableChanges = new Set(["SOURCE_DISAPPEARED", "POSSIBLE_CANCELLED", "CONFLICT"]);

function localDate(value, property) {
  if (!value) return null;
  if (value.length === 10) return value;
  if (!property?.timeZone) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: property.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value: part }) => [type, part]));
    return [parts.year, parts.month, parts.day].join("-");
  } catch {
    return null;
  }
}

function schedulingReasons(candidate, checkoutDate, property, bookings) {
  const checkInDate = localDate(candidate.checkIn, property);
  const policy = property.minimumTurnoverMinutes;
  const hasPolicy = Number.isSafeInteger(policy) && policy > 0;
  const dateOnlyCheckout = candidate.checkOut.length === 10;
  const reasons = new Set();

  for (const next of bookings) {
    if (next.id === candidate.id || next.propertyMappingCandidateId !== property.id) continue;
    if (candidate.possibleDuplicateOf?.includes(next.id)) continue;
    const startDate = localDate(next.checkIn, property);
    const endDate = localDate(next.checkOut, property);
    if (!startDate || !endDate) {
      reasons.add("NEXT_CHECK_IN_UNKNOWN");
      continue;
    }
    const comparable = !dateOnlyCheckout && next.checkIn.length !== 10 && next.checkOut.length !== 10;
    const isPrior = comparable ? next.checkOut <= candidate.checkIn : endDate <= checkInDate;
    if (isPrior) continue;

    if (comparable) {
      const minutes = (Date.parse(next.checkIn) - Date.parse(candidate.checkOut)) / 60_000;
      if (minutes < 0) reasons.add("OVERLAPPING_BOOKINGS");
      else if (hasPolicy && minutes < policy) reasons.add("INSUFFICIENT_TURNOVER");
      else if (!hasPolicy && startDate === checkoutDate) reasons.add("TURNOVER_POLICY_UNKNOWN");
      continue;
    }

    if (startDate < checkoutDate) reasons.add("OVERLAPPING_BOOKINGS");
    else {
      const calendarGap = (Date.parse(startDate) - Date.parse(checkoutDate)) / 86_400_000;
      if (calendarGap <= 1 || (hasPolicy && calendarGap <= Math.ceil(policy / 1440) + 1)) {
        reasons.add("TURNOVER_TIME_UNKNOWN");
      }
    }
  }
  return [...reasons].sort();
}

function isOpenJob({ operationalStatus, assigned, checklistStarted, manuallyEdited, archived }) {
  return operationalStatus === "UNASSIGNED" && !assigned && !checklistStarted && !manuallyEdited && !archived;
}

// This projection consumes a read-only snapshot. It has no Job or Assignment write path.
export function buildCleaningSuggestions(candidates, { properties, jobs }) {
  const byProperty = new Map(properties.map(property => [property.id, property]));
  const bookings = candidates.filter(candidate => candidate.calendarEventKind === "BOOKING"
    && candidate.sourceReservationStatus !== "CANCELLED" && !unavailableChanges.has(candidate.changeType));

  return candidates.map(candidate => {
    const propertyId = candidate.propertyMappingCandidateId;
    const property = byProperty.get(propertyId);
    const checkoutDate = localDate(candidate.checkOut, property);
    const previousDates = (candidate.previousCheckouts || []).map(prior => ({
      propertyId: prior.propertyId, checkoutDate: localDate(prior.checkOut, byProperty.get(prior.propertyId)),
    })).filter(prior => prior.propertyId !== propertyId || prior.checkoutDate !== checkoutDate);
    const currentJobs = checkoutDate && property ? jobs.filter(job =>
      job.propertyId === propertyId && job.scheduledDate === checkoutDate) : [];
    const previousJobs = jobs.filter(job => previousDates.some(prior =>
      job.propertyId === prior.propertyId && job.scheduledDate === prior.checkoutDate));
    const result = (recommendation, reasons = []) => ({
      candidateId: candidate.id, propertyId, checkoutDate, recommendation, reasons,
      conflictingJobIds: [...currentJobs, ...previousJobs].map(job => job.id).sort(),
    });

    switch (candidate.calendarEventKind) {
      case "BLOCK":
      case "OWNER_STAY":
        return result("EXCLUDED", [candidate.calendarEventKind]);
      case "UNKNOWN":
        return result("REVIEW", ["UNKNOWN_EVENT_KIND"]);
    }
    if (candidate.conflict || unavailableChanges.has(candidate.changeType) || candidate.sourceReservationStatus === "CANCELLED") {
      return result("REVIEW", [candidate.conflict?.reason || (candidate.sourceReservationStatus === "CANCELLED" ? "CALENDAR_CANCELLATION_REPORTED" : candidate.changeType)]);
    }

    const reasons = [];
    if (!property) reasons.push("PROPERTY_MAPPING_REQUIRED");
    if (!checkoutDate || candidate.confidence === "LOW") reasons.push("INCOMPLETE_DATES_OR_TIMEZONE");
    if (candidate.sourceReservationStatus === "TENTATIVE") reasons.push("TENTATIVE_BOOKING");
    else if (candidate.sourceReservationStatus !== "CONFIRMED") reasons.push("UNKNOWN_BOOKING_STATUS");
    if (candidate.possibleDuplicateOf?.length) reasons.push("POSSIBLE_DUPLICATE_SOURCE");
    if (candidate.checkoutHistoryTruncated) reasons.push("CHECKOUT_HISTORY_REQUIRES_REVIEW");
    if (previousJobs.length) reasons.push("CHANGED_BOOKING_WITH_EXISTING_JOB");
    if (currentJobs.length > 1 || currentJobs.some(job => !isOpenJob(job))) reasons.push("EXISTING_JOB_REQUIRES_REVIEW");
    else if (currentJobs.length === 1) reasons.push("POSSIBLE_EXISTING_JOB");
    if (property && checkoutDate && candidate.confidence !== "LOW") {
      reasons.push(...schedulingReasons(candidate, checkoutDate, property, bookings));
    }
    if (reasons.length) return result("REVIEW", reasons);
    return result("SUGGEST_NEW_CLEANING");
  }).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}
