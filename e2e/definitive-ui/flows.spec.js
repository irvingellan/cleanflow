import { appendFileSync, mkdirSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { db, organizationId, seedOperation } from "./fixtures.js";
import { goSection, loginManager, managerContext, settle, signInCleaner } from "./support.js";

// Task flows on the real build against isolated emulators, synthetic data only.
// Every user action goes through tap(), so the click/screen counts are measured.
const metricsDir = process.env.DEFINITIVE_UI_SHOTS || "test-results/definitive-ui/shots";
const profile = process.env.DEFINITIVE_UI_DEVICE === "iphone"
  ? { ...devices["iPhone 13"], name: "iphone13-profile" }
  : { viewport: { width: 1440, height: 900 }, name: "chromium-1440" };
let fixture;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { fixture = await seedOperation(); });

function counter(name) {
  const record = { flow: name, device: profile.name, clicks: 0, screens: 1 };
  return {
    record,
    async tap(locator, { newScreen = false } = {}) {
      await locator.click();
      record.clicks += 1;
      if (newScreen) record.screens += 1;
      await settle(locator.page());
    },
    save() {
      mkdirSync(metricsDir, { recursive: true });
      appendFileSync(`${metricsDir}/flow-metrics.jsonl`, `${JSON.stringify(record)}\n`);
    },
  };
}

async function managerPage(browser, theme = "light") {
  const extra = profile.name === "iphone13-profile" ? { ...devices["iPhone 13"] } : { viewport: profile.viewport };
  const context = await managerContext(browser, theme, extra);
  const page = await context.newPage();
  await loginManager(page, fixture.manager);
  return { context, page };
}

