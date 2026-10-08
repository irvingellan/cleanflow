import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TranslationProvider, useTranslation } from "../../src/i18n/translations.js";
import { V2ManagerShell } from "../../src/components/v2/SandboxManagerShell.jsx";
import DashboardV2Pilot from "../../src/features/dashboard/DashboardV2Pilot.jsx";
import ServicesV2Pilot from "../../src/features/jobs/ServicesV2Pilot.jsx";
import { JobDetailV2Pilot } from "../../src/features/jobs/JobDetailV2Pilot.jsx";
import { PropertyDirectory } from "../../src/features/properties/PropertyDirectory.jsx";
import { PropertyDetail } from "../../src/features/properties/PropertyDetail.jsx";
import { ClientDirectory } from "../../src/features/clients/ClientDirectory.jsx";
import { ClientDetail } from "../../src/features/clients/ClientDetail.jsx";
import { CleanerDirectory } from "../../src/features/cleaners/CleanerDirectory.jsx";
import { CleanerDetail } from "../../src/features/cleaners/CleanerDetail.jsx";
import { OfferCleaners, AssignedCleanerJob } from "../../src/features/jobs/JobWorkflowViews.jsx";
import { CreateCleaningForm } from "../../src/features/jobs/JobForm.jsx";
import { ChecklistRunDetail } from "../../src/features/checklists/ChecklistRunDetail.jsx";
import { PayoutDirectory } from "../../src/features/payouts/PayoutViews.jsx";
import { WeeklyClosePreview } from "../../src/features/weekly-close/WeeklyClosePreview.jsx";
import { DevCenter } from "../../src/features/dev-center/DevCenter.jsx";
import { ManagerPageLoadDiagnostics } from "../../src/features/telemetry/ManagerPageLoadDiagnostics.jsx";
import { createJobListFilters, dashboardJobListFilters } from "../../src/features/jobs/jobListFilters.js";
import { formatPrice, formatCreatedAt } from "../../src/lib/presentation.js";
import { buildIntegratedContext, filteredServices } from "./fixtures.js";
import "../../src/index.css";
import "./preview.css";

