import { expect, test } from "@playwright/test";
for (const width of [1440, 390]) test(`real Job Detail intents at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  const externalRequests = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:5189" && !url.pathname.startsWith("/api/")) return route.continue();
    // The cleaner picker reads schedule and history when it opens. This page has no
    // backend: the read is refused here, so it never reaches a local emulator.
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith(":runQuery")) externalRequests.push(url.href);
    return route.abort();
  });
  await page.addInitScript(() => localStorage.setItem("cleanflow-language", "pt"));
  await page.goto("/e2e/intent/job-detail.html");
  const scenario = page.getByLabel("Local synthetic scenario");
  const intentions = page.getByRole("region", { name: "O que você quer fazer?" });
  const chooseIntent = async (action) => {
    const choice = intentions.getByRole("button", { name: `Escolher intenção: ${action}` });
    if (!await choice.isVisible()) await intentions.getByText("Mais ações", { exact: true }).click();
    await choice.click();
  };
  // Offer first: an unassigned service suggests offering it (docs/PILOT_FEEDBACK_UX_V1.md, FB03).
  await expect(intentions.getByRole("button", { name: "Próximo passo: Oferecer limpeza para cleaners" })).toBeVisible();
  await chooseIntent("Atribuir / trocar cleaner");
  await expect(page.getByRole("radio", { name: "Alex Demo" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar cleaners por nome" }).fill("ing");
  await expect(page.getByRole("radio", { name: "Karina Demo" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Ingrid Inactive" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirmar atribuição" })).toBeDisabled();
  await page.getByRole("radio", { name: "Ingrid Demo" }).check();
  await expect(page.getByText("Selecionada para atribuição: Ingrid Demo", { exact: true })).toBeVisible();
  await expect(page.getByText("A atribuição só será feita depois de confirmar.", { exact: true })).toBeVisible();
  await expect(page.getByText("Nenhuma cleaner atribuída ainda.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Atribuir cleaner", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirmar atribuição" })).toBeEnabled();
  const result = page.locator(".direct-cleaner-picker__option");
  expect((await result.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("searchbox").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `artifacts/visual-smoke/direct-cleaner-picker-${width}.png` });
  await scenario.selectOption("assigned");
  await expect(intentions.getByRole("button", { name: "Próximo passo: Preparar lembrete" })).toBeVisible();
  await chooseIntent("Alterar data / horário");
  await expect(page.getByRole("button", { name: "Salvar horário" })).toBeVisible();
  await scenario.selectOption("draft");
  await chooseIntent("Alterar data / horário");
  await expect(intentions.getByRole("status")).toContainText("Não apague e recrie o serviço");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `artifacts/visual-smoke/job-detail-intent-${width}-draft.png` });
  await intentions.getByRole("status").getByRole("button", { name: "Abrir checklist existente" }).click();
  await expect(page.getByText("Existing Run open callback reached (synthetic).")).toBeVisible();
  await scenario.selectOption("ready");
  await expect(intentions.getByRole("button", { name: "Próximo passo: Revisar checklist" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Excluir", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `artifacts/visual-smoke/job-detail-intent-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText("Histórico e administração", { exact: true }).click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(page.getByRole("group", { name: "Excluir da visualização?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await scenario.selectOption("completed");
  // A completed service is read-only: one saved-service step and no operational intents.
  await expect(intentions.getByRole("button", { name: /^Escolher intenção:/ })).toHaveCount(0);
  await intentions.getByRole("button", { name: "Próximo passo: Ver serviço salvo" }).click();
  await expect(intentions.getByRole("status")).toContainText("histórico");
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
