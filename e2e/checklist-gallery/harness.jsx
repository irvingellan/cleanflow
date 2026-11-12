import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { TranslationProvider } from "../../src/i18n/translations.js";
import { PublicChecklistPage } from "../../src/features/checklists/PublicChecklistPage.jsx";
import { reset, summary } from "./syntheticApi.js";
import "../../src/index.css";
// The same checklist styles the app loads, so layout here matches the phone.
import "../../src/styles/system.css";
import "../../src/styles/checklist.css";
function Harness() {
  const [generation, setGeneration] = useState(0);
  window.resetGallery = (options) => { reset(options); setGeneration((n) => n + 1); };
  window.gallerySummary = summary;
  return <TranslationProvider><PublicChecklistPage key={generation} token={`synthetic-${generation}`} /></TranslationProvider>;
}
createRoot(document.getElementById("root")).render(<Harness />);
