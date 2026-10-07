import { expect, test } from "@playwright/test";

async function open(page,{width=1440,theme="light",lang="en",scenario="normal"}={}) {
  await page.setViewportSize({width,height:width<720?844:1000});
  const errors=[],remote=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/*",route=>{const url=new URL(route.request().url());if(url.origin!=="http://127.0.0.1:4198" || url.pathname.startsWith("/api/") || /firebase/.test(url.pathname)){remote.push(url.pathname);return route.abort();}return route.continue();});
  await page.goto(`/e2e/dashboard-v2/?dashboard=v2&lang=${lang}&theme=${theme}&scenario=${scenario}`);
  await expect(page.locator(".dashboard-v2")).toBeVisible();
  return {errors,remote};
}

for(const width of [360,390,768,1280,1440]) for(const [theme,lang] of [["light","en"],["dark","pt"]]) {
  test(`Dashboard V2 ${width} ${theme} ${lang}: reading order, targets, no overflow`,async({page})=>{
    const evidence=await open(page,{width,theme,lang});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.locator(".dashboard-v2-metric")).toHaveCount(5);
    await expect(page.locator(".dashboard-v2-attention-row")).toHaveCount(5);
    await expect(page.locator(".dashboard-v2-next-row")).toHaveCount(8);
    for(const selector of [".dashboard-v2-rows button",".dashboard-v2-metrics button",".dashboard-pilot-comparison button",".dashboard-v2 .cfv2-button"])
      for(const item of await page.locator(selector).all()) expect((await item.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.locator(".dashboard-v2-section-header h3").allTextContents()).toEqual(lang === "en" ? ["Needs attention","Next 48 hours","Recently completed","This week"] : ["Precisa de atenção","Próximas 48 horas","Concluídos recentemente","Esta semana"]);
    expect(await page.locator(".dashboard-v2").textContent()).not.toMatch(/dashboardV2\.|dashboard\.|common\./);
    expect(evidence.errors).toEqual([]);expect(evidence.remote).toEqual([]);
    await page.screenshot({path:`artifacts/visual-smoke/dashboard-v2/normal-${width}-${theme}-${lang}.png`,fullPage:true});
  });
}
for(const scenario of ["heavy","loading","refresh","error","stale-error","empty","sparse"]) for(const width of [1440,390]) {
  test(`Dashboard ${scenario} at ${width}`,async({page})=>{
    const evidence=await open(page,{width,scenario,theme:width===390?"dark":"light",lang:width===390?"pt":"en"});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(scenario === "loading") {await expect(page.locator(".cfv2-skeleton").first()).toBeVisible();await expect(page.locator(".dashboard-v2-metric > strong")).toHaveCount(0);}
    if(scenario === "refresh" || scenario === "stale-error") await expect(page.locator(".dashboard-v2-next-row").first()).toBeVisible();
    if(scenario === "empty") await expect(page.locator(".dashboard-v2-metric > strong")).toHaveText(["0","0","0","0","0"]);
    await page.screenshot({path:`artifacts/visual-smoke/dashboard-v2/${scenario}-${width}.png`,fullPage:true});
    if(scenario === "error" || scenario === "stale-error") {
      await page.getByRole("button",{name:width===390?"Tentar novamente":"Try again",exact:true}).click();
      await expect(page.locator(".dashboard-v2-next-row")).toHaveCount(8);
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
    expect(evidence.errors).toEqual([]);expect(evidence.remote).toEqual([]);
  });
}
test("keyboard actions preserve current handlers; comparison preserves exact priorities",async({page})=>{
  const evidence=await open(page);
  const v2=await page.locator(".dashboard-v2-attention-row strong").allTextContents();
  const first=page.locator(".dashboard-v2-attention-row").first();await first.focus();
  expect(await first.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter");await expect(page.locator("output")).toContainText("Synthetic handler:");
  await page.getByRole("button",{name:"Current",exact:true}).click();
  expect(await page.locator(".attention-item strong").allTextContents()).toEqual(v2);
  await page.getByRole("button",{name:"V2",exact:true}).click();
  expect(await page.locator(".dashboard-v2-attention-row strong").allTextContents()).toEqual(v2);
  expect(evidence.errors).toEqual([]);expect(evidence.remote).toEqual([]);
});
test("EN dark / PT light / ES, reduced motion and contrast",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});await open(page,{lang:"es",theme:"dark",width:390});
  await expect(page.locator(".cfv2-skeleton")).toHaveCount(0);
  const colors=await page.locator(".dashboard-v2-metric").first().evaluate(el=>({background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el.querySelector("strong")).color}));
  expect(colors.text).not.toBe(colors.background);
  await page.locator(".header-actions select").selectOption("pt");
  await page.locator(".header-actions button").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","light");
});

for(const [theme,lang] of [["dark","en"],["light","pt"]]) for(const width of [1440,390]) {
  test(`first-class ${lang} ${theme} ${width}: legible labels`,async({page})=>{
    const evidence=await open(page,{theme,lang,width});
    const minimum=await page.locator(".dashboard-v2").evaluate(root=>{
      const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
      return Math.min(...[...root.querySelectorAll("small,.dashboard-v2-secondary,.cfv2-state-label,.dashboard-v2-metric > span")].map(el=>{
        let parent=el,background="rgba(0, 0, 0, 0)";
        while(parent && (background === "rgba(0, 0, 0, 0)" || background === "transparent")){background=getComputedStyle(parent).backgroundColor;parent=parent.parentElement;}
        const a=luminance(getComputedStyle(el).color),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      }));
    });
    expect(minimum).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(evidence.errors).toEqual([]);expect(evidence.remote).toEqual([]);
    await page.screenshot({path:`artifacts/visual-smoke/dashboard-v2/normal-${width}-${theme}-${lang}.png`,fullPage:true});
  });
}
