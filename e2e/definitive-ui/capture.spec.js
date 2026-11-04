import { test } from "@playwright/test";
import { seedOperation } from "./fixtures.js";
import { goSection, loginManager, managerContext, openInbox, settle, shot, signInCleaner, themes, widths } from "./support.js";

// Same synthetic operation, same widths and themes, for the before and after builds.
const phase = process.env.DEFINITIVE_UI_PHASE || "after";
let fixture;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { fixture = await seedOperation(); });

const only = process.env.DEFINITIVE_UI_ONLY ? process.env.DEFINITIVE_UI_ONLY.split(",") : null;
async function step(name, action) {
  if (only && !only.some((key) => name.endsWith(key))) return;
  try { await action(); } catch (error) { console.log(`[capture] ${name} skipped: ${error.message.split("\n")[0]}`); }
}

for (const theme of themes) {
  test(`manager screens ${theme}`, async ({ browser }) => {
    const context = await managerContext(browser, theme);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginManager(page, fixture.manager);
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 700 ? 812 : 900 });
      const base = `${phase}-manager-${width}-${theme}`;
      await step(`${base} dashboard`, async () => { await goSection(page, "Painel"); await shot(page, `${base}-1-home`); });
      await step(`${base} jobs`, async () => { await goSection(page, "Serviços"); await shot(page, `${base}-2-services`); });
      await step(`${base} job`, async () => {
        await page.getByRole("button", { name: /Juniper Loft/ }).first().click();
        await settle(page);
        await page.waitForTimeout(800);
        await shot(page, `${base}-3-job-interest`);
      });
      await step(`${base} inbox`, async () => { await openInbox(page); await page.waitForTimeout(800); await shot(page, `${base}-4-inbox`); });
    }
    await context.close();
  });

  test(`cleaner screens ${theme}`, async ({ browser }) => {
    test.skip(Boolean(only) && !only.some((key) => ["today", "scheduled", "job"].includes(key)), "manager-only rerun");
    const context = await browser.newContext({ locale: "pt-BR", colorScheme: theme, serviceWorkers: "block", baseURL: "http://127.0.0.1:15281" });
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    if (theme === "light") await signInCleaner(page, fixture.cleanerCode);
    else {
      // The access code is single-use: reuse the light session's storage is not possible across contexts,
      // so dark issues its own code through the same manager callable.
      const { managerCall } = await import("./fixtures.js");
      const { code } = await managerCall(fixture.manager, "issueCleanerAccessCode", { cleanerId: fixture.jobId("ana") });
      await signInCleaner(page, code);
    }
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
      const base = `${phase}-cleaner-${width}-${theme}`;
      await step(`${base} today`, async () => { await page.getByRole("button", { name: /^Hoje/ }).first().click(); await shot(page, `${base}-1-today`); });
      await step(`${base} scheduled`, async () => { await page.getByRole("button", { name: /^Agendadas|^Próximas/ }).first().click(); await shot(page, `${base}-2-scheduled`); });
      await step(`${base} job`, async () => {
        await page.getByRole("button", { name: /^Hoje/ }).first().click();
        await page.locator("[data-job-id]").first().click();
        await page.waitForTimeout(700);
        await shot(page, `${base}-3-job`);
        const back = page.getByRole("button", { name: /Voltar|Agenda/ }).first();
        if (await back.isVisible().catch(() => false)) await back.click();
      });
    }
    await context.close();
  });

  test(`checklist screens ${theme}`, async ({ browser }) => {
    test.skip(Boolean(only) && !only.includes("checklist"), "not requested");
    const context = await browser.newContext({ locale: "pt-BR", colorScheme: theme, serviceWorkers: "block", baseURL: "http://127.0.0.1:15281" });
    const page = await context.newPage();
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
      await page.goto(`/checklist?t=${encodeURIComponent(fixture.checklistToken)}`);
      await page.waitForTimeout(1500);
      await shot(page, `${phase}-cleaner-${width}-${theme}-4-checklist`);
    }
    await context.close();
  });
}
