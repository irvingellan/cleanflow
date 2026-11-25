import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { devices, expect, test, webkit } from "@playwright/test";
import { dateKey, managerCall, orgRef, seed } from "./fixtures.js";

// Access photos end to end on isolated emulators with synthetic data only:
// the manager adds a captioned photo to a Property, and the assigned cleaner sees
// it inside the Cleaner Hub access section. Screenshots are review evidence.

const sharp = createRequire(new URL("../../functions/package.json", import.meta.url))("sharp");
const shots = "test-results/access-photos-evidence";
const shot = (target, name) => target.screenshot({ path: `${shots}/${name}.png` });

async function syntheticPhoto() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <rect width="1200" height="900" fill="#d9e8e2"/><rect x="120" y="180" width="420" height="620" fill="#7a5c45"/>
    <rect x="160" y="230" width="340" height="520" fill="#8f6d52"/><circle cx="470" cy="500" r="18" fill="#e3c26b"/>
    <rect x="700" y="420" width="260" height="180" rx="16" fill="#2f4f4f"/>
    <text x="830" y="525" font-size="56" text-anchor="middle" fill="#fff" font-family="Arial">BOX</text>
    <text x="600" y="110" font-size="64" text-anchor="middle" fill="#1d3b33" font-family="Arial">Synthetic side entrance</text>
  </svg>`;
  mkdirSync(shots, { recursive: true });
  const path = `${shots}/synthetic-entrance.jpg`;
  writeFileSync(path, await sharp(Buffer.from(svg)).jpeg().toBuffer());
  return path;
}

test("manager adds an access photo and only the assigned cleaner sees it in the Hub", async ({ page }) => {
  const fixture = await seed();
  const caption = "Side gate: lockbox is on the right";
  await orgRef.collection("properties").doc(fixture.cedarId).update({
    cleanerAccess: { shared: true, door: "Use the side gate", note: "Park on the street" },
  });
  await orgRef.collection("jobs").doc(fixture.cedarJobId).update({ scheduledDate: dateKey(1) });

  // Manager: Properties > Cedar > Photos for the cleaner.
  await page.goto("/");
  await page.getByLabel("Email").fill(fixture.manager.email);
  await page.getByLabel("Password").fill(fixture.manager.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Properties" }).click();
  await page.getByRole("button", { name: `View ${fixture.cedarName}` }).click();
  const access = page.locator("section.property-access");
  await access.getByText("Photos for the cleaner").click();
  await access.getByLabel("Caption (optional)").fill(caption);
  await access.locator('input[type="file"]').setInputFiles(await syntheticPhoto());
  await expect(access.getByRole("img", { name: caption })).toBeVisible();
  await access.scrollIntoViewIfNeeded();
  await shot(access, "01-manager-access-photos-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await access.scrollIntoViewIfNeeded();
  await shot(page, "02-manager-access-photos-phone");
  await page.setViewportSize({ width: 1280, height: 860 });

  const stored = (await orgRef.collection("properties").doc(fixture.cedarId).get()).data().cleanerAccessPhotos;
  expect(stored).toHaveLength(1);
  expect(Object.keys(stored[0]).sort()).toEqual(["caption", "createdAt", "createdByUid", "height", "id", "sizeBytes", "width"]);

  // Assign Ana, then let her sign in on an iPhone profile.
  await managerCall(fixture, "assignCleanerDirectly", { jobId: fixture.cedarJobId, cleanerId: fixture.cleanerAId });
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Cleaners" }).click();
  await page.getByRole("button", { name: `View ${fixture.cleanerAName}` }).click();
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Cleaner schedule access" }) });
  await panel.getByRole("button", { name: "Create access code" }).click();
  const code = (await panel.locator(".cleaner-hub-code__value").textContent()).trim();

  const browser = await webkit.launch();
  try {
    const context = await browser.newContext({ ...devices["iPhone 13"], locale: "pt-BR", baseURL: "http://127.0.0.1:15281", serviceWorkers: "block" });
    const cleaner = await context.newPage();
    await cleaner.goto("/agenda");
    await cleaner.getByRole("button", { name: "Entrar aqui no Safari mesmo assim" }).click();
    await cleaner.getByLabel("Código de acesso (12 letras e números)").fill(code.toLowerCase());
    await cleaner.getByRole("button", { name: "Entrar", exact: true }).click();
    await cleaner.getByRole("button", { name: "Continuar" }).click();
    await cleaner.getByRole("button", { name: "Fazer depois (a agenda funciona no navegador)" }).click();
    await cleaner.getByRole("button", { name: "Ver minha agenda" }).click();
    await cleaner.locator(`[data-job-id="${fixture.cedarJobId}"]`).first().click();
    const hubAccess = cleaner.locator("section.hb-access");
    await expect(hubAccess).toBeVisible();
    // Photos load lazily once the section is in view.
    await hubAccess.scrollIntoViewIfNeeded();
    await expect(hubAccess.getByRole("img", { name: caption })).toBeVisible();
    await shot(cleaner, "03-cleaner-hub-access-photo-iphone");
    await hubAccess.getByRole("img", { name: caption }).click();
    await cleaner.waitForTimeout(500);
    await shot(cleaner, "04-cleaner-hub-photo-fullscreen-iphone");
    await expect(cleaner.locator("body")).not.toContainText(/private-door-marker|private-access-marker/);
    await context.close();
  } finally {
    await browser.close();
  }
});
