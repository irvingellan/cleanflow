import { offerPayNote, pricingMessage } from "../pricing/pricingMessages.js";
import { hourlyOfferSnapshot, newOfferPay } from "../../../functions/src/offerPay.js";
import { formatDate, formatPrice, hasValue } from "../../lib/presentation.js";
import { optionalJobPrice } from "./jobCompatibility.js";

/**
 * An Offer owns the amount shown to its cleaner. The Job payout only suggests
 * an amount for the manager to confirm or edit before issuing that Offer's link.
 */
export function getOfferCompensationSuggestion(job, offer) {
  const hourly = hourlyOfferSnapshot(offer?.offeredPay);
  if (hourly) {
    return { value: hourly.offeredPay ? String(hourly.offeredPay.rateCents / 100) : "", source: "offer", mode: "HOURLY" };
  }
  if (Object.prototype.hasOwnProperty.call(offer || {}, "offeredCompensation")) {
    const amount = optionalJobPrice(offer.offeredCompensation);
    return {
      value: amount === undefined || amount === null ? "" : String(amount),
      source: "offer",
    };
  }

  const amount = newOfferPay(job ?? {}).offeredCompensation;
  if (amount !== undefined && amount !== null) {
    return { value: String(amount), source: "job" };
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

export function formatOfferCompensation(offer, translate, language) {
  const { offeredPay, offeredCompensation } = offer;
  const hourly = hourlyOfferSnapshot(offeredPay);
  if (hourly?.offeredPay) {
    return pricingMessage(language, "perHour", { value: formatPrice(hourly.offeredPay.rateCents / 100, translate, language) });
  }
  if (hourly || !hasValue(offeredCompensation)) return translate("publicOffer.amountNotSet");
  const base = formatPrice(offeredCompensation, translate, language);
  const extra = offerPayNote(offer, language);
  return extra ? `${base} · ${extra}` : base;
}

export function buildCleanerOfferMessage({
  cleanerName,
  propertyName,
  scheduledDate,
  scheduledStart,
  offeredCompensation,
  offeredFirstSlotExtraCents,
  offeredPayEstimated,
  offeredPay,
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
      amount: formatOfferCompensation({ offeredPay, offeredCompensation, offeredFirstSlotExtraCents, offeredPayEstimated }, translate, language),
    }),
    ...(hourlyOfferSnapshot(offeredPay)?.offeredPay ? [pricingMessage(language, "reportHours")] : []),
    "",
    translate("offers.messageLink", { url: publicUrl }),
  );

  return lines.join("\n");
}
