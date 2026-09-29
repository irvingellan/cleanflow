import { formatDate } from "../../lib/presentation.js";

/**
 * Builds a deliberately narrow, manager-reviewed reminder. It receives only
 * cleaner-safe display fields so Job financial values and internal notes cannot
 * accidentally enter a copied message.
 */
export function buildCleanerReminderMessage({
  cleanerName,
  propertyName,
  scheduledDate,
  scheduledStart,
  propertyDetails,
  includeSensitiveAccess = false,
  assignmentOfferUrl = null,
  checklistUrl = null,
  language,
  translate,
}) {
  const lines = [
    translate("jobs.reminderGreeting", { cleaner: cleanerName }),
    "",
    translate("jobs.reminderIntro"),
    "",
    `📅 ${translate("jobs.reminderDate", {
      date: formatDate(scheduledDate, translate, language),
    })}`,
  ];

  if (scheduledStart) {
    lines.push(`🕐 ${translate("jobs.reminderTime", { time: scheduledStart })}`);
  }

  lines.push(`📍 ${translate("jobs.reminderProperty", { property: propertyName })}`);

  const cleanerInstructions = typeof propertyDetails?.cleanerInstructions === "string"
    ? propertyDetails.cleanerInstructions
    : "";
  if (cleanerInstructions.trim()) {
    lines.push(translate("jobs.reminderInstructions", { instructions: cleanerInstructions }));
  }

  if (includeSensitiveAccess) {
    const sensitiveDetails = [
      ["jobs.reminderParking", propertyDetails?.garageParking],
      ["jobs.reminderAccessInstructions", propertyDetails?.accessInstructions],
      ["jobs.reminderKeyCodeInfo", propertyDetails?.keyCodeInfo],
    ].filter(([, value]) => typeof value === "string" && value.trim());

    if (sensitiveDetails.length > 0) {
      lines.push("", translate("jobs.reminderSensitiveAccessHeading"));
      for (const [key, value] of sensitiveDetails) {
        lines.push(translate(key, { details: value }));
      }
    }
  }

  if (typeof checklistUrl === "string" && checklistUrl.trim()) {
    lines.push("", translate("jobs.reminderChecklistLink", { url: checklistUrl }));
  }

  lines.push("", assignmentOfferUrl
    ? translate("jobs.reminderCleanFlowConfirmation", { url: assignmentOfferUrl })
    : translate("jobs.reminderConfirmation"));
  return lines.join("\n");
}

export function reusableAssignmentOfferUrl({
  job,
  assignment,
  offer,
  link,
  now = Date.now(),
  origin,
}) {
  if (!Number.isInteger(job?.schemaVersion) || job.schemaVersion < 2
    || job?.operationalStatus !== "ASSIGNED" || job?.archivedAt
    || assignment?.isActive !== true
    || !assignment.sourceOfferId
    || offer?.id !== assignment.sourceOfferId
    || offer?.status !== "INTERESTED"
    || offer?.cleanerId !== assignment.cleanerId
    || link?.offerId !== offer?.id
    || !link?.url
    || link.tokenHash !== offer.publicOfferTokenHash
    || !Number.isFinite(link.expiresAtMs)
    || link.expiresAtMs <= now
    || !offer.publicOfferExpiresAt?.toMillis
    || offer.publicOfferExpiresAt.toMillis() <= now) return null;

  try {
    const parsed = new URL(link.url);
    if ((origin && parsed.origin !== origin) || !["https:", "http:"].includes(parsed.protocol)) return null;
  } catch {
    return null;
  }
  return link.url;
}

export async function copyCleanerReminderMessage(message) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard is unavailable.");
  }

  await navigator.clipboard.writeText(message);
}
