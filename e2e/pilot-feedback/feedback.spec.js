// Interface checks for the Pilot feedback (FB01–FB04, FB06) on the real
// components with fictitious data. Desktop Chromium + WebKit iPhone 13.
import { expect, test, noHorizontalScroll, providerCalls, watchNetwork } from "./support.js";

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

  test("prepared checklist states stay an explicitly labelled future-contract preview", async ({ page }) => {
    await page.goto("/?screen=hub&lang=pt&checklistPreview=1&scenario=submitted");
    await expect(page.getByTestId("synthetic-strip")).toContainText("contrato futuro não publicado");
    const notice = page.getByTestId("checklist-pending");
    await expect(notice).toContainText("2 checklist(s) para preencher");
    await expect(notice).not.toContainText(/atrasad/i);
    await expect(page.locator('[data-job-id="job-1"] [data-checklist-state="available"]')).toContainText("Checklist disponível");
    await page.getByRole("button", { name: /^Agendadas/ }).click();
    await expect(page.locator('[data-job-id="job-2"] [data-checklist-state="started"]')).toContainText("Iniciado · falta enviar");
    await expect(page.locator('[data-job-id="job-3"] [data-checklist-state]')).toHaveCount(0);
  });

  test("Release A detail preserves the existing checklist action, safe access placeholder and collapsed record", async ({ page }) => {
    await page.locator('[data-job-id="job-1"]').first().click();
    await expect(page.getByRole("button", { name: "Abrir checklist" })).toBeVisible();
    await expect(page.locator('.hb-access[data-access-state="unsupported"]')).toContainText("continuam vindo da gerente");
    await expect(page.locator("details.hb-house")).toHaveCount(0);
    const record = page.locator("details.hb-record");
    await expect(record).not.toHaveAttribute("open", "");
    await record.locator("summary").click();
    await expect(record).toContainText("Ciência");
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(1);
    const small = await page.locator(".hb-main button, .hb-main summary").evaluateAll((els) =>
      els.filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height < 40).map((el) => el.textContent.trim()));
    expect(small).toEqual([]);
    const inboxTrigger = page.getByRole("button", { name: /^Caixa de entrada/ });
    const triggerBox = await inboxTrigger.boundingBox();
    const badgeBox = await inboxTrigger.locator(".mw-badge").boundingBox();
    expect(badgeBox.x).toBeGreaterThanOrEqual(triggerBox.x);
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(triggerBox.x + triggerBox.width + 1);
    expect(badgeBox.y).toBeGreaterThanOrEqual(triggerBox.y);
    expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(triggerBox.y + triggerBox.height + 1);
    expect(await providerCalls(page)).toEqual([]);
  });

  test("Release A has no inferred pending-checklist claims without the server projection", async ({ page }) => {
    await expect(page.getByTestId("checklist-pending")).toHaveCount(0);
    await expect(page.locator('[data-job-id="job-1"] [data-checklist-state]')).toHaveCount(0);
    expect(await providerCalls(page)).toEqual([]);
  });

  test("Inbox job link opens the safe updated detail and distinguishes loaded counts", async ({ page }) => {
    await page.goto("/?screen=hub&lang=pt&inbox=1");
    await expect(page.getByRole("heading", { name: "Caixa de entrada" })).toBeVisible();
    await expect(page.getByText("2 não lido(s) nos avisos carregados").last()).toBeVisible();
    await expect(page.getByText("Há avisos anteriores por carregar. O total de não lidos ainda é desconhecido.")).toBeVisible();
    await page.locator("li").filter({ has: page.getByRole("heading", { name: "Serviço confirmado", exact: true }) }).getByRole("button", { name: "Abrir", exact: true }).click();
    await expect(page.getByRole("button", { name: "Abrir checklist" })).toBeVisible();
    await expect(page.locator('.hb-access[data-access-state="unsupported"]')).toBeVisible();
    expect(await providerCalls(page)).toEqual([]);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(1);
  });

  test("Inbox offer link preserves the manual interest action", async ({ page }) => {
    await page.goto("/?screen=hub&lang=pt&inbox=1");
    await page.locator("li").filter({ has: page.getByRole("heading", { name: "Nova oferta", exact: true }) }).getByRole("button", { name: "Abrir", exact: true }).click();
    await expect(page.getByRole("button", { name: /Tenho interesse/i })).toBeVisible();
    expect(await providerCalls(page)).toEqual([]);
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
