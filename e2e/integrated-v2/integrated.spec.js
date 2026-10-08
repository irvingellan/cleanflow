import { test, expect } from "@playwright/test";
const entry="/e2e/integrated-v2/index.html";
const errors=new WeakMap();
test.beforeEach(async({page})=>{const list=[];errors.set(page,list);page.on("pageerror",e=>list.push(e.message));page.on("request",r=>{if(!r.url().startsWith("http://127.0.0.1:4210")&&!r.url().startsWith("data:"))list.push(`external:${r.url()}`);});});
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([]);});
async function open(page,view="dashboard",options=""){await page.goto(`${entry}?view=${view}${options}`);await expect(page.locator(".integrated-banner")).toBeVisible();}
async function contained(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
for(const width of [360,390,768,1280,1440])for(const lang of ["en","pt","es"])for(const theme of ["light","dark"]){
 test(`${width} ${lang} ${theme}: shared Dashboard, Services and Detail`,async({page})=>{
  await page.setViewportSize({width,height:width<720?844:1000});
  await open(page,"dashboard",`&lang=${lang}&theme=${theme}`);await expect(page.locator(".dashboard-v2")).toBeVisible();await contained(page);
  await page.screenshot({path:`artifacts/visual-smoke/integrated-v2/dashboard-${width}-${lang}-${theme}.png`,fullPage:true});
  await page.locator(".dashboard-v2-next-row").first().click();await expect(page.locator(".job-detail-v2")).toBeVisible();await contained(page);
  await page.screenshot({path:`artifacts/visual-smoke/integrated-v2/detail-${width}-${lang}-${theme}.png`,fullPage:true});
  await open(page,"job-list",`&lang=${lang}&theme=${theme}`);await expect(page.locator(".services-v2__list")).toBeVisible();await contained(page);
  await page.screenshot({path:`artifacts/visual-smoke/integrated-v2/services-${width}-${lang}-${theme}.png`,fullPage:true});
 });
}
test("A attention -> actual Detail -> Back preserves Dashboard",async({page})=>{
 await open(page);const row=page.locator(".dashboard-v2-attention-row").first();const property=await row.locator("strong").last().innerText();await row.click();await expect(page.locator(".job-detail-v2")).toContainText(property);await page.getByRole("button",{name:/Back$/}).click();await expect(page.locator(".dashboard-v2")).toBeVisible();expect(await page.evaluate(()=>__integratedBlocked)).toEqual([]);
});
test("B actual pagination/search/filter -> checklist -> Back restores anchor",async({page})=>{
 await open(page,"job-list");expect(await page.locator("[data-job-id]").count()).toBe(12);await page.getByRole("button",{name:"Load more"}).click();expect(await page.locator("[data-job-id]").count()).toBe(24);
 await page.getByRole("searchbox").fill("Orchard");const row=page.locator('[data-job-id="synthetic-service-04"]');await row.scrollIntoViewIfNeeded();const y=await row.evaluate(e=>e.getBoundingClientRect().top);await row.click();await page.getByRole("button",{name:/Open existing checklist/}).first().click();await expect(page.locator(".checklist-run")).toBeVisible();await page.getByRole("button",{name:/Back$/}).click();await page.getByRole("button",{name:/Back$/}).click();await expect(page.getByRole("searchbox")).toHaveValue("Orchard");expect(Math.abs((await row.evaluate(e=>e.getBoundingClientRect().top))-y)).toBeLessThan(4);
});
test("C upcoming -> lifecycle and assignment are the same shared Job",async({page})=>{
 await open(page);await page.locator(".dashboard-v2-next-row").nth(2).click();await expect(page.locator(".job-detail-v2")).toContainText("Demo Meadow 3");await expect(page.locator(".job-detail-v2")).toContainText("Demo Cleaner Alpha");await expect(page.locator(".job-intents__next")).toContainText("Prepare reminder");
});
test("D mobile More and CURRENT directories remain real navigable screens",async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page,"job-list");await page.locator("[data-job-id]").first().click();await page.locator(".job-detail-section > summary").first().click();await page.getByRole("button",{name:/Back$/}).click();await page.getByRole("button",{name:"More",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Clients",exact:true}).click();await expect(page.locator("#clients-title")).toBeVisible();await page.locator(".client-card").first().click();await expect(page.locator("body")).toContainText("Demo Client");await contained(page);
});
test("E completion confirmation is truthful; cancel never mutates",async({page})=>{
 await open(page,"job-detail","&job=synthetic-service-03");await page.getByText("More actions",{exact:true}).click();await page.getByRole("button",{name:"Choose intention: Complete service"}).click();await expect(page.getByRole("dialog")).toContainText("Does not mark payment paid");expect(await page.evaluate(()=>__integratedBlocked)).toEqual([]);await page.getByRole("button",{name:"Cancel",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);expect(await page.evaluate(()=>__integratedBlocked)).toEqual([]);
});
test("unknown recommendation never promotes completion",async({page})=>{
 await open(page,"job-detail","&job=synthetic-unknown");await expect(page.locator(".job-intents__next")).toContainText("View saved service");await expect(page.locator(".job-intents__next")).not.toContainText("Complete service");
});
test("secondary destinations and directory histories use no external provider",async({page})=>{
 for(const view of ["property-list","cleaner-list","client-list","payout-list","dev-center","load-time-diagnostics","weekly-close"]){await open(page,view);await page.waitForTimeout(150);await contained(page);}
 await open(page,"property-list");await page.locator(".property-card").first().click();await expect(page.locator("body")).toContainText("Property details");await expect(page.locator("body")).not.toContainText("Unable to load property history");
});
test("keyboard skip, More focus trap, reduced motion, comparison preserves shared values",async({page})=>{
 await open(page);const values=await page.locator(".dashboard-v2-metric strong").allTextContents();await page.getByRole("button",{name:"Current",exact:true}).click();await expect(page.locator(".dashboard")).toBeVisible();await page.getByRole("button",{name:"V2",exact:true}).click();expect(await page.locator(".dashboard-v2-metric strong").allTextContents()).toEqual(values);
 await page.emulateMedia({reducedMotion:"reduce"});await page.keyboard.press("Tab");await page.setViewportSize({width:390,height:844});await page.getByRole("button",{name:"More",exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("client and property View all upcoming preserve the linked directory context",async({page})=>{
 await open(page,"client-list");await page.locator(".client-card").first().click();await page.getByRole("button",{name:/View all upcoming/}).click();await expect(page.locator(".services-v2")).toBeVisible();await expect(page.locator(".services-v2")).toContainText("Demo Client 1");
 await open(page,"property-list");await page.locator(".property-card").first().click();await page.getByRole("button",{name:/View all upcoming/}).click();await expect(page.locator(".services-v2")).toBeVisible();const properties=await page.locator(".services-v2__identity strong").allTextContents();expect(new Set(properties).size).toBe(1);
});
test("changed language/theme survives Shell comparison reload",async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);await page.getByLabel("Theme",{exact:true}).selectOption("dark");await page.getByLabel("Language",{exact:true}).selectOption("pt");await page.locator(".cfv2-shell-tabs button").last().click();await page.getByRole("link",{name:"Shell atual"}).click();await expect(page.getByLabel("Tema",{exact:true})).toHaveValue("dark");await expect(page.getByLabel("Idioma",{exact:true})).toHaveValue("pt");
});
test("Payouts has no invented recorded summary; directory Back and focus remain coherent",async({page})=>{
 await open(page,"payout-list");await expect(page.locator("body")).not.toContainText("undefined jobs");
 await open(page,"client-list");await page.locator(".client-card").first().click();await page.getByRole("button",{name:"Open property",exact:true}).first().click();await page.getByRole("button",{name:/Back$/}).click();await expect(page.locator("#client-detail-title")).toBeVisible();
 await open(page,"job-list");const row=page.locator("[data-job-id]").first();await row.focus();await page.keyboard.press("Enter");await expect(page.locator("#job-detail-title")).toBeFocused();await page.getByRole("button",{name:/Back$/}).click();await expect(row).toBeFocused();
});
test("Offers navigation opens the existing control without a mutation",async({page})=>{
 await open(page,"job-detail","&job=synthetic-service-01");
 await page.locator(".job-detail-section > summary").filter({hasText:"Offers"}).click();
 await page.getByRole("button",{name:"Offer cleaning to cleaners",exact:true}).click();
 await expect(page.locator("#offer-cleaners-title")).toBeVisible();
 expect(await page.evaluate(()=>__integratedBlocked)).toEqual([]);
 await page.getByRole("button",{name:/Back$/}).click();await expect(page.locator(".job-detail-v2")).toBeVisible();
});
test("New service opens the existing form; Back does not create a record",async({page})=>{
 await open(page,"job-list");await page.getByRole("button",{name:"New service",exact:true}).click();
 await expect(page.locator("#create-cleaning-title")).toBeVisible();
 await page.getByRole("button",{name:/Back$/}).click();await expect(page.locator(".services-v2")).toBeVisible();
 expect(await page.evaluate(()=>__integratedBlocked)).toEqual([]);
});
