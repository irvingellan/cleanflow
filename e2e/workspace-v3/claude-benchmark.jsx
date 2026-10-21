// Local-only visual comparison: unchanged Claude source, the same synthetic Jobs.
import { createRoot } from "react-dom/client";
import { App } from "@claude-v3/App.jsx";
import { initialState } from "@claude-v3/model/store.js";
import { cleanerById } from "@claude-v3/ui/kit.jsx";
import { buildIntegratedContext, today } from "../integrated-v2/fixtures.js";
import "../../src/index.css";
import "../../src/components/v2/primitives.css";
if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(location.hostname)) throw Error("Local synthetic comparison only");
const context=buildIntegratedContext(), initial=initialState(today), baseJob=initial.data.jobs[0], baseProperty=initial.data.properties[0];
initial.ui.lang=localStorage.getItem("cleanflow-language")||"en";
initial.ui.theme=localStorage.getItem("cleanflow-manager-theme")||"light";
const now=new Date(); initial.data.clock={date:today,minutes:now.getHours()*60+now.getMinutes()};
initial.data.properties=context.properties.map(p=>({...baseProperty,...p,clientId:"synthetic-client"}));
initial.data.jobs=context.records.filter(f=>!f.job.archivedAt).map(f=>({...baseJob,id:f.job.id,propertyId:f.job.propertyId,date:f.job.scheduledDate,start:f.job.scheduledStart,status:f.job.operationalStatus,cleanerIds:f.job.assignedCleanerIds||[],ack:null,
 offers:f.offers.map(o=>({cleanerId:o.cleanerId,response:o.status==="INTERESTED"?"interested":o.status==="DECLINED"?"declined":null})),
 issues:f.issues.map(i=>({id:i.id,status:"open",title:{en:"Synthetic issue",pt:"Problema sintético",es:"Problema sintético"},by:"synthetic"})),
 checklist:{state:f.checklistRun?.status==="READY_FOR_REVIEW"?"submitted":f.checklistRun?"draft":"none",items:{},photos:[],link:"none",templateVersion:1},activity:[],comp:null}));
initial.data.notifications=[];
for(const cleaner of context.cleaners) cleanerById[cleaner.id]=cleaner;
createRoot(document.getElementById("root")).render(<App initial={initial}/>);
