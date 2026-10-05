import React from "react";
import { createRoot } from "react-dom/client";
import { TranslationProvider } from "../../src/i18n/translations.js";
import { ReservationInboxPreview } from "../../src/features/reservation-intake/ReservationInboxPreview.jsx";
import "../../src/index.css";
if (!import.meta.env.DEV || !["127.0.0.1", "localhost"].includes(location.hostname)) throw new Error("LOCAL_SYNTHETIC_ONLY");
createRoot(document.getElementById("root")).render(<TranslationProvider><main className="app-shell"><ReservationInboxPreview onBack={() => {}} /></main></TranslationProvider>);
