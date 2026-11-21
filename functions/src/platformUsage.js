import { zonedMidnight } from "./cleanerJobAccess.js";
import { addCalendarDays, localDateKey } from "./managerReminders.js";

const dayMs = 86_400_000;

export function weeklyWindows(now) {
  const today = localDateKey(now);
  const mondayOffset = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7;
  const first = addCalendarDays(today, -mondayOffset - 49);
  return Array.from({ length: 8 }, (_, index) => {
    const startDate = addCalendarDays(first, index * 7);
    return {
      startDate,
      start: new Date(zonedMidnight(startDate)),
      end: index === 7 ? now : new Date(zonedMidnight(addCalendarDays(startDate, 7))),
    };
  });
}

export function adoptionFunnel(cleaners, submitted, window) {
  const funnel = { profiles: 0, hubAccess: 0, active30d: 0, submitted30d: 0 };
  for (const cleaner of cleaners) {
    if (!cleaner.active) continue;
    funnel.profiles++;
    if (!cleaner.hubAccess) continue;
    funnel.hubAccess++;
    const last = Date.parse(cleaner.lastActivityAt);
    if (!(last >= window.since30.getTime() && last <= window.now.getTime())) continue;
    funnel.active30d++;
    if (submitted.has(cleaner.id)) funnel.submitted30d++;
  }
  return funnel;
}

export function offerWaitingTooLong(waitingSinceMs, now) {
  return Number.isFinite(waitingSinceMs) && waitingSinceMs < now.getTime() - dayMs;
}

export function attentionReasons({ createdAt, lastActivityAt, health, attempts, failed, oldOffers, oldIssues }, now) {
  const reasons = [];
  const knownSince = Date.parse(lastActivityAt || createdAt);
  if (Number.isFinite(knownSince) && knownSince <= now.getTime() - 7 * dayMs) reasons.push("inactive");
  if (health === "errors" || health === "slow") reasons.push(health);
  if (attempts >= 10 && failed * 10 >= attempts) reasons.push("notificationFailures");
  if (oldOffers) reasons.push("oldOffers");
  if (oldIssues) reasons.push("oldIssues");
  return reasons;
}
