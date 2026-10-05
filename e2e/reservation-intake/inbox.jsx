import React from "react";
import { createRoot } from "react-dom/client";
import { TranslationProvider } from "../../src/i18n/translations.js";
import { ReservationInboxPreview } from "../../src/features/reservation-intake/ReservationInboxPreview.jsx";
import "../../src/index.css";
import { buildSyntheticReservationState } from "../../src/features/reservation-intake/syntheticReservationFixtures.js";
if (!import.meta.env.DEV || !["127.0.0.1", "localhost"].includes(location.hostname)) throw new Error("LOCAL_SYNTHETIC_ONLY");
// Presentation-only synthetic adapter. Real durability/authorization is tested in the Firestore emulator.
async function review(row, operation, extra) {
  const key = `synthetic-review:${row.id}`;
  const saved = JSON.parse(sessionStorage.getItem(key) || "null");
  const frozen = JSON.parse(sessionStorage.getItem(`synthetic-reservation:${row.id}`) || "null");
  const changes = {};
  if (frozen) for (const field of ["checkIn", "checkOut", "sourceReservationStatus"]) {
    if ((frozen[field] || null) !== (row[field] || null)) changes[field] = { before: frozen[field] || null, after: row[field] || null };
  }
  const signal = ["SOURCE_DISAPPEARED", "POSSIBLE_CANCELLED", "CONFLICT"].includes(row.changeType) ? row.changeType : null;
  const discrepancy = frozen ? { changes, signal, reviewRequired: Object.keys(changes).length > 0 || Boolean(signal) } : null;
  if (operation === "READ") return { ...(saved || { state: "NEW", revision: 0, firstObservedAt: row.firstObservedAt || row.observedAt }), discrepancy };
  if (saved?.state === "PROMOTED") { if (operation !== "PROMOTE") throw new Error("already-promoted"); return saved; }
  if (saved?.state === "IGNORED") throw new Error("ignored");
  if (extra.expectedRevision !== (saved?.revision || 0)) throw new Error("stale-review");
  if (operation === "RESOLVE" && extra.propertyId !== "synthetic-property-one") throw new Error("property-unresolved");
  if (operation === "PROMOTE") {
    if (!extra.confirmed || !saved?.propertyId || signal) throw new Error("review-required");
    sessionStorage.setItem(`synthetic-reservation:${row.id}`, JSON.stringify({ checkIn: row.checkIn, checkOut: row.checkOut, sourceReservationStatus: row.sourceReservationStatus }));
  }
  const next = { ...saved, revision: (saved?.revision || 0) + 1,
    state: operation === "RESOLVE" ? "NEEDS_REVIEW" : operation === "IGNORE" ? "IGNORED" : "PROMOTED",
    propertyId: extra.propertyId || saved?.propertyId, firstObservedAt: row.firstObservedAt || row.observedAt };
  sessionStorage.setItem(key, JSON.stringify(next)); return next;
}
window.__intakeAcceptance = {
  counts: () => ({ reservations: Object.keys(sessionStorage).filter(key => key.startsWith("synthetic-reservation:")).length, jobs: 0 }),
  snapshot: async signal => {
    const state = await buildSyntheticReservationState(), rows = Object.values(state.candidates);
    const row = rows.find(candidate => candidate.sourceEventUid === "synthetic-new-last");
    row.changeType = signal;
    if (signal === "DATES_CHANGED") { row.checkOut = "2026-11-06"; row.changeSet = { checkOut: { before: "2026-11-05", after: row.checkOut } }; }
    if (signal === "STATUS_CHANGED") row.sourceReservationStatus = "CANCELLED";
    return JSON.stringify({ candidates: rows });
  },
};
createRoot(document.getElementById("root")).render(<TranslationProvider><main className="app-shell"><ReservationInboxPreview onBack={() => {}}
  properties={[{ id: "synthetic-property-one", name: "Synthetic Harbor House", active: true }]} review={review} /></main></TranslationProvider>);