test("1 · manager opens CleanFlow and sees what needs her, without state jargon first", async ({ browser }) => {
  const { context, page } = await managerPage(browser);
  const run = counter("see priorities");
  const attention = page.getByRole("region", { name: "Precisa de atenção" });
  await expect(attention.getByRole("button", { name: /Juniper Loft.*Revisar interessadas/ })).toBeVisible();
  await expect(attention.getByRole("button", { name: /Maple Studio.*Enviar ofertas/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Prontos para você revisar" }).getByText("Cedar Cottage")).toBeVisible();
  // Counts are filters over the loaded operation, never a global total.
  await expect(page.getByRole("button", { name: /Hoje\s*3/ })).toBeVisible();
  run.save();
  await context.close();
});

test("2 · finds a Job for today through Services and keeps the list beside it", async ({ browser }) => {
  const { context, page } = await managerPage(browser);
  const run = counter("find today's job");
  await goSection(page, "Serviços");
  run.record.clicks += 1; run.record.screens += 1;
  await run.tap(page.getByRole("button", { name: "Hoje", exact: true }));
  await expect(page.getByRole("button", { name: /Juniper Loft/ })).toBeVisible();
  await run.tap(page.getByRole("button", { name: /Juniper Loft/ }).first(), { newScreen: true });
  await expect(page.getByRole("heading", { name: "Juniper Loft", level: 2 })).toBeVisible();
  if ((page.viewportSize()?.width || 0) >= 1280) {
    const pane = page.getByRole("complementary", { name: "Serviços" });
    await expect(pane.getByRole("button", { name: /Maple Studio/ })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Hoje", exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  run.save();
  await context.close();
});

test("desktop Services pane keeps the Job open when its worklist query changes or returns empty", async ({ browser }) => {
  test.skip(profile.name !== "chromium-1440", "desktop Services split pane");
  const { context, page } = await managerPage(browser);
  try {
    await goSection(page, "Serviços");
    await page.getByRole("button", { name: "Hoje", exact: true }).click();
    const jobSelector = (key) => `[data-job-id="${fixture.jobId(key)}"]`;
    await expect(page.locator(jobSelector("juniperNextMonth"))).toHaveCount(0);
    await page.locator(jobSelector("juniperToday")).click();
    const pane = page.getByRole("complementary", { name: "Serviços" });
    const detail = page.getByRole("heading", { name: "Juniper Loft", level: 2 });
    const today = pane.getByRole("button", { name: "Hoje", exact: true });
    const completed = pane.getByRole("button", { name: "Concluídos", exact: true });
    const job = (key) => pane.locator(jobSelector(key));
    await expect(job("harborToday")).toBeVisible();

    await completed.click();
    await expect(completed).toHaveAttribute("aria-pressed", "true");
    await expect(pane.getByText("Nenhum serviço encontrado.")).toBeVisible();
    await expect(detail).toBeVisible();

    await today.click();
    await expect(job("mapleDone")).toBeVisible();
    await expect(job("mapleToday")).toHaveCount(0);
    await expect(job("harborToday")).toHaveCount(0);
    await expect(detail).toBeVisible();

    await completed.click();
    await today.click();
    await expect(today).toHaveAttribute("aria-pressed", "true");
    await expect(job("harborToday")).toBeVisible();
    await expect(job("juniperToday")).toHaveAttribute("aria-current", "true");
    await expect(job("mapleDone")).toHaveCount(0);
    await expect(detail).toBeVisible();
  } finally {
    await context.close();
  }
});

test("3 · two cleaners are interested; the manager confirms one, interest never assigns by itself", async ({ browser }) => {
  const { context, page } = await managerPage(browser);
  const run = counter("confirm one interested cleaner");
  const jobRef = db.doc(`organizations/${organizationId}/jobs/${fixture.jobId("juniperToday")}`);
  expect((await jobRef.get()).data().assignedCleanerIds).toEqual([]);
  await run.tap(page.getByRole("button", { name: /Juniper Loft.*Revisar interessadas/ }), { newScreen: true });
  const decision = page.getByTestId("interest-decision");
  await expect(decision.getByRole("heading", { name: "2 cleaner(s) com interesse" })).toBeVisible();
  await expect(decision.getByRole("button", { name: "Confirmar Bia Lima" })).toBeVisible();
  await run.tap(decision.getByRole("button", { name: "Confirmar Carla Mendes" }));
  await expect.poll(async () => (await jobRef.get()).data().assignedCleanerIds, { timeout: 20_000 }).toEqual([fixture.jobId("carla")]);
  // Team Jobs stay possible (same rule as the Offers "Assign" button): the confirmed
  // cleaner leaves the decision list; any other interested cleaner remains a choice.
  await expect(page.getByRole("button", { name: "Confirmar Carla Mendes" })).toHaveCount(0);
  run.save();
  await context.close();
});

test("4 · the same decision opens from the Inbox with its own action", async ({ browser }) => {
  const { context, page } = await managerPage(browser);
  const run = counter("inbox to decision");
  const inboxButton = page.getByRole("button", { name: /Caixa de entrada|Avisos/ }).first();
  await run.tap(inboxButton, { newScreen: true });
  await expect(page.getByRole("heading", { name: "Caixa de entrada", level: 2 })).toBeVisible();
  const card = page.locator(".cf-notice").filter({ hasText: "Cleaner demonstrou interesse" }).first();
  await expect(card.getByRole("button", { name: "Revisar interessadas" })).toBeVisible();
  await expect(page.locator(".cf-notice").filter({ hasText: "Checklist pronto para revisão" }).getByRole("button", { name: "Revisar checklist" })).toBeVisible();
  await run.tap(card.getByRole("button", { name: "Revisar interessadas" }), { newScreen: true });
  await expect(page.getByRole("heading", { name: "Juniper Loft", level: 2 })).toBeVisible();
  await expect(page.getByTestId("interest-decision")).toBeVisible();
  run.save();
  await context.close();
});

test("5 · checklist ready for review is reachable from Home in one action", async ({ browser }) => {
  const { context, page } = await managerPage(browser);
  const run = counter("review ready checklist");
  await run.tap(page.getByRole("region", { name: "Prontos para você revisar" }).getByRole("button", { name: /Cedar Cottage/ }), { newScreen: true });
  await expect(page.getByRole("heading", { name: "Cedar Cottage", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: /Próximo passo: Revisar checklist/ })).toBeVisible();
  run.save();
  await context.close();
});

test("6 · language and theme live in the account menu and persist", async ({ browser }) => {
  const { context, page } = await managerPage(browser);
  await page.getByRole("button", { name: /^Conta:/ }).click();
  await page.getByRole("button", { name: "Ativar modo escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "Idioma" }).selectOption("en");
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
  await context.close();
});

test("7 · keyboard: skip-free tab order reaches navigation and the first decision with a visible focus ring", async ({ browser }) => {
  test.skip(profile.name !== "chromium-1440", "desktop keyboard path");
  const { context, page } = await managerPage(browser);
  await page.keyboard.press("Tab");
  let reachedDecision = false;
  for (let index = 0; index < 30 && !reachedDecision; index += 1) {
    await page.keyboard.press("Tab");
    reachedDecision = await page.evaluate(() => document.activeElement?.classList.contains("cf-queue-row"));
  }
  expect(reachedDecision).toBe(true);
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  expect(outline).not.toBe("none");
  await context.close();
});

test("8 · cleaner sees every future Job by month, opens one, and nothing private leaks", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone 13"], locale: "pt-BR", serviceWorkers: "block", baseURL: "http://127.0.0.1:15281" });
  const page = await context.newPage();
  await signInCleaner(page, fixture.cleanerCode);
  const run = counter("cleaner future schedule");
  await run.tap(page.getByRole("button", { name: /^Agendadas/ }).first());
  for (const name of ["Cedar Cottage", "Pine Ridge Cabin", "Harbor House", "Juniper Loft"]) {
    await expect(page.locator("[data-job-id]").filter({ hasText: name }).first()).toBeVisible();
  }
  const text = await page.locator("body").innerText();
  for (const secret of ["synthetic-private", "180", "110", "Bia Lima", "Carla Mendes"]) expect(text).not.toContain(secret);
  await run.tap(page.locator("[data-job-id]").first(), { newScreen: true });
  await expect(page.getByRole("button", { name: /checklist/i }).first()).toBeVisible();
  run.save();
  await context.close();
});

test("9 · offline manager never sees a false success", async ({ browser }) => {
  const { context, page } = await managerPage(browser);
  await context.setOffline(true);
  await page.getByRole("button", { name: /Atualizar painel/ }).click();
  await expect(page.getByText(/Não foi possível carregar o painel|Carregando painel/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Nenhum item precisa de atenção agora.")).toHaveCount(0);
  await context.setOffline(false);
  await context.close();
});
