import { useState } from "react";
import { createRoot } from "react-dom/client";
import { V2ManagerShell } from "../../src/components/v2/SandboxManagerShell.jsx";
import { EnvironmentBanner } from "../../src/components/EnvironmentBanner.jsx";
import { TranslationProvider, languageOptions, useTranslation } from "../../src/i18n/translations.js";
import { ThemeProvider, useTheme } from "../../src/theme/theme.js";
import { SandboxMultiServicePreview } from "../../src/features/jobs/SandboxMultiServicePreview.jsx";
import { PropertyDirectory } from "../../src/features/properties/PropertyDirectory.jsx";
import { JobDetail } from "../../src/features/jobs/JobDetail.jsx";
import { getServiceLifecycleFixture } from "../../scripts/serviceLifecycleFixtures.mjs";
import { FeedbackPanel } from "../../src/features/feedback/FeedbackPanel.jsx";
import { WhatsNewPanel } from "../../src/features/releases/WhatsNewPanel.jsx";
import { Button } from "../../src/components/v2/primitives.jsx";
import "../../src/index.css";

if (import.meta.env.MODE !== "e2e" || !["127.0.0.1", "localhost"].includes(location.hostname)) throw Error("Local synthetic harness only");
const settings = new URLSearchParams(location.search);
localStorage.setItem("cleanflow-language", settings.get("lang") || "en");
localStorage.setItem("cleanflow-manager-theme", settings.get("theme") || "light");
function Fixture() {
  const { translate, language, setLanguage } = useTranslation();
  const { theme, setTheme } = useTheme();
  const initial = settings.get("view") || "dashboard";
  const [view, setView] = useState(initial), [activeSection, setActiveSection] = useState(initial);
  const [message, setMessage] = useState("");
  const navigate = key => { setActiveSection(key); setView(key); };
  const destinations = [
    ["dashboard", "dashboard", "daily"], ["jobs", "jobs", "daily"], ["properties", "home", "directory"],
    ["cleaners", "people", "directory"], ["clients", "clients", "directory"], ["payouts", "wallet", "money"], ["dev-center", "tools", "internal"],
  ].map(([key, icon, group]) => ({ key, icon, group, labelKey: `navigation.${key === "dev-center" ? "devCenter" : key}`, onClick: () => navigate(key) }));
  destinations.push({ key: "diagnostics", icon: "clock", group: "internal", labelKey: "loadDiagnostics.title", href: "/e2e/shell/index.html?view=load-time-diagnostics" });
  const utilities = <div className="manager-account"><div className="manager-identity"><strong>Demo Operator</strong><span>operator@example.invalid</span></div><div className="manager-account__controls">
    <label>{translate("common.language")}<select className="language-selector" aria-label={translate("common.language")} value={language} onChange={event => setLanguage(event.target.value)}>{languageOptions.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label>
    <Button variant="secondary" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{translate(theme === "dark" ? "theme.switchToLight" : "theme.switchToDark")}</Button>
    <Button variant="secondary" onClick={() => setMessage("Synthetic only · no push sent")}>{translate("notifications.currentDeviceTest")}</Button>
    <FeedbackPanel screen={view} /><WhatsNewPanel />
    <span className="developer-environment"><small>SANDBOX · Build synthetic-shell-pilot</small><a href="https://clean-flow-prototipo.web.app">{translate("environment.backToProduction")}</a></span>
    <Button variant="tertiary" onClick={() => setMessage("Synthetic only · no Auth change")}>{translate("auth.signOut")}</Button><span className="badge">v0.9.3</span>
  </div></div>;
  const pages = { jobs: "job-list", properties: "property-list", cleaners: "cleaner-list", clients: "client-list", payouts: "payout-list" };
  const fixture = getServiceLifecycleFixture("ready");
  const inspect = () => setMessage("Synthetic only · nothing saved");
  return <><EnvironmentBanner environment="sandbox" /><V2ManagerShell {...{ translate, language, activeSection, destinations, utilities }} view={pages[view] || view} foundationClass={`foundation${view === "dashboard" ? " foundation--dashboard" : ""}`}>
    <p className="cfv2-sr-only">LOCAL SYNTHETIC SHELL PREVIEW · no backend</p>
    {message && <p role="status">{message}</p>}
    {["dashboard", "jobs"].includes(view) && <SandboxMultiServicePreview key={view} surface={view} />}
    {view === "properties" && <PropertyDirectory properties={Array.from({ length: 6 }, (_, n) => ({ id: `synthetic-${n}`, name: `Demo Property ${n + 1}`, dataProvenance: "DEMO" }))} onCreate={inspect} onSelect={() => setView("job-detail")} />}
    {view === "job-detail" && <JobDetail {...fixture} onBack={() => navigate("properties")} onOpenChecklistRun={inspect} />}
    {!["dashboard", "jobs", "properties", "job-detail"].includes(view) && <section><h2>{translate(destinations.find(item => item.key === view)?.labelKey || "loadDiagnostics.title")}</h2><p>Local navigation destination · synthetic only</p><Button onClick={() => navigate("dashboard")}>{translate("navigation.dashboard")}</Button></section>}
  </V2ManagerShell></>;
}
createRoot(document.getElementById("root")).render(<TranslationProvider><ThemeProvider><Fixture /></ThemeProvider></TranslationProvider>);
