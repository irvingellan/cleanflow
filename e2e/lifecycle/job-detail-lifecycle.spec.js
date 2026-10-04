import { expect, test } from "@playwright/test";

const primaryLabels = {
  unassigned: "Próximo passo: Atribuir cleaner",
  offered: "Próximo passo: Atribuir cleaner",
  assigned: "Próximo passo: Preparar lembrete",
  "assigned-draft": "Próximo passo: Abrir checklist existente",
  "in-progress": "Próximo passo: Abrir checklist existente",
  ready: "Próximo passo: Revisar checklist",
  completed: "Próximo passo: Ver serviço salvo",
  stale: "Próximo passo: Abrir checklist existente",
  "open-issue": "Próximo passo: Abrir checklist existente",
  unknown: "Próximo passo: Checklist",
  archived: "Próximo passo: Ver serviço salvo",
  "direct-assigned": "Próximo passo: Preparar lembrete",
  "direct-in-progress": "Próximo passo: Abrir checklist existente",
  "completed-with-started": "Próximo passo: Ver serviço salvo",
  "completed-without-started": "Próximo passo: Ver serviço salvo",
  "completed-reviewed": "Próximo passo: Ver serviço salvo",
  "offer-error": "Próximo passo: Preparar lembrete",
};

const expectedStates = {
  unassigned: ["current", "future", "future", "future", "future"],
  offered: ["completed", "current", "future", "future", "future"],
  assigned: ["completed", "skipped", "current", "future", "future"],
  "assigned-draft": ["completed", "skipped", "current", "future", "future"],
  "in-progress": ["completed", "skipped", "completed", "current", "future"],
  ready: ["completed", "skipped", "completed", "current", "future"],
  completed: ["completed", "skipped", "completed", "completed", "current"],
  stale: ["completed", "skipped", "current", "future", "future"],
  "open-issue": ["completed", "skipped", "completed", "current", "future"],
  archived: ["completed", "skipped", "completed", "current", "future"],
  "direct-assigned": ["completed", "skipped", "current", "future", "future"],
  "direct-in-progress": ["completed", "skipped", "completed", "current", "future"],
  "completed-with-started": ["completed", "skipped", "completed", "completed", "current"],
  "completed-without-started": ["completed", "skipped", "completed", "skipped", "current"],
  "completed-reviewed": ["completed", "skipped", "completed", "completed", "current"],
  "offer-error": ["completed", "unknown-past", "current", "future", "future"],
};

const positionLabels = {
  completed: "Etapa comprovada", current: "Atual", future: "Próxima",
  skipped: "Não usado", "unknown-past": "Histórico não verificado",
};

async function expectIntentControls(page, scenario) {
  const intentions = page.locator(".job-intents");
  const historical = ["completed", "completed-with-started", "completed-without-started", "completed-reviewed", "archived"].includes(scenario);
  await expect(intentions.locator(".job-intents__next button")).toBeVisible();
  const heading = intentions.getByRole("heading", { name: "O que você quer fazer?", exact: true });
  const grid = intentions.locator(".job-intents__actions");
  if (historical) {
    await expect(heading).toHaveCount(0);
    await expect(grid).toHaveCount(0);
    await expect(intentions.getByRole("button", { name: /^Escolher intenção:/ })).toHaveCount(0);
  } else {
    await expect(heading).not.toBeVisible();
    await expect(grid).not.toBeVisible();
    await expect(grid.locator("button")).toHaveCount(5);
    await expect(intentions.getByText("Mais ações", { exact: true })).toBeVisible();
  }
}

async function openFixture(page, scenario, width) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  const failures = { errors: [], externalRequests: [], sdkRequests: [] };
  page.on("pageerror", (error) => failures.errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4188" || url.pathname.startsWith("/api/")) {
      failures.externalRequests.push(url.href);
      return route.abort();
    }
    if (/\/node_modules\/\.vite\/deps\/firebase(?:_|\/)/.test(url.pathname)) {
      failures.sdkRequests.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(() => localStorage.setItem("cleanflow-language", "pt"));
  await page.goto("/e2e/lifecycle/job-detail.html");
  await page.getByLabel("Local synthetic scenario").selectOption(scenario);
  await expect(page.locator(".service-lifecycle")).toBeVisible();
  await expect(page.locator(".service-checklist-summary")).toBeVisible();
  await expect(page.locator(".job-intents__next button")).toHaveAccessibleName(primaryLabels[scenario]);
  await expectIntentControls(page, scenario);
  await expect(page.locator(".panel")).not.toContainText(/lifecycle\./);
  return failures;
}

