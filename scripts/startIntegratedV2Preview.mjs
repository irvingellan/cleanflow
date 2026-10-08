import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const root=fileURLToPath(new URL("../",import.meta.url));
const url="http://127.0.0.1:4210/e2e/integrated-v2/index.html?lang=pt&theme=light";
async function running(){
 try{const response=await fetch(url,{signal:AbortSignal.timeout(1500)});const body=await response.text();if(response.status!==200||!body.includes("/e2e/integrated-v2/preview.jsx"))throw new Error("Port 4210 is occupied by a different server; refusing a duplicate.");return true;}
 catch(error){if(error.cause?.code==="ECONNREFUSED")return false;throw error;}
}
if(await running()) console.log(`Reused existing equivalent preview: ${url}`);
else{
 const dir=path.join(root,"artifacts/visual-smoke/integrated-v2");fs.mkdirSync(dir,{recursive:true});
 const log=fs.openSync(path.join(dir,"preview.log"),"a");
 const child=spawn(process.execPath,[path.join(root,"node_modules/vite/bin/vite.js"),"--config","e2e/integrated-v2/vite.config.js","--host","127.0.0.1","--port","4210","--strictPort","--mode","e2e"],{cwd:root,detached:true,stdio:["ignore",log,log]});
 child.unref();fs.closeSync(log);
 let ready=false;for(let i=0;i<20;i++){await new Promise(resolve=>setTimeout(resolve,200));if(await running()){ready=true;break;}}
 if(!ready)throw new Error("Preview failed to start; inspect its local log.");
 console.log(`Detached preview PID ${child.pid}: ${url}`);
 console.log("Survives terminal/conversation closure while macOS remains running; not a login/reboot service.");
}
