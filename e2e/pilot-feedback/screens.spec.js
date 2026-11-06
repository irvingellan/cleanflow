// Integrated Release A screenshots, with synthetic fixtures and safe access only.
// Output: $PILOT_SHOTS_DIR/<variant>/<project>-<name>.png (fictitious data).
import path from "node:path";
import { test, isMobile } from "./support.js";

const variant = process.env.PILOT_VARIANT || "after";
const dir = process.env.PILOT_SHOTS_DIR || path.resolve("test-results/pilot-feedback-shots");
const shot = (page, testInfo, name, options = {}) => page.screenshot({ path: path.join(dir, variant, `${testInfo.project.name}-${name}.png`), ...options });

async function openHub(page, query = "") {
  await page.goto(`/?screen=hub&lang=pt${query}`);
  await page.locator('[data-job-id="job-1"]').first().waitFor();
}

async function showGallery(page) {
  await page.locator(".checklist-photo-gallery").waitFor();
  await page.evaluate(() => {
    document.querySelector(".checklist-photo-gallery").scrollIntoView({ block: "start" });
    const stickyStatus = document.querySelector(".public-checklist__save-status");
    window.scrollBy(0, -(stickyStatus?.getBoundingClientRect().height || 0) - 20);
  });
}

test("FB03 manager — one interested cleaner", async ({ page }, testInfo) => {
  await page.goto("/?screen=manager&scenario=one&lang=pt");
  await page.locator(".job-intents").waitFor();
  await shot(page, testInfo, "fb03-manager-one-interested", { fullPage: isMobile(testInfo) });
});

test("FB03 manager — several interested cleaners", async ({ page }, testInfo) => {
  await page.goto("/?screen=manager&scenario=several&lang=pt");
  await page.locator(".job-intents").waitFor();
  await shot(page, testInfo, "fb03-manager-several-interested", { fullPage: isMobile(testInfo) });
});

test("FB02/FB04 cleaner — agenda today", async ({ page }, testInfo) => {
  await openHub(page);
  await shot(page, testInfo, "fb04-hub-today");
});

test("FB02 cleaner — scheduled list", async ({ page }, testInfo) => {
  await openHub(page);
  await page.locator(".hb-seg button").nth(1).click();
  await shot(page, testInfo, "fb02-hub-scheduled");
  const byMonth = page.locator('[data-sched-mode="month"]');
  if (await byMonth.count()) {
    await byMonth.click();
    await shot(page, testInfo, "fb02-hub-scheduled-by-month");
  }
});

test("FB01/FB04 cleaner — service detail", async ({ page }, testInfo) => {
  await openHub(page);
  await page.locator('[data-job-id="job-1"]').first().click();
  await page.locator(".hb-checkcard").waitFor();
  await page.waitForTimeout(400);
  await shot(page, testInfo, "fb01-hub-job-detail");
  await page.locator(".hb-access").scrollIntoViewIfNeeded();
  await shot(page, testInfo, "fb01-hub-job-safe-access");
});

test("Release A cleaner — Inbox", async ({ page }, testInfo) => {
  await page.goto("/?screen=hub&lang=pt&inbox=1");
  await page.getByRole("heading", { name: "Caixa de entrada" }).waitFor();
  await shot(page, testInfo, "inbox-loaded-count");
});

test("FB06 checklist — 16 photos guidance", async ({ page }, testInfo) => {
  await page.goto("/?screen=checklist&photos=16&lang=pt");
  await showGallery(page);
  await shot(page, testInfo, "fb06-checklist-guidance");
});

test("FB06 checklist — example photo requirement list", async ({ page }, testInfo) => {
  await page.goto("/?screen=checklist&photos=3&requirements=1&lang=pt");
  await showGallery(page);
  await shot(page, testInfo, "fb06-checklist-requirements");
});

test("Client report — public page for the client", async ({ page }, testInfo) => {
  await page.goto("/?screen=report&lang=pt");
  await page.getByRole("heading", { name: "Relatório de limpeza" }).waitFor();
  await shot(page, testInfo, "report-client-top");
  await shot(page, testInfo, "report-client-full", { fullPage: true });
  await page.getByRole("button", { name: "Abrir foto 2" }).click();
  await page.getByRole("dialog").waitFor();
  await shot(page, testInfo, "report-client-photo-viewer");
});

test("Client report — manager prepares and sends", async ({ page }, testInfo) => {
  await page.goto("/?screen=report-manager&lang=pt");
  const note = page.getByLabel("Mensagem para o cliente (opcional)");
  await note.fill("Tudo pronto para a chegada de sexta. Deixamos toalhas extras no armário do corredor.");
  await shot(page, testInfo, "report-manager-prepare", { fullPage: true });
  await page.getByRole("button", { name: "Criar relatório para o cliente" }).click();
  await page.getByTestId("client-report-send").waitFor();
  await shot(page, testInfo, "report-manager-send", { fullPage: true });
  await page.getByRole("button", { name: "Copiar link do relatório" }).click().catch(() => {});
  await page.getByRole("button", { name: "Sim, marcar como enviado" }).click();
  await page.getByText(/enviado em/).waitFor();
  await shot(page, testInfo, "report-manager-sent", { fullPage: true });
});

test("Photos — manager checklist grid and viewer", async ({ page }, testInfo) => {
  await page.goto("/?screen=checklist-manager&lang=pt");
  const grid = page.locator(".photo-grid");
  await grid.scrollIntoViewIfNeeded();
  await page.locator(".photo-grid__tile img").nth(5).waitFor();
  await page.waitForTimeout(400);
  await shot(page, testInfo, "photos-grid");
  await page.getByRole("button", { name: /^Abrir foto 4:/ }).click();
  await page.locator(".photo-lightbox__image.is-loaded").waitFor();
  await page.waitForTimeout(400);
  await shot(page, testInfo, "photos-viewer");
  await page.keyboard.press("ArrowRight");
  await page.getByRole("dialog", { name: "Foto 5 de 24" }).waitFor();
});

test("Photos — services list with photo counts", async ({ page }, testInfo) => {
  await page.goto("/?screen=services&lang=pt");
  await page.getByText("42").first().waitFor();
  await shot(page, testInfo, "services-photo-counts");
  await page.getByRole("button", { name: "Com fotos" }).click();
  await shot(page, testInfo, "services-with-photos");
});