async function expectNoDomainCalls(page, failures, { allowRead = false } = {}) {
  const calls = await page.evaluate(() => ({
    ...window.__lifecycleHarness,
    providerCalls: window.__lifecycleProviderCalls,
  }));
  expect(calls.mutationCalls).toEqual([]);
  expect(calls.providerCalls).toEqual([]);
  if (!allowRead) expect(calls.readCalls).toEqual([]);
  expect(failures.errors).toEqual([]);
  expect(failures.externalRequests).toEqual([]);
  expect(failures.sdkRequests).toEqual([]);
}

async function expectRailState(page, scenario) {
  const rail = page.locator(".service-lifecycle");
  const stages = rail.locator("li");
  await expect(stages).toHaveCount(5);
  await expect(rail.getByRole("button")).toHaveCount(0);
  await expect(rail.getByRole("link")).toHaveCount(0);
  await expect(rail.locator(".service-lifecycle__marker")).toHaveCount(0);
  await expect(rail.getByText(/^(Etapa comprovada|Atual|Próxima)$/)).toHaveCount(0);
  if (scenario === "unknown") {
    await expect(rail.locator("[aria-current]")).toHaveCount(0);
    await expect(rail.locator(".service-lifecycle__stage--completed")).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  } else {
    await expect(rail.locator("[aria-current='step']")).toHaveCount(1);
    for (let index = 0; index < 5; index += 1) {
      const state = expectedStates[scenario][index];
      await expect(stages.nth(index)).toHaveClass(new RegExp(`service-lifecycle__stage--${state}(?:\\s|$)`));
      await expect(stages.nth(index)).toHaveAttribute("aria-label", new RegExp(`: ${positionLabels[state]}$`));
      if (state === "current") await expect(stages.nth(index)).toHaveAttribute("aria-current", "step");
      if (["skipped", "unknown-past"].includes(state)) await expect(stages.nth(index)).not.toContainText("✓");
    }
  }
  for (let index = 0; index < 5; index += 1) await stages.nth(index).click();
}

