const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const calendarDayMs = 86_400_000;

export function isValidScheduledDate(value) {
  if (typeof value !== "string") return false;
  const match = datePattern.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

/** Validation shared by the callable and the form. Dates are inclusive operating-calendar days. */
export function unavailabilityPeriodError(period, today) {
  const { startDate, endDate } = period;
  if (!isValidScheduledDate(startDate) || !isValidScheduledDate(endDate) || startDate > endDate) return "dates";
  if (endDate < today) return "past";
  const first = Date.parse(startDate + "T00:00:00Z");
  const last = Date.parse(endDate + "T00:00:00Z");
  if (last - first >= 366 * calendarDayMs) return "duration";
  if (Object.hasOwn(period, "startTime") || Object.hasOwn(period, "endTime")) {
    const { startTime, endTime } = period;
    if (startDate !== endDate || typeof startTime !== "string" || typeof endTime !== "string"
      || !timePattern.test(startTime) || !timePattern.test(endTime) || startTime >= endTime) return "times";
  }
  return null;
}
