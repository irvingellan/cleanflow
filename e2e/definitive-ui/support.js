import { expect } from "@playwright/test";

export const widths = [375, 390, 768, 980, 1280, 1440];
export const themes = ["light", "dark"];
export const shotDir = process.env.DEFINITIVE_UI_SHOTS || "test-results/definitive-ui/shots";

export async function settle(page) {
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  // Firestore keeps a channel open, so "network idle" never settles; wait for visible loading copy instead.
  await page.waitForFunction(() => !/Carregando|Verificando|Loading/.test(document.body.innerText.slice(0, 4000)), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
}

export async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: `${shotDir}/${name}.png`, fullPage: true, animations: "disabled" });
}

export async function managerContext(browser, theme, extra = {}) {
  const context = await browser.newContext({ ...extra, locale: "pt-BR", colorScheme: theme, serviceWorkers: "block", baseURL: "http://127.0.0.1:15281" });
  await context.addInitScript((value) => {
    try {
      // Seed once per context; later page loads keep what the user chose.
      if (!window.sessionStorage.getItem("definitive-ui-seeded")) {
        window.localStorage.setItem("cleanflow-manager-theme", value);
        window.localStorage.setItem("cleanflow-language", "pt");
        window.sessionStorage.setItem("definitive-ui-seeded", "1");
      }
    } catch { /* storage may be blocked */ }
  }, theme);
  return context;
}

export async function loginManager(page, manager) {
  await page.goto("/");
  await page.locator('input[name="email"]').fill(manager.email);
  await page.locator('input[name="password"]').fill(manager.password);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('input[name="password"]')).toHaveCount(0, { timeout: 30_000 });
  await settle(page);
}

/** Works with the legacy header nav and with the shell (sidebar, rail or bottom tabs + More). */
export async function goSection(page, label) {
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const direct = nav.getByRole("button", { name: label, exact: true }).or(nav.getByRole("link", { name: label, exact: true }));
  if (await direct.first().isVisible().catch(() => false)) {
    await direct.first().click();
  } else {
    await page.getByRole("button", { name: "Mais", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
  }
  await settle(page);
}

export async function openInbox(page) {
  const button = page.getByRole("button", { name: /Caixa de entrada|Avisos/ }).first();
  await button.scrollIntoViewIfNeeded().catch(() => {});
  await button.click({ force: true });
  await settle(page);
}

export async function signInCleaner(page, code) {
  await page.goto("/agenda");
  const anyway = page.getByRole("button", { name: "Entrar aqui no Safari mesmo assim" });
  const codeField = page.getByLabel("Código de acesso (12 letras e números)");
  await expect(anyway.or(codeField).first()).toBeVisible({ timeout: 20_000 });
  if (await anyway.isVisible().catch(() => false)) await anyway.click();
  await page.getByLabel("Código de acesso (12 letras e números)").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Estas são as suas próximas limpezas" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Fazer depois (a agenda funciona no navegador)" }).click();
  await page.getByRole("button", { name: "Ver minha agenda" }).click();
  await settle(page);
}
