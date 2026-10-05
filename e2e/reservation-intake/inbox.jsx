import React from "react";
import { createRoot } from "react-dom/client";
import { TranslationProvider } from "../../src/i18n/translations.js";
import { ReservationInboxPreview } from "../../src/features/reservation-intake/ReservationInboxPreview.jsx";
import "../../src/index.css";
if (!import.meta.env.DEV || !["127.0.0.1", "localhost"].includes(location.hostname)) throw new Error("LOCAL_SYNTHETIC_ONLY");
// Presentation-only synthetic adapter. Real durability/authorization is tested in the Firestore emulator.
async function review(row, operation, extra) {
  const key = `synthetic-review:${row.id}`;
  const saved = JSON.parse(sessionStorage.getItem(key) || "null");
  if (operation === "READ") return saved || { state: "NEW", revision: 0, firstObservedAt: row.firstObservedAt || row.observedAt };
  if (saved?.state === "PROMOTED") return saved;
  const next = { ...saved, revision: (saved?.revision || 0) + 1,
    state: operation === "RESOLVE" ? "NEEDS_REVIEW" : operation === "IGNORE" ? "IGNORED" : "PROMOTED",
    propertyId: extra.propertyId || saved?.propertyId, firstObservedAt: row.firstObservedAt || row.observedAt };
  sessionStorage.setItem(key, JSON.stringify(next)); return next;
}
createRoot(document.getElementById("root")).render(<TranslationProvider><main className="app-shell"><ReservationInboxPreview onBack={() => {}}
  properties={[{ id: "synthetic-property-one", name: "Synthetic Harbor House", active: true }]} review={review} /></main></TranslationProvider>);
