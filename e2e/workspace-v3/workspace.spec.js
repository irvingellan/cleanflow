import { expect, test } from "@playwright/test";
async function open(page, extra = "") {
  const errors = [], external = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/*", route => { const url = new URL(route.request().url()); if (!["localhost", "127.0.0.1"].includes(url.hostname)) { external.push(url.hostname); return route.abort(); } return route.continue(); });
  await page.goto(`/e2e/workspace-v3/index.html?workspace=v3${extra}`);
  return { errors, external };
}
test("authorized manager opens real Hybrid presentation", async ({ page }) => {
  const signals = await open(page);
  await expect(page.locator("[data-workspace=hybrid-c-a]")).toBeVisible();
  await expect(page.locator(".workspace-v3-start")).toBeVisible();
  expect(signals.errors).toEqual([]); expect(signals.external).toEqual([]);
});
test("denied membership and non-developer account cannot activate workspace", async ({ page }) => {
  await open(page, "&denied"); await expect(page.locator(".workspace-v3")).toHaveCount(0);
  await expect(page.getByText(/manager access|manager permissions/i).first()).toBeVisible();
  await open(page, "&nonDeveloper"); await expect(page.locator(".dashboard")).toBeVisible();
  await expect(page.locator(".workspace-v3")).toHaveCount(0);
});
test("attention opens its exact Job and browser Back returns to Agora without a write", async ({ page }) => {
  const signals = await open(page);
  const primary = page.locator(".workspace-v3-start");
  const property = await primary.locator("h3").textContent();
  await primary.getByRole("button").click();
  await expect(page.locator(".workspace-v3-detail .job-detail-v2")).toBeVisible();
  await expect(page.locator("#job-detail-title")).toContainText(property);
  await page.goBack();
  await expect(page.locator(".workspace-v3-start")).toBeVisible();
  expect(await page.evaluate(() => __integratedBlocked)).toEqual([]);
  expect(signals.errors).toEqual([]); expect(signals.external).toEqual([]);
});
test("range changes preserve selection/search/scroll and do not fetch or auto-page", async ({ page }) => {
  const signals = await open(page);
  await page.getByRole("button", { name: "Operations", exact: true }).click();
  const list = page.locator(".workspace-v3-worklist");
  const search = list.getByRole("searchbox");
  await search.fill("Garden");
  await expect(list.locator("[data-job-id]").first()).toBeVisible();
  await list.locator("[data-job-id]").first().click();
  await expect(page.locator("#job-detail-title")).toBeVisible();
  const property = await page.locator("#job-detail-title").textContent();
  const before = await page.evaluate(() => __workspaceReads.length);
  await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
  await expect(page.locator(".workspace-v3-outside")).toBeVisible();
  await expect(page.locator("#job-detail-title")).toHaveText(property);
  await expect(search).toHaveValue("Garden");
  expect(await page.evaluate(() => __workspaceReads.length)).toBe(before);
  await page.goBack();
  await expect(list).toBeVisible(); await expect(search).toHaveValue("Garden");
  await expect(page.getByRole("button", { name: "Tomorrow", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => __integratedBlocked)).toEqual([]);
  expect(signals.errors).toEqual([]); expect(signals.external).toEqual([]);
});
test("existing assignment intent opens existing picker without invoking mutation", async ({ page }) => {
  const signals = await open(page);
  await page.getByRole("button", { name: "Assign / change cleaner", exact: true }).click();
  const list = page.locator(".workspace-v3-worklist");
  await list.locator("[data-job-id]").first().click();
  await expect(page.locator(".job-detail-v2")).toBeVisible();
  await page.locator(".job-intents__next").getByRole("button").click();
  await expect(page.getByRole("button", { name: "Confirm assignment", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm assignment", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => __integratedBlocked)).toEqual([]);
  expect(signals.errors).toEqual([]);
});
test("retained worklist keeps its scroll offset across detail and adjacent-day navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await page.getByRole("button", { name: "Operations", exact: true }).click();
  const list = page.locator(".workspace-v3-worklist");
  await list.locator("[data-job-id]").first().click();
  await expect(page.locator("#job-detail-title")).toBeVisible();
  const top = await list.evaluate(el => { el.scrollTop = 120; return el.scrollTop; });
  expect(top).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
  expect(await list.evaluate(el => el.scrollTop)).toBe(top);
  await page.goBack();
  expect(await list.evaluate(el => el.scrollTop)).toBe(top);
});
test("Current/V2 remain available after leaving workspace", async ({ page }) => {
  const signals = await open(page);
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  await expect(page.locator(".workspace-v3")).toHaveCount(0);
  await expect(page.locator(".dashboard")).toBeVisible();
  expect(new URL(page.url()).searchParams.has("workspace")).toBe(false);
  expect(signals.errors).toEqual([]);
});
test("detail → Now → detail → browser Back returns to the top-level view", async ({ page }) => {
  const signals = await open(page);
  await page.locator(".workspace-v3-start button").click();
  await expect(page.locator("#job-detail-title")).toBeVisible();
  await page.getByRole("button", { name: "Now", exact: true }).click();
  await page.locator(".workspace-v3-start button").click();
  await expect(page.locator("#job-detail-title")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".workspace-v3-start")).toBeVisible();
  expect(signals.errors).toEqual([]);
});
test("a failed Dashboard read exposes its existing Retry and recovers without mutation", async ({ page }) => {
  const signals = await open(page, "&readFailure");
  await page.locator(".workspace-v3-now").getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".workspace-v3-start")).toBeVisible();
  expect(await page.evaluate(() => __integratedBlocked)).toEqual([]);
  expect(signals.errors).toEqual([]);
});
test("a pending Dashboard dependency renders a labelled loading state", async ({ page }) => {
  const signals = await open(page, "&slowRead");
  await expect(page.locator(".workspace-v3-now").getByRole("status")).toBeVisible();
  expect(signals.errors).toEqual([]);
});
for (const width of [390, 768, 1440]) for (const [lang, theme] of [["en", "light"], ["pt", "dark"]]) {
  test(`Hybrid ${width} ${lang} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width < 720 ? 844 : 1000 });
    await page.addInitScript(({ lang, theme }) => { localStorage.setItem("cleanflow-language", lang); localStorage.setItem("cleanflow-manager-theme", theme); }, { lang, theme });
    const signals = await open(page);
    const check = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator(".workspace-v3-start")).toBeVisible(); await check(); await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/workspace-v3/${info.project.name}-${width}-${lang}-${theme}-agora.png`, fullPage: true });
    await page.getByRole("button", { name: lang === "pt" ? "Operação" : "Operations", exact: true }).click();
    const list = page.locator(".workspace-v3-worklist");
    await expect(list.locator("[data-job-id]").first()).toBeVisible(); await check(); await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/workspace-v3/${info.project.name}-${width}-${lang}-${theme}-operation.png`, fullPage: true });
    await list.locator("[data-job-id]").first().click();
    await expect(page.locator(".job-detail-v2")).toBeVisible(); await check(); await page.evaluate(() => scrollTo(0, 0));
    expect(await list.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await list.locator(".compact-lifecycle").first().evaluate(el => el.getBoundingClientRect().right <= el.closest("[data-job-id]").getBoundingClientRect().right)).toBe(true);
    await page.screenshot({ path: `artifacts/workspace-v3/${info.project.name}-${width}-${lang}-${theme}-detail.png`, fullPage: true });
    if (width < 720) await expect(list).toBeHidden(); else await expect(list).toBeVisible();
    await page.goBack(); await expect(list).toBeVisible();
    expect(signals.errors).toEqual([]); expect(signals.external).toEqual([]);
    expect(await page.evaluate(() => __integratedBlocked)).toEqual([]);
  });
}
test("Spanish controls and keyboard slash are localized and usable", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cleanflow-language", "es"));
  await open(page);
  await expect(page.getByRole("button", { name: "Ahora", exact: true })).toBeVisible();
  await page.keyboard.press("/"); await expect(page.getByRole("searchbox", { name: "¿Qué necesitas hacer?" })).toBeFocused();
  await page.getByRole("button", { name: "Operación", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mañana", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mañana", exact: true }).click();
  await expect(page.locator(".workspace-v3-worklist [data-job-id]").first()).toBeVisible();
});
