// The manager's standard hourly rates (confirmed 2026-11-19 and 2026-11-21):
// the client pays $45/h and the cleaner earns $25/h. They only prefill an
// editable field when the manager switches a price to hourly; she can change
// them before saving, and nothing is charged or paid from these constants.
export const defaultHourlyRates = Object.freeze({ client: "45", cleaner: "25" });
