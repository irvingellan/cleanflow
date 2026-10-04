import { createRoot } from "react-dom/client";
import { SandboxMultiServicePreview } from "../../src/features/jobs/SandboxMultiServicePreview.jsx";
import { TranslationProvider } from "../../src/i18n/translations.js";
import "../../src/index.css";

if (!import.meta.env.DEV || !["127.0.0.1", "localhost"].includes(location.hostname)) throw new Error("Local harness only");
const surface = new URLSearchParams(location.search).get("surface") === "jobs" ? "jobs" : "dashboard";
createRoot(document.getElementById("root")).render(<TranslationProvider>
  <main className="app-shell"><section className={`foundation${surface === "dashboard" ? " foundation--dashboard" : ""}`}><div className="environment-banner">SANDBOX · TEST DATA · LOCAL SYNTHETIC PREVIEW</div>
    <SandboxMultiServicePreview surface={surface} />
  </section></main>
</TranslationProvider>);
