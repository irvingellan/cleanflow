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
};

const currentPositions = {
  unassigned: 0, offered: 1, assigned: 2, "assigned-draft": 2,
  "in-progress": 3, ready: 3, completed: 4, stale: 2, "open-issue": 3, archived: 3,
};

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
  if (scenario === "unknown") {
    await expect(rail.locator("[aria-current]")).toHaveCount(0);
    await expect(rail.locator(".service-lifecycle__stage--completed")).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  } else {
    await expect(rail.locator("[aria-current='step']")).toHaveCount(1);
    await expect(stages.nth(currentPositions[scenario])).toHaveAttribute("aria-current", "step");
    await expect(rail.locator(".service-lifecycle__stage--completed")).toHaveCount(currentPositions[scenario]);
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
  ...["unassigned", "in-progress", "stale", "unknown", "archived"].map(scenario => ({ scenario, width: 390 })),
];

for (const { scenario, width } of screenshotCases) {
  test(`real Job Detail lifecycle: ${scenario} at ${width}px`, async ({ page }) => {
    const failures = await openFixture(page, scenario, width);
    await expectNoDomainCalls(page, failures);
    await expectRailState(page, scenario);
    if (["in-progress", "stale", "archived"].includes(scenario)) {
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
    if (["completed", "archived"].includes(scenario)) await expect(page.locator(".service-attention")).toHaveCount(0);
    await expectMobileFit(page);
    await expectNoDomainCalls(page, failures);
    await page.evaluate(() => window.scrollTo(0, 0));
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

test("existing primary intentions still open their existing safe paths", async ({ page }) => {
  const failures = await openFixture(page, "unassigned", 1440);
  await page.locator(".job-intents__next button").click();
  await expect(page.getByRole("radio", { name: "Demo Cleaner Alpha" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar atribuição" })).toBeDisabled();
  await expectNoDomainCalls(page, failures);

  const selector = page.getByLabel("Local synthetic scenario");
  await selector.selectOption("assigned");
  await expect(page.locator(".job-intents__next button")).toHaveAccessibleName(primaryLabels.assigned);
  await page.locator(".job-intents__next button").click();
  await expect(page.getByRole("heading", { name: "Revisar lembrete para Demo Cleaner Alpha" })).toBeVisible();
  await expectNoDomainCalls(page, failures);

  for (const scenario of ["assigned-draft", "in-progress", "ready"]) {
    await selector.selectOption(scenario);
    await expect(page.locator(".job-intents__next button")).toHaveAccessibleName(primaryLabels[scenario]);
    await page.locator(".job-intents__next button").click();
    expect(await page.evaluate(() => window.__lifecycleHarness.readCalls)).toEqual([
      { name: "onOpenChecklistRun", argumentCount: 0 },
    ]);
    await expectNoDomainCalls(page, failures, { allowRead: true });
  }
  await selector.selectOption("completed");
  await expect(page.locator(".job-intents__next button")).toHaveAccessibleName(primaryLabels.completed);
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