const context = buildIntegratedContext();
globalThis.__integratedContext = context;
globalThis.__integratedBlocked = [];
const copy = {
  en: { local:"LOCAL SYNTHETIC · NO BACKEND", theme:"Theme", language:"Language", blocked:"Preview only: persistence and external actions are disabled. No change was saved.", shell:"Shell", back:"Back" },
  pt: { local:"SINTÉTICO LOCAL · SEM BACKEND", theme:"Tema", language:"Idioma", blocked:"Somente prévia: persistência e ações externas indisponíveis. Nenhuma alteração foi salva.", shell:"Navegação", back:"Voltar" },
  es: { local:"SINTÉTICO LOCAL · SIN BACKEND", theme:"Tema", language:"Idioma", blocked:"Solo vista previa: persistencia y acciones externas deshabilitadas. No se guardó ningún cambio.", shell:"Navegación", back:"Volver" },
};
const mutations = ["onOfferToCleaners","onCreateChecklistRun","onIssueChecklistCapability","onPrepareChecklistReminder","onRevokeChecklistCapability","onCreatePublicOfferLink","onAssignCleaner","onAssignCleanerDirectly","onRemoveAssignment","onReplaceAssignment","onStartCleaning","onCompleteCleaning","onUpdatePrices","onUpdateDetails","onUpdateSchedule","onSimulateAssignedCleaner","onResolveIssue","onSaveDataProvenance","onArchive","onRestore"];
function IntegratedApp() {
  const { language, setLanguage, translate } = useTranslation();
  const c=copy[language];
  const initial=new URLSearchParams(location.search);
  const [view,setView]=useState(initial.get("view") || "dashboard");
  const [selected,setSelected]=useState(initial.get("job") || context.jobs[0].id);
  const [entity,setEntity]=useState(null);
  const [origin,setOrigin]=useState("dashboard");
  const [filters,setFilters]=useState(createJobListFilters());
  const [loaded,setLoaded]=useState(12);
  const [excluded,setExcluded]=useState(false);
  const [restore,setRestore]=useState(null);
  const [notice,setNotice]=useState("");
  const [theme,setTheme]=useState(initial.get("theme") || "light");
  const [shell,setShell]=useState(initial.get("shell") || "v2");
  const returnPoint=useRef(null);
  const directoryReturn=useRef(null);
  const focusReturn=useRef(null);
  useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.lang=language;},[theme,language]);
  useEffect(()=>{const url=new URL(location.href);url.searchParams.set("view",view);url.searchParams.set("lang",language);url.searchParams.set("theme",theme);url.searchParams.set("shell",shell);if(view==="job-detail"||view==="checklist-run")url.searchParams.set("job",selected);else url.searchParams.delete("job");history.replaceState(null,"",url);},[view,selected,language,theme,shell]);
  useEffect(()=>{const frame=requestAnimationFrame(()=>{const anchor=focusReturn.current;focusReturn.current=null;const target=anchor?document.querySelector(`[data-job-id="${anchor.anchorJobId}"]`):document.querySelector("#cfv2-main h2,.integrated-current h2");if(target){if(!anchor)target.setAttribute("tabindex","-1");target.focus({preventScroll:true});}});return()=>cancelAnimationFrame(frame);},[view]);
  function navigate(next){setView(next);setNotice("");window.scrollTo({top:0,behavior:"auto"});}
  function openJob(job,anchor){setOrigin(view);returnPoint.current={y:window.scrollY,anchor};setSelected(job.id);navigate("job-detail");}
  function backJob(){if(origin==="job-list"&&returnPoint.current?.anchor){focusReturn.current=returnPoint.current.anchor;setRestore(returnPoint.current.anchor);}navigate(origin);if(origin!=="job-list")requestAnimationFrame(()=>window.scrollTo({top:returnPoint.current?.y||0,behavior:"auto"}));}
  function linkedServices(filter){setFilters(createJobListFilters(filter));setLoaded(48);navigate("job-list");}
  function backProperty(){const previous=directoryReturn.current;directoryReturn.current=null;if(previous){setEntity(previous.entity);navigate(previous.view);}else navigate("property-list");}
  function block(name){return ()=>{globalThis.__integratedBlocked.push(name);setNotice(c.blocked);return Promise.reject(new Error(c.blocked));};}
  function readAction(name){return ()=>{globalThis.__integratedReads ||= [];globalThis.__integratedReads.push(name);};}
  const handlers=Object.fromEntries(mutations.map(name=>[name,block(name)]));
  const fixture=context.records.find(f=>f.job.id===selected)||context.records[0];
  const details={...fixture,...handlers,isLoadingOffers:false,hasOffersError:false,isLoadingIssues:false,hasIssuesError:false,isLoadingAssignments:false,hasAssignmentsError:false,isLoadingChecklistRun:false,hasChecklistRunError:false,availableCleaners:context.cleaners,canRestore:false,onBack:backJob,
    onOfferToCleaners:()=>navigate("offer-cleaners"),onSimulateAssignedCleaner:()=>navigate("cleaner-job"),onOpenChecklistRun:()=>navigate("checklist-run"),onRefreshOffers:readAction("offers"),onRefreshIssues:readAction("issues"),onRefreshChecklistRun:readAction("run"),onRefreshChecklistCapability:readAction("capability")};
  const destinationViews={dashboard:"dashboard",jobs:"job-list",properties:"property-list",cleaners:"cleaner-list",clients:"client-list",payouts:"payout-list","dev-center":"dev-center",diagnostics:"load-time-diagnostics"};
  const activeSection=view.startsWith("job")||["checklist-run","offer-cleaners","cleaner-job"].includes(view)?"jobs":view.startsWith("property")?"properties":view.startsWith("client")?"clients":view.startsWith("cleaner")?"cleaners":view==="weekly-close"?"payouts":view==="load-time-diagnostics"?"dev-center":view==="payout-list"?"payouts":view;
  const destinations=Object.entries(destinationViews).map(([key,next])=>({key,icon:({dashboard:"dashboard",jobs:"jobs",properties:"home",cleaners:"people",clients:"clients",payouts:"wallet","dev-center":"tools",diagnostics:"clock"}[key]),group:["dashboard","jobs"].includes(key)?"daily":["properties","cleaners","clients"].includes(key)?"directory":key==="payouts"?"money":"internal",labelKey:key==="diagnostics"?"loadDiagnostics.title":`navigation.${key==="dev-center"?"devCenter":key}`,onClick:()=>navigate(next)}));
  const secondary={onEdit:()=>setNotice(c.blocked),onCreate:()=>setNotice(c.blocked),onCreateCleaning:()=>setNotice(c.blocked),onCreateProperty:()=>setNotice(c.blocked),onLinkClient:()=>setNotice(c.blocked),onOpenJob:openJob,...handlers,canRestore:false};
  const allFiltered=filteredServices(context.jobs,filters,excluded);
  let content;
  if(view==="dashboard")content=<DashboardV2Pilot dashboardData={context.dashboardData} isLoading={false} hasError={false} translate={translate} onRefresh={readAction("dashboard")} onOpenJob={openJob} onShowJobs={()=>{setFilters(createJobListFilters());navigate("job-list");}} onShowJobsWithFilter={filter=>{setFilters(dashboardJobListFilters(filter));navigate("job-list");}}/>;
  else if(view==="job-list")content=<ServicesV2Pilot jobs={allFiltered.slice(0,loaded)} cleaners={context.cleaners} properties={context.properties} filters={filters} isLoading={false} hasError={false} onFiltersChange={patch=>{setFilters(current=>({...current,...patch}));setLoaded(48);}} onClearFilters={()=>{setFilters(createJobListFilters());setLoaded(12);}} onSelect={openJob} onCreate={()=>navigate("job-create")} hasMore={loaded<allFiltered.length} isLoadingMore={false} onLoadMore={()=>setLoaded(n=>n+12)} onRetry={readAction("services")} restoreScroll={restore} onScrollRestored={()=>setRestore(null)} canManageExcluded={true} showExcluded={excluded} onToggleExcluded={()=>setExcluded(v=>!v)}/>;
  else if(view==="job-create")content=<CreateCleaningForm properties={context.properties} onBack={()=>navigate("job-list")} onCreated={block("unexpected-job-created")}/>;
  else if(view==="offer-cleaners")content=<OfferCleaners key={selected} job={fixture.job} cleaners={context.cleaners} isLoading={false} hasError={false} onBack={()=>navigate("job-detail")} onSent={block("unexpected-offers-sent")}/>;
  else if(view==="cleaner-job")content=<AssignedCleanerJob job={fixture.job} onBackToJob={()=>navigate("job-detail")} onStartCleaning={block("start")} onCompleteCleaning={block("complete")} onReportIssue={()=>setNotice(c.blocked)}/>;
  else if(view==="job-detail")content=<JobDetailV2Pilot key={selected} {...details}/>;
  else if(view==="checklist-run")content=fixture.checklistRun?<ChecklistRunDetail job={fixture.job} assignments={fixture.assignments} checklistRun={fixture.checklistRun} onBack={()=>navigate("job-detail")} onRefresh={readAction("checklist")} onApproveAndComplete={block("approve")} />:<p>{translate("checklists.noRun")}</p>;
  else if(view==="property-list")content=<PropertyDirectory properties={context.properties} {...secondary} onSelect={p=>{directoryReturn.current=null;setEntity(p);navigate("property-detail");}}/>;
  else if(view==="property-detail")content=<PropertyDetail property={entity||context.properties[0]} {...secondary} onBack={backProperty} onViewAllUpcoming={()=>linkedServices({propertyId:(entity||context.properties[0]).id})}/>;
  else if(view==="client-list")content=<ClientDirectory clients={context.clients} {...secondary} onSelect={v=>{setEntity(v);navigate("client-detail");}}/>;
  else if(view==="client-detail")content=<ClientDetail client={entity||context.clients[0]} properties={context.properties.filter(p=>p.clientId===(entity||context.clients[0]).id)} jobHistory={{upcomingJobs:context.jobs.filter(j=>j.clientId===(entity||context.clients[0]).id&&j.operationalStatus!=="COMPLETED"&&!j.archivedAt),recentJobs:context.jobs.filter(j=>j.clientId===(entity||context.clients[0]).id&&j.operationalStatus==="COMPLETED"&&!j.archivedAt)}} {...secondary} onViewAllUpcoming={()=>linkedServices({clientId:(entity||context.clients[0]).id,clientName:(entity||context.clients[0]).name})} onOpenProperty={p=>{directoryReturn.current={view:"client-detail",entity:entity||context.clients[0]};setEntity(p);navigate("property-detail");}} onBack={()=>navigate("client-list")}/>;
  else if(view==="cleaner-list")content=<CleanerDirectory cleaners={context.cleaners} {...secondary} onSelect={v=>{setEntity(v);navigate("cleaner-detail");}}/>;
  else if(view==="cleaner-detail")content=<CleanerDetail cleaner={entity||context.cleaners[0]} {...secondary} onBack={()=>navigate("cleaner-list")}/>;
  else if(view==="payout-list")content=<PayoutDirectory payoutGroups={[]} recentPayouts={[]} paidSummary={null} isLoading={false} hasError={false} onRefresh={readAction("payouts")} onWeeklyClose={()=>navigate("weekly-close")} onReview={()=>setNotice(c.blocked)} formatPrice={formatPrice} formatCreatedAt={formatCreatedAt}/>;
  else if(view==="weekly-close")content=<WeeklyClosePreview onBack={()=>navigate("payout-list")}/>;
  else if(view==="dev-center")content=<DevCenter access={{authorized:false,environment:"unknown",demoJobCount:context.jobs.length}} diagnostics={null} isWorking={false} hasError={false}/>;
  else if(view==="load-time-diagnostics")content=<ManagerPageLoadDiagnostics onBack={()=>navigate("dev-center")}/>;
  else content=<button onClick={()=>navigate("dashboard")}>{translate("navigation.dashboard")}</button>;
  const utilities=<p>{c.local} · synthetic-integrated-v2</p>;
  return <div className="cfv2-foundation"><div className="integrated-banner"><strong>{c.local}</strong><label>{c.language}<select aria-label={c.language} value={language} onChange={e=>setLanguage(e.target.value)}><option value="en">EN</option><option value="pt">PT</option><option value="es">ES</option></select></label><label>{c.theme}<select aria-label={c.theme} value={theme} onChange={e=>setTheme(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label><button onClick={()=>setShell(v=>v==="v2"?"current":"v2")}>{c.shell}: {shell==="v2"?"V2":"CURRENT"}</button></div>{notice&&<p className="integrated-notice" role="status">{notice}</p>}{shell==="v2"?<V2ManagerShell language={language} translate={translate} destinations={destinations} activeSection={activeSection} view={view} utilities={utilities} foundationClass="cfv2-foundation">{content}</V2ManagerShell>:<main className="integrated-current"><nav>{destinations.map(d=><button className="button" key={d.key} onClick={d.onClick}>{translate(d.labelKey)}</button>)}</nav>{content}</main>}</div>;
}
if(import.meta.env.DEV&&["127.0.0.1","localhost"].includes(location.hostname)){
  const params=new URLSearchParams(location.search);
  for(const key of ["dashboard","services","jobDetail"])if(!params.has(key))params.set(key,"v2");
  history.replaceState(null,"",`${location.pathname}?${params}`);
  localStorage.setItem("cleanflow-language",params.get("lang")||"en");
  createRoot(document.getElementById("root")).render(<TranslationProvider><IntegratedApp/></TranslationProvider>);
}