async function expectMobileFit(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bounds = await page.locator(".service-lifecycle").boundingBox();
  const width = page.viewportSize().width;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  const primaryButton = page.locator(".job-intents__next button");
  expect(await primaryButton.evaluate((button) => button.tagName)).toBe("BUTTON");
  if (width === 390) expect((await primaryButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const splitWords = await page.locator(".service-lifecycle__label").evaluateAll((labels) => labels.flatMap((label) => {
    const text = label.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) return [];
    return [...text.textContent.matchAll(/\p{L}+/gu)].flatMap((match) => {
      const range = document.createRange();
      range.setStart(text, match.index);
      range.setEnd(text, match.index + match[0].length);
      return range.getClientRects().length > 1 ? [match[0]] : [];
    });
  }));
  expect(splitWords).toEqual([]);
}

const screenshotCases = [
  ...["unassigned", "assigned-draft", "in-progress", "ready", "completed"].map(scenario => ({ scenario, width: 1440 })),
  ...["direct-assigned", "direct-in-progress", "completed-with-started", "completed-without-started", "completed-reviewed", "offer-error"].map(scenario => ({ scenario, width: 1440 })),
  ...["unassigned", "in-progress", "stale", "completed", "unknown", "archived"].map(scenario => ({ scenario, width: 390 })),
];

for (const { scenario, width } of screenshotCases) {
  test(`real Job Detail lifecycle: ${scenario} at ${width}px`, async ({ page }) => {
    const failures = await openFixture(page, scenario, width);
    await expect(page.locator(".job-detail-section")).toHaveCount(7);
    await expect(page.locator(".job-detail-section[open]")).toHaveCount(0);
    await expectNoDomainCalls(page, failures);
    await expectRailState(page, scenario);
    if (["in-progress", "direct-in-progress", "stale", "archived"].includes(scenario)) {
      const progress = page.locator(".service-checklist-summary").getByRole("progressbar");
      await expect(progress).toHaveAttribute("aria-valuenow", "25");
      await expect(progress).toHaveAttribute("aria-valuetext", /7.*28/);
    }
    if (scenario === "stale") await expect(page.locator(".service-checklist-summary__warning")).toBeVisible();
    if (["ready", "stale"].includes(scenario)) {
      await expect(page.locator(".service-attention")).toBeVisible();
      const attention = await page.locator(".service-attention").boundingBox();
      const rail = await page.locator(".service-lifecycle").boundingBox();
      expect(attention.y + attention.height).toBeLessThanOrEqual(rail.y);
    }
    if (scenario === "archived") await expect(page.locator(".service-lifecycle__archived")).toBeVisible();
    if (scenario === "unknown") {
      await expect(page.locator(".panel")).not.toContainText("Not provided");
      await page.getByText("Histórico e administração", { exact: true }).click();
      const status = page.locator(".job-detail__history-summary > div").filter({
        has: page.getByText("Status operacional", { exact: true }),
      }).locator("dd");
      await expect(status).toHaveText("Não informado");
      await page.getByText("Histórico e administração", { exact: true }).click();
    }
    if (["completed", "completed-with-started", "completed-without-started", "completed-reviewed", "archived"].includes(scenario)) {
      await expect(page.locator(".service-attention")).toHaveCount(0);
    }
    if (["completed", "completed-with-started", "completed-reviewed"].includes(scenario)) {
      await expect(page.locator(".service-checklist-summary__heading strong")).toHaveText("Checklist salvo");
      expect(await page.evaluate(() => window.__lifecycleFixture.checklistRun.status)).toBe("READY_FOR_REVIEW");
    }
    if (["direct-in-progress", "completed-with-started", "completed-reviewed"].includes(scenario)) {
      await page.getByText("Histórico e administração", { exact: true }).click();
      const started = page.locator(".job-detail__history-summary > div").filter({
        has: page.getByText("Horário de início", { exact: true }),
      }).locator("dd");
      await expect(started).not.toHaveText("Não informado");
      await page.getByText("Histórico e administração", { exact: true }).click();
    }
    if (["completed-with-started", "completed-without-started", "completed-reviewed"].includes(scenario)) {
      await page.getByText("Histórico e administração", { exact: true }).click();
      const completed = page.locator(".job-detail__history-summary > div").filter({
        has: page.getByText("Horário de conclusão", { exact: true }),
      }).locator("dd");
      await expect(completed).not.toHaveText("Não informado");
      await page.getByText("Histórico e administração", { exact: true }).click();
    }
    await expectMobileFit(page);
    await expectNoDomainCalls(page, failures);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (width === 1440) {
      const primary = await page.locator(".job-intents__next button").boundingBox();
      expect(primary.y + primary.height).toBeLessThan(page.viewportSize().height);
    }
    await page.screenshot({
      path: `artifacts/visual-smoke/lifecycle-${width === 390 ? "mobile" : "desktop"}-${scenario}.png`,
      style: ".lifecycle-fixture-toolbar { display: none; }",
    });
    if (width === 390) await page.screenshot({
      path: `artifacts/visual-smoke/lifecycle-mobile-${scenario}-full.png`,
      fullPage: true,
      style: ".lifecycle-fixture-toolbar { display: none; }",
    });
    if (scenario === "stale") {
      await page.getByRole("button", { name: "Ver controles do link →" }).click();
      await expect(page.locator(".job-checklist")).toBeFocused();
      await expectNoDomainCalls(page, failures);
    }
  });
}

for (const width of [1440, 390]) {
  test(`V1 keyboard disclosure and intent routing at ${width}px`, async ({ page }) => {
    const failures = await openFixture(page, "unassigned", width);
    const more = page.locator(".job-intents__secondary > summary");
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".job-intents__actions")).toBeVisible();
    await page.getByRole("button", { name: "Escolher intenção: Alterar data / horário" }).click();
    await expect(page.locator(".job-details-edit").first()).toBeFocused();
    const service = page.locator(".job-detail-section").filter({ has: page.getByText("Detalhes do serviço", { exact: true }) });
    await expect(service).toHaveAttribute("open", "");
    await expect(page.getByRole("button", { name: "Salvar horário" })).toBeVisible();
    await expectMobileFit(page);
    await service.locator(":scope > summary").focus();
    await page.keyboard.press("Space");
    await expect(service).not.toHaveAttribute("open", "");
    await expect(page.getByRole("button", { name: "Salvar horário" })).not.toBeVisible();
    await more.click();
    await page.locator(".job-intents__next button").click();
    await expect(page.locator(".assignment-roster")).toBeFocused();
    await expect(page.getByRole("radio", { name: "Demo Cleaner Alpha" })).toBeVisible();
    await expect(page.locator(".job-detail-section[open]")).toHaveCount(1);
    for (const summary of await page.locator(".job-detail-section > summary").all()) {
      expect((await summary.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await expectMobileFit(page);
    await expectNoDomainCalls(page, failures);
    await page.screenshot({ path: `artifacts/visual-smoke/job-detail-v1-${width}-assignment-open.png`, fullPage: true,
      style: ".lifecycle-fixture-toolbar { display: none; }" });
  });
}

test("existing primary intentions still open their existing safe paths", async ({ page }) => {
  const failures = await openFixture(page, "unassigned", 1440);
  await page.locator(".job-intents__next button").click();
  await expect(page.getByRole("radio", { name: "Demo Cleaner Alpha" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar atribuição" })).toBeDisabled();
  await expectNoDomainCalls(page, failures);

  const selector = page.getByLabel("Local synthetic scenario");
  await selector.selectOption("assigned");
  await expect(page.locator(".job-intents__next button")).toHaveAccessibleName(primaryLabels.assigned);
  await expectIntentControls(page, "assigned");
  await page.locator(".job-intents__next button").click();
  await expect(page.getByRole("heading", { name: "Revisar lembrete para Demo Cleaner Alpha" })).toBeVisible();
  await expectNoDomainCalls(page, failures);

  for (const scenario of ["assigned-draft", "in-progress", "ready"]) {
    await selector.selectOption(scenario);
    await expect(page.locator(".job-intents__next button")).toHaveAccessibleName(primaryLabels[scenario]);
    await expectIntentControls(page, scenario);
    await page.locator(".job-intents__next button").click();
    expect(await page.evaluate(() => window.__lifecycleHarness.readCalls)).toEqual([
      { name: "onOpenChecklistRun", argumentCount: 0 },
    ]);
    await expectNoDomainCalls(page, failures, { allowRead: true });
  }
  await selector.selectOption("completed");
  await expect(page.locator(".job-intents__next button")).toHaveAccessibleName(primaryLabels.completed);
  await expectIntentControls(page, "completed");
  await page.locator(".job-intents__next button").click();
  expect(await page.evaluate(() => window.__lifecycleHarness.readCalls)).toEqual([
    { name: "onOpenChecklistRun", argumentCount: 0 },
  ]);
  await expectNoDomainCalls(page, failures, { allowRead: true });
});

test("offered and open issues preserve the five operational stages", async ({ page }) => {
  const failures = await openFixture(page, "offered", 390);
  await expectRailState(page, "offered");
  await expectMobileFit(page);
  await expectNoDomainCalls(page, failures);
  await page.getByLabel("Local synthetic scenario").selectOption("open-issue");
  await expect(page.locator(".job-intents__next button")).toHaveAccessibleName(primaryLabels["open-issue"]);
  await expectRailState(page, "open-issue");
  await expect(page.locator(".service-attention")).toBeVisible();
  await expectMobileFit(page);
  await expectNoDomainCalls(page, failures);
});
