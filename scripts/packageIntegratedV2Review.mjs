// Generated review artifacts only. Never deploys, reads credentials or contacts a provider.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root=fileURLToPath(new URL("../",import.meta.url));
const sha=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
const branch=execFileSync("git",["branch","--show-current"],{cwd:root,encoding:"utf8"}).trim();
if(branch!=="feature/design-system-v2-integrated-experience")throw new Error("Wrong review branch");
const stage=path.join(root,"artifacts/integrated-v2-review",sha);
fs.mkdirSync(stage,{recursive:true});
const copy=(source,target)=>{const dest=path.join(stage,target);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);};
for(const file of ["INTEGRATED_EXPERIENCE_PLAN.md","INTEGRATED_SOURCE_PROVENANCE.json","INTEGRATED_EXPERIENCE_REPORT.md","INTEGRATED_ACTION_TRACEABILITY.md","INTEGRATED_UX_REVIEW.md","INTEGRATED_SECURITY_REVIEW.md"])copy(path.join(root,"docs/design-system-v2",file),`review/${file}`);
const screenshots=path.join(root,"artifacts/visual-smoke/integrated-v2");
for(const file of fs.readdirSync(screenshots).filter(name=>name.endsWith(".png")))copy(path.join(screenshots,file),`screenshots/${file}`);
for(const name of ["unit-final","focused","final","detail","shell","services","dashboard","catalog","current","lifecycle","webkit","guards","production","sandbox"])copy(`/tmp/cleanflow-integrated-${name}.log`,`tests/${name}.log`);
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]).sort();}
const entries=files(stage).map(file=>`${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}  ${path.relative(stage,file)}`);
fs.writeFileSync(path.join(stage,"MANIFEST.md"),`# CleanFlow V2 integrated review\n\nBranch: ${branch}\nImplementation SHA: ${sha}\nBase: e4a3cfc9862e75b8680c237804fe703a3e45fd6b\nPreview: http://127.0.0.1:4210/e2e/integrated-v2/index.html?lang=pt&theme=light\n\nLocal synthetic only. No authentication. No backend/persistence. No push/merge/deploy.\nOperator instructions and limits: review/INTEGRATED_EXPERIENCE_REPORT.md.\n\n## SHA256 file inventory\n\n\`\`\`text\n${entries.join("\n")}\n\`\`\`\n`);
const zip=path.join(root,"artifacts/integrated-v2-review/CleanFlow_V2_Integrated_Experience_Review.zip");
if(fs.existsSync(zip))throw new Error("Review ZIP exists; preserve it rather than overwrite");
execFileSync("zip",["-q","-r",zip,"."],{cwd:stage});
console.log(JSON.stringify({sha,branch,zip,files:entries.length+1,screenshots:entries.filter(e=>e.includes("screenshots/")).length},null,2));
