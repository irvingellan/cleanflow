(() => {
  const profiles = {
    "my.hospitable.com": "BROWSER_DOM_HOSPITABLE",
    "app.guesty.com": "BROWSER_DOM_GUESTY",
  };
  const version = "dom-contract-v0.1-synthetic-only";
  function parse(document, location, sourceId, observedAt) {
    const provider = profiles[location.hostname];
    const failure = reason => ({ sourceId, observedAt, result: "PARSER_NEEDS_REVIEW", complete: false,
      errorCategory: reason, parserVersion: version, observations: [] });
    if (location.protocol !== "https:" || !provider || !/^\/(calendar|reservations)(?:\/|$)/.test(location.pathname)) return failure("PAGE_NOT_ALLOWLISTED");
    // Explicit fixture contract, NOT a claim about today's real provider DOM.
    // A real parser profile must be validated on an authorized page first.
    const root = document.querySelector('[data-reservation-bridge-profile="v0-synthetic"]');
    if (!root) return failure("PARSER_LAYOUT_UNSUPPORTED");
    const records = [...root.querySelectorAll("[data-reservation-record]")];
    if (records.length > 500) return failure("PARSER_TOO_MANY_RECORDS");
    const observations = [];
    for (const record of records) {
      const field = name => record.getAttribute(`data-${name}`) || null;
      if (!field("reservation-id") || !field("listing-id") || !field("check-in") || !field("check-out")) return failure("PARSER_REQUIRED_FIELD_MISSING");
      const observation = { sourceProvider: provider, sourceType: "BROWSER_DOM", sourceId,
        externalReservationId: field("reservation-id"), sourceListingExternalId: field("listing-id"),
        sourcePropertyName: field("listing-name"), guestName: field("guest-display-name"),
        checkIn: field("check-in"), checkOut: field("check-out"), timezone: field("timezone"),
        sourceReservationStatus: field("reservation-status"), sourceUpdatedAt: field("source-updated-at"), observedAt };
      if (Object.values(observation).some(value => typeof value === "string" && (value.length > 256 || /[<>\u0000-\u001f]|https?:\/\/|\S+@\S+/.test(value)))) return failure("PARSER_UNSAFE_FIELD");
      observations.push(observation);
    }
    return { sourceId, observedAt, result: "SUCCESS", complete: false, observations };
  }
  globalThis.ReservationBridgeParser = { parse, version };
})();
