import { test,expect } from "@playwright/test";
for(const width of [390,1440])for(const [lang,theme]of [["en","light"],["pt","dark"]])test(`original Claude shared benchmark ${width} ${theme}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:1000});const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/*",r=>["localhost","127.0.0.1"].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.addInitScript(({lang,theme})=>{localStorage.setItem("cleanflow-language",lang);localStorage.setItem("cleanflow-manager-theme",theme)},{lang,theme});
 await page.goto("/e2e/workspace-v3/claude.html");await expect(page.locator(".mw-now-grid")).toBeVisible();expect(errors).toEqual([]);
 await page.screenshot({path:`artifacts/workspace-v3/repair/claude/${info.project.name}-${width}-${lang}-${theme}-agora.png`,fullPage:true});
});
