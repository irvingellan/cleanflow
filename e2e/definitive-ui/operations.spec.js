import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { db, organizationId, seedOperation } from "./fixtures.js";
import { goSection, loginManager, managerContext, settle, shot, signInCleaner } from "./support.js";

// Operations evolution (FB01–FB09, checklist review, reminders) on the same
// fictitious operation. Screens are captured at a phone and a desktop width.
let fixture;
let carlaToken;
test.describe.configure({ mode: "serial" });
const org = () => db.collection("organizations").doc(organizationId);

test.beforeAll(async () => {
  fixture = await seedOperation();
  carlaToken = randomBytes(32).toString("base64url");
  await org().collection("jobs").doc(fixture.jobId("juniperToday")).collection("offers").doc(fixture.jobId("carla")).update({
    publicOfferTokenHash: createHash("sha256").update(carlaToken).digest("hex"),
    publicOfferExpiresAt: Timestamp.fromMillis(Date.now() + 86_400_000), offeredCompensation: 110,
  });
  await org().collection("properties").doc(fixture.jobId("harbor")).update({
    address: "12 Example Harbor Rd", cleanerInstructions: "Deixe as toalhas dobradas na cama principal.",
    cleanerAccess: { shared: true, door: "Teclado da porta: 4821 (fictício)", parking: "Vaga 2, lado esquerdo", wifi: "HarborGuest / exemplo123" },
    checklistSettings: { requiredPhotoTypes: [{ id: "under-beds", label: "Embaixo das camas" }, { id: "fridge", label: "Geladeira aberta" }] },
  });
});

for (const width of [390, 1280]) {
  test(`manager operations ${width}`, async ({ browser }) => {
    const context = await managerContext(browser, "light");
    const page = await context.newPage();
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await loginManager(page, fixture.manager);
    const base = `ops-${width}`;

    await goSection(page, "Serviços");
    await page.getByRole("button", { name: /Juniper Loft/ }).first().click();
    await settle(page);
    const panel = page.getByTestId("interest-decision");
    // The 390 run confirms Bia; at 1280 the spot is already filled on the server.
    if (width === 390) await expect(panel).toBeVisible();
    await shot(page, `${base}-1-two-interested`);

    if (width === 390) {
      await panel.getByRole("button", { name: /Bia Lima/ }).first().click();
      await expect(page.getByTestId("interest-decision")).toHaveCount(0, { timeout: 20_000 });
      await settle(page);
    }
    await page.getByTestId("offer-spots").scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, `${base}-2-after-confirm`);

    await goSection(page, "Propriedades");
    await page.getByRole("button", { name: /Harbor House/ }).first().click();
    await settle(page);
    await page.getByRole("button", { name: "Editar acesso" }).click();
    await shot(page, `${base}-3-property-access`);
    await page.getByRole("button", { name: "Cancelar" }).first().click();
    await page.getByRole("button", { name: "Editar checklist" }).click();
    await shot(page, `${base}-4-checklist-editor`);
    await page.getByRole("button", { name: "Ver como a cleaner" }).click();
    await shot(page, `${base}-5-checklist-preview`);
    await context.close();
  });
}

test("public link of the cleaner who was not chosen", async ({ browser }) => {
  const context = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block", baseURL: "http://127.0.0.1:15281" });
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/offer/${carlaToken}`);
  await expect(page.getByRole("alert")).toContainText(/preenchida|filled|cubierto/i, { timeout: 30_000 });
  await shot(page, "ops-390-6-public-link-filled");
  await context.close();
});

test("cleaner agenda: checklist state and shared access", async ({ browser }) => {
  const context = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block", baseURL: "http://127.0.0.1:15281" });
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await signInCleaner(page, fixture.cleanerCode);
  await page.waitForTimeout(1500);
  await shot(page, "ops-390-7-cleaner-today");
  await page.locator(`[data-job-id="${fixture.jobId("harborToday")}"]`).first().click();
  await settle(page);
  await page.waitForTimeout(1500);
  await shot(page, "ops-390-8-cleaner-job-access");
  await context.close();
});
