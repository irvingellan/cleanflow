import { expect, test } from "@playwright/test";
for (const width of [390, 768, 1440]) for (const [lang, theme] of [["en", "light"], ["pt", "dark"]]) {
  test(`loading motion → data/error and reduced motion ${width} ${lang}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.addInitScript(({lang,theme}) => {localStorage.setItem("cleanflow-language",lang);localStorage.setItem("cleanflow-manager-theme",theme);},{lang,theme});
    await page.route("**/*", r => ["localhost","127.0.0.1"].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto("/e2e/workspace-v3/index.html?workspace=v3&slowRead");
    const loading=page.locator(".workspace-v3-loading");await expect(loading).toBeVisible();
    const bar=loading.locator("span").first();
    expect(await bar.evaluate(el=>getComputedStyle(el,"::after").animationName)).toBe("workspace-v3-shimmer");
    const start=await bar.evaluate(el=>getComputedStyle(el,"::after").transform);
    await page.waitForTimeout(180);
    expect(await bar.evaluate(el=>getComputedStyle(el,"::after").transform)).not.toBe(start);
    await page.screenshot({path:`artifacts/workspace-v3/repair/after/${info.project.name}-${width}-${lang}-${theme}-loading.png`,fullPage:true});
    await page.emulateMedia({reducedMotion:"reduce"});
    expect(await bar.evaluate(el=>getComputedStyle(el,"::after").animationName)).toBe("none");
    await page.evaluate(()=>__releaseWorkspaceRead());
    await expect(loading).toHaveCount(0);await expect(page.locator(".workspace-v3-start")).toBeVisible();
    await page.goto("/e2e/workspace-v3/index.html?workspace=v3&emptyData");
    await expect(page.locator(".workspace-v3-now-columns")).toBeVisible();
    await expect(page.locator(".workspace-v3-loading")).toHaveCount(0);
    await page.screenshot({path:`artifacts/workspace-v3/repair/after/${info.project.name}-${width}-${lang}-${theme}-empty.png`,fullPage:true});
    await page.goto("/e2e/workspace-v3/index.html?workspace=v3&readFailure");
    await expect(page.locator(".workspace-v3-load-error")).toBeVisible();
    await expect(page.locator(".workspace-v3-loading")).toHaveCount(0);
    await page.locator(".workspace-v3-load-error summary").click();
    await expect(page.locator(".workspace-v3-load-error code")).toHaveText("unavailable · jobs-open");
    await page.screenshot({path:`artifacts/workspace-v3/repair/after/${info.project.name}-${width}-${lang}-${theme}-error.png`,fullPage:true});
    await page.locator(".workspace-v3-load-error button").first().click();
    await expect(page.locator(".workspace-v3-start")).toBeVisible();
    expect(await page.evaluate(()=>__integratedBlocked)).toEqual([]);expect(errors).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
test("ultrawide does not strand the workspace in a centered narrow column",async({page})=>{
  await page.setViewportSize({width:3104,height:1352});
  await page.goto("/e2e/workspace-v3/index.html?workspace=v3");
  await expect(page.locator(".workspace-v3-start")).toBeVisible();
  const box=await page.locator(".workspace-v3").boundingBox();expect(box.x).toBeLessThan(300);expect(box.width).toBeGreaterThan(2600);
});
