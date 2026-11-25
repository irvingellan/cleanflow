import { PRICING_HOURLY } from "../billing/billingStatementModel.js";

// The manager's standard hourly rates (confirmed 2026-11-19 and 2026-11-21):
// the client pays $45/h and the cleaner earns $25/h. They only prefill an
// editable field when the manager switches a price to hourly; she can change
// them before saving, and nothing is charged or paid from these constants.
export const defaultHourlyRates = Object.freeze({ client: "45", cleaner: "25" });

// Gabi (2026-11-25): move-out, post-construction and touch-up jobs are usually
// billed by the hour. Selecting one of them prefills hourly on each side that has
// no saved property rate. The amounts stay editable before saving.
export const hourlyByDefaultServiceTypes = Object.freeze(["MOVE_IN_OUT", "POST_CONSTRUCTION", "AIRBNB_TOUCH_UP"]);

export function withHourlyServiceDefaults(values, serviceType, rates) {
  if (!hourlyByDefaultServiceTypes.includes(serviceType)) return values;
  const next = { ...values };
  if (rates?.client?.state !== "ready") Object.assign(next, { clientMode: PRICING_HOURLY, clientPrice: defaultHourlyRates.client });
  if (rates?.cleaner?.state !== "ready") {
    Object.assign(next, { cleanerMode: PRICING_HOURLY, cleanerPayout: defaultHourlyRates.cleaner, fixedPerCleaner: false });
  }
  return next;
}
