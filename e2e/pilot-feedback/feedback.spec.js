// Interface checks for the Pilot feedback (FB01–FB04, FB06) on the real
// components with fictitious data. Desktop Chromium + WebKit iPhone 13.
import { expect, test } from "@playwright/test";
import { noHorizontalScroll, providerCalls, watchNetwork } from "./support.js";

test.describe("FB03 — manager decision on interested cleaners", () => {
  test("one interested: decision first, confirmation assigns through the Offer path", async ({ page }) => {
    const external = watchNetwork(page);
    await page.goto("/?screen=manager&scenario=one&lang=pt");
    await expect(page.getByRole("button", { name: "Próximo passo: Confirmar cleaner interessada" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Próximo passo: Atribuir cleaner/ })).toHaveCount(0);
    const panel = page.getByTestId("interest-decision");
    await expect(panel).toContainText("1 cleaner(s) com interesse");
    await expect(panel).toContainText("Interesse não atribui o serviço.");
    await expect(panel).not.toContainText("Bia Exemplo");
    await page.getByRole("button", { name: "Próximo passo: Confirmar cleaner interessada" }).click();
    await expect(panel).toBeFocused();
    await panel.getByRole("button", { name: "Confirmar Ana Exemplo" }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".service-cleaner-summary")).toContainText("Ana Exemplo");
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(1);
    expect(external).toEqual([]);
  });

  test("several interested: each one listed, nothing assigned by opening", async ({ page }) => {
    await page.goto("/?screen=manager&scenario=several&lang=pt");
    await expect(page.getByRole("button", { name: "Próximo passo: Revisar interessadas" })).toBeVisible();
    await expect(page.getByTestId("interest-decision").getByRole("button", { name: /^Confirmar / })).toHaveCount(2);
    await expect(page.locator(".service-cleaner-summary")).toContainText("Não atribuída");
  });

  test("zero interested: no decision panel; primary follows the offer state", async ({ page }) => {
    await page.goto("/?screen=manager&scenario=none&lang=pt");
    await expect(page.getByTestId("interest-decision")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Próximo passo: Ver ofertas aguardando resposta" })).toBeVisible();
  });

  test("manual assignment is a secondary exception that opens the existing picker", async ({ page }) => {
    await page.goto("/?screen=manager&scenario=one&lang=pt");
    await page.getByRole("button", { name: "Atribuir outra pessoa manualmente" }).click();
    await expect(page.getByRole("group", { name: "Cleaners encontradas" })).toBeVisible();
  });

  test("opening from an interest notice focuses the decision", async ({ page }) => {
    await page.goto("/?screen=manager&scenario=one&lang=pt&focus=interest");
    await expect(page.getByTestId("interest-decision")).toBeFocused();
  });
});

test.describe("FB02/FB04/FB01 — cleaner hub", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?screen=hub&lang=pt");
    await page.locator('[data-job-id="job-1"]').first().waitFor();
  });

  test("every future service is reachable, all together or month by month", async ({ page }) => {
    const external = watchNetwork(page);
    await expect(page.getByRole("button", { name: "Agendadas depois de hoje: 8 serviço(s)" })).toBeVisible();
    await page.getByRole("button", { name: /^Agendadas/ }).click();
    await expect(page.getByTestId("scheduled-summary")).toContainText("8 serviço(s) confirmado(s) depois de hoje. Todos aparecem abaixo.");
    const ids = () => page.locator(".hb-main [data-job-id]").evaluateAll((els) => els.map((el) => el.getAttribute("data-job-id")));
    const all = await ids();
    expect(all).toHaveLength(8);
    await page.getByRole("button", { name: "Por mês" }).click();
    const seen = [];
    const next = page.getByRole("button", { name: "Próximo mês com serviços" });
    for (;;) {
      seen.push(...(await ids()));
      if (await next.isDisabled()) break;
      await next.click();
    }
    expect([...seen].sort()).toEqual([...all].sort());
    expect(new Set(seen).size).toBe(seen.length);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(1);
    expect(external).toEqual([]);
  });

  test("pending checklists are visible without push; submitted is not pending", async ({ page }) => {
    const notice = page.getByTestId("checklist-pending");
    await expect(notice).toContainText("2 checklist(s) para preencher");
    await expect(notice).not.toContainText(/atrasad/i);
    await expect(page.locator('[data-job-id="job-1"] [data-checklist-state="available"]')).toContainText("Checklist disponível");
    await page.getByRole("button", { name: /^Agendadas/ }).click();
    await expect(page.locator('[data-job-id="job-2"] [data-checklist-state="started"]')).toContainText("Iniciado · falta enviar");
    await expect(page.locator('[data-job-id="job-3"] [data-checklist-state]')).toHaveCount(0);
  });

  test("service detail: checklist action, access section, collapsed record", async ({ page }) => {
    await page.locator('[data-job-id="job-1"]').first().click();
    await expect(page.locator('.hb-checkcard[data-checklist-state="available"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Começar checklist" })).toBeVisible();
    await expect(page.locator('.hb-access[data-access-state="available"]')).toContainText("Portão da garagem");
    const house = page.locator("details.hb-house");
    await expect(house).not.toHaveAttribute("open", "");
    await house.locator("summary").click();
    await expect(house).toContainText("Toalhas usadas vão para o cesto");
    const record = page.locator("details.hb-record");
    await expect(record).not.toHaveAttribute("open", "");
    await record.locator("summary").click();
    await expect(record).toContainText("Ciência");
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(1);
    const small = await page.locator(".hb-main button, .hb-main summary").evaluateAll((els) =>
      els.filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height < 40).map((el) => el.textContent.trim()));
    expect(small).toEqual([]);
    expect(await providerCalls(page)).toEqual([]);
  });

  test("revoked access shows no access data", async ({ page }) => {
    await page.goto("/?screen=hub&lang=pt&access=revoked");
    await page.locator('[data-job-id="job-1"]').first().click();
    await expect(page.locator('.hb-access[data-access-state="revoked"]')).toContainText("Você não está mais neste serviço");
    await expect(page.getByText("Portão da garagem")).toHaveCount(0);
  });

  test("without the access read the screen says where access still comes from", async ({ page }) => {
    await page.goto("/?screen=hub&lang=pt&access=none");
    await page.locator('[data-job-id="job-1"]').first().click();
    await expect(page.locator('.hb-access[data-access-state="unsupported"]')).toContainText("continuam vindo da gerente");
  });
});

test.describe("FB06 — photo guidance", () => {
  test("guidance no longer suggests one photo is enough", async ({ page }) => {
    await page.goto("/?screen=checklist&photos=16&lang=pt");
    const gallery = page.locator(".checklist-photo-gallery");
    await expect(gallery).toContainText("Adicione todas as fotos que este checklist pede.");
    await expect(gallery).not.toContainText("Salve uma foto obrigatória de pertences");
    await expect(gallery).toContainText("16 fotos salvas");
    await expect(page.getByTestId("photo-requirements")).toHaveCount(0);
  });

  test("an example requirement list is marked as not published", async ({ page }) => {
    await page.goto("/?screen=checklist&photos=3&requirements=1&lang=pt");
    const list = page.getByTestId("photo-requirements");
    await expect(list).toContainText("Exemplo — lista não publicada");
    await expect(list).toContainText("2 de 5 feitas");
    await expect(list.locator('[data-requirement="req-towels"]')).toContainText("Faltando");
  });
});
