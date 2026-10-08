import { useState } from "react";
import { createRoot } from "react-dom/client";
import DashboardV2Pilot from "../../src/features/dashboard/DashboardV2Pilot.jsx";
import { TranslationProvider, useTranslation } from "../../src/i18n/translations.js";
import { ThemeProvider, useTheme } from "../../src/theme/theme.js";
import { dashboardFixture } from "./fixtures.js";
import "../../src/index.css";

if (!import.meta.env.DEV || !["localhost","127.0.0.1"].includes(location.hostname)) throw new Error("Local synthetic harness only");
const params = new URLSearchParams(location.search);
localStorage.setItem("cleanflow-language",params.get("lang") || "en");
localStorage.setItem("cleanflow-manager-theme",params.get("theme") || "light");
function Preview() {
  const {language,setLanguage,translate}=useTranslation();
  const {theme,setTheme}=useTheme();
  const [scenario,setScenario]=useState(params.get("scenario") || "normal");
  const [notice,setNotice]=useState("");
  const [retried,setRetried]=useState(false);
  const loading=scenario === "loading" || scenario === "refresh";
  const error=scenario === "error" || scenario === "stale-error";
  const data=scenario === "loading" || scenario === "error" ? null : dashboardFixture(scenario);
  const action=description=>setNotice(`Synthetic handler: ${description}`);
  return <main className="app-shell"><section className="foundation foundation--dashboard">
    <header className="foundation__header"><div className="brand-block"><p className="eyebrow">{translate("brand.operationsPlatform")}</p><h1>CleanFlow</h1>
      <nav className="main-navigation" aria-label={translate("common.mainNavigation")}>{["dashboard","jobs","properties","cleaners","clients","payouts"].map(key=><button className="button button--small" key={key} type="button" onClick={()=>action(key)}>{translate(`navigation.${key}`)}</button>)}</nav></div>
      <div className="header-actions"><select aria-label={translate("common.language")} value={language} onChange={e=>setLanguage(e.target.value)}>{["en","pt","es"].map(lang=><option key={lang}>{lang}</option>)}</select><button className="button" onClick={()=>setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? translate("theme.switchToDark") : translate("theme.switchToLight")}</button></div></header>
    <aside className="environment-banner">SANDBOX · TEST DATA · LOCAL</aside>
    <details><summary>Local synthetic scenario — harness only</summary><select aria-label="Local synthetic scenario" value={scenario} onChange={e=>{setScenario(e.target.value);setRetried(false);}}>{["normal","heavy","loading","refresh","error","stale-error","empty","sparse"].map(s=><option key={s}>{s}</option>)}</select></details>
    {notice && <output>{notice}</output>}
    <DashboardV2Pilot dashboardData={retried ? dashboardFixture() : data} isLoading={!retried && loading} hasError={!retried && error} translate={translate}
      onRefresh={()=>{setRetried(true);action("refresh");}} onOpenJob={job=>action(job.id)} onShowJobs={()=>action("jobs")} onShowJobsWithFilter={filter=>action(filter)} />
  </section></main>;
}
createRoot(document.getElementById("root")).render(<TranslationProvider><ThemeProvider><Preview /></ThemeProvider></TranslationProvider>);
