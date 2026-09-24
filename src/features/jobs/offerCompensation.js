import { formatDate, formatPrice, hasValue } from "../../lib/presentation.js";
import { isAssignmentAwareJob, optionalJobPrice } from "./jobCompatibility.js";

/**
 * An Offer owns the amount shown to its cleaner. A pre-assignment Job payout is
 * only an unambiguous suggestion for the older single-cleaner Job model.
 */
export function getOfferCompensationSuggestion(job, offer) {
  if (Object.prototype.hasOwnProperty.call(offer || {}, "offeredCompensation")) {
    const amount = optionalJobPrice(offer.offeredCompensation);
    return {
      value: amount === undefined || amount === null ? "" : String(amount),
      source: "offer",
    };
  }

  if (!isAssignmentAwareJob(job)) {
    const amount = optionalJobPrice(job?.cleanerPayout);
    if (amount !== undefined && amount !== null) {
      return { value: String(amount), source: "legacy-job" };
    }
  }

  return { value: "", source: "unset" };
}

export function parseOfferCompensationInput(value) {
  const amount = optionalJobPrice(value);
  if (amount === null) {
    throw new Error("Offered compensation must be a non-negative amount.");
  }
  return amount ?? null;
}

export function buildCleanerOfferMessage({
  cleanerName,
  propertyName,
  scheduledDate,
  scheduledStart,
  offeredCompensation,
  publicUrl,
  language,
  translate,
}) {
  const lines = [
    translate("offers.messageGreeting", { cleaner: cleanerName }),
    "",
    translate("offers.messageIntro", {
      property: propertyName,
      date: formatDate(scheduledDate, translate, language),
    }),
  ];

  if (scheduledStart) {
    lines.push(translate("offers.messageTime", { time: scheduledStart }));
  }

  lines.push(
    translate("offers.messageCompensation", {
      amount: hasValue(offeredCompensation)
        ? formatPrice(offeredCompensation, translate, language)
        : translate("publicOffer.amountNotSet"),
    }),
    "",
    translate("offers.messageLink", { url: publicUrl }),
  );

  return lines.join("\n");
}
