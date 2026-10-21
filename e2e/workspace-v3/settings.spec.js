import {test,expect} from "@playwright/test";

test("settings selectors retain 44px touch targets in Safari",async({page})=>{await page.goto("/e2e/workspace-v3/index.html?workspace=v3");await expect(page.locator(".workspace-v3-start")).toBeVisible();await page.getByRole("complementary").getByRole("button",{name:"Account & settings",exact:true}).click();for(const select of await page.locator(".workspace-settings select").all())expect((await select.boundingBox()).height).toBeGreaterThanOrEqual(44);});
for(const width of [390,768,1440])for(const[lang,theme]of [["en","light"],["pt","dark"]])test(`settings + motion ${width} ${lang}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:1000});const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(({lang,theme})=>{localStorage.setItem("cleanflow-language",lang);localStorage.setItem("cleanflow-manager-theme",theme)},{lang,theme});
 await page.route("**/*",r=>["localhost","127.0.0.1"].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.goto("/e2e/workspace-v3/index.html?workspace=v3");await expect(page.locator(".workspace-v3-start")).toBeVisible();
 const opener=(width===390?page.locator(".cfv2-shell-mobile-header"):page.getByRole("complementary")).getByRole("button",{name:lang==="pt"?"Conta e preferências":"Account & settings",exact:true});
 await opener.click();const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
 await page.screenshot({path:`artifacts/workspace-v3/settings/${process.env.CLEANFLOW_SETTINGS_BEFORE?"before":"after"}/${info.project.name}-${width}-${lang}-${theme}.png`,fullPage:true});
 if(process.env.CLEANFLOW_SETTINGS_BEFORE)return;
 for(const name of(lang==="pt"?["Conta","Preferências","Notificações","Ajuda"]:["Account","Preferences","Notifications","Help"]))await expect(dialog.getByRole("heading",{name,exact:true})).toBeVisible();
 await expect(dialog.getByRole("combobox",{name:lang==="pt"?"Aparência":"Appearance",exact:true})).toBeVisible();
 await dialog.getByRole("combobox",{name:lang==="pt"?"Aparência":"Appearance",exact:true}).selectOption("system");expect(await page.evaluate(()=>localStorage.getItem("cleanflow-manager-theme"))).toBeNull();
 await dialog.getByRole("combobox",{name:lang==="pt"?"Aparência":"Appearance",exact:true}).selectOption(theme);
 await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
 const before=await page.evaluate(()=>__workspaceReads.length);const trigger=page.getByRole("button",{name:lang==="pt"?"Prévia da animação de carregamento":"Preview loading animation",exact:true});await trigger.click();
 const preview=page.locator(".workspace-v3-motion-preview");await expect(preview).toBeVisible();await expect(page.locator(".workspace-v3-start")).toBeVisible();
 const bar=preview.locator(".workspace-v3-loading span").first();const a=await bar.evaluate(el=>getComputedStyle(el,"::after").transform);const box=await preview.boundingBox();await page.waitForTimeout(400);expect(await bar.evaluate(el=>getComputedStyle(el,"::after").transform)).not.toBe(a);expect(await preview.boundingBox()).toEqual(box);
 await page.screenshot({path:`artifacts/workspace-v3/settings/after/${info.project.name}-${width}-${lang}-${theme}-motion.png`,fullPage:true});
 await expect(preview).toHaveCount(0,{timeout:5500});expect(await page.evaluate(()=>__workspaceReads.length)).toBe(before);expect(await page.evaluate(()=>__integratedBlocked)).toEqual([]);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("non-developer cannot see loading demonstration",async({page})=>{await page.goto("/e2e/workspace-v3/index.html?workspace=v3&nonDeveloper");await expect(page.locator(".dashboard")).toBeVisible();await expect(page.getByRole("button",{name:"Preview loading animation"})).toHaveCount(0);});
test("Spanish settings, nested help and keyboard focus remain usable without writes",async({page})=>{
 await page.goto("/e2e/workspace-v3/index.html?workspace=v3");await expect(page.locator(".workspace-v3-start")).toBeVisible();await page.getByRole("complementary").getByRole("button",{name:"Account & settings",exact:true}).click();
 const panel=page.getByRole("dialog");await panel.getByRole("combobox",{name:"Language",exact:true}).selectOption("es");await expect(panel.getByRole("heading",{name:"Preferencias",exact:true})).toBeVisible();
 await panel.locator(".feedback-trigger").click();await expect(page.getByRole("dialog")).toHaveCount(2);await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(1);
 await expect(panel.locator(".feedback-trigger")).toBeFocused();await panel.locator(".workspace-settings-advanced summary").click();await expect(panel.getByRole("link",{name:/Producción/})).toHaveAttribute("href","https://clean-flow-prototipo.web.app");
 await panel.getByRole("button",{name:"Salir de la vista previa",exact:true}).focus();await page.keyboard.press("Tab");await expect(panel.getByRole("button",{name:"Cerrar",exact:true})).toBeFocused();
 await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);expect(await page.evaluate(()=>__integratedBlocked)).toEqual([]);await expect(page.locator(".workspace-v3-load-error")).toHaveCount(0);await expect(page.getByText("Diagnóstico de lectura",{exact:true})).toHaveCount(0);
});
for(const[width,theme]of [[1440,"light"],[390,"dark"]])test(`record visible motion ${width} ${theme}`,async({browser},info)=>{
 const context=await browser.newContext({viewport:{width,height:width===390?844:1000},recordVideo:{dir:"artifacts/workspace-v3/settings/video-tmp",size:{width,height:width===390?844:1000}}});const page=await context.newPage();
 await page.route("**/*",r=>["localhost","127.0.0.1"].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.addInitScript(theme=>localStorage.setItem("cleanflow-manager-theme",theme),theme);await page.goto("http://127.0.0.1:4317/e2e/workspace-v3/index.html?workspace=v3");await expect(page.locator(".workspace-v3-start")).toBeVisible();
 await page.getByRole("button",{name:"Preview loading animation",exact:true}).click();const preview=page.locator(".workspace-v3-motion-preview");await expect(preview).toBeVisible();await expect(preview).toHaveCount(0,{timeout:5500});const video=page.video();await context.close();await video.saveAs(`artifacts/workspace-v3/settings/${info.project.name}-${width}-${theme}-motion.webm`);
});
