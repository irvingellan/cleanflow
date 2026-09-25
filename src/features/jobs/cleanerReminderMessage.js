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
    ? propertyDetails.cleanerInstructions.trim()
    : "";
  if (cleanerInstructions) {
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
        lines.push(translate(key, { details: value.trim() }));
      }
    }
  }

  lines.push("", translate("jobs.reminderConfirmation"));
  return lines.join("\n");
}

export async function copyCleanerReminderMessage(message) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard is unavailable.");
  }

  await navigator.clipboard.writeText(message);
}
