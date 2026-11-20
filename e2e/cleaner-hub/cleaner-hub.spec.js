import { chromium, devices, expect, test, webkit } from "@playwright/test";
import { agendaFor, dateKey, jobsForProperty, managerCall, orgRef, seed } from "./fixtures.js";

// End-to-end on isolated emulators: the manager uses the existing CleanFlow
// screens; cleaners use the Cleaner Hub in mobile WebKit (iPhone profile).
// Firestore triggers run in the Functions emulator; nothing is mocked.

const iPhone = devices["iPhone 13"];
const evidence = (target, name) => target.screenshot({ path: `test-results/cleaner-hub-evidence/${process.env.CLEANER_HUB_BROWSER || "webkit"}-${name}.png` });
let cleanerBrowser;

test.beforeAll(async () => { cleanerBrowser = await (process.env.CLEANER_HUB_BROWSER === "chromium" ? chromium : webkit).launch(); });
test.afterAll(async () => { await cleanerBrowser?.close(); });

async function cleanerContext(locale) {
  const profile = process.env.CLEANER_HUB_BROWSER === "chromium" ? devices["Pixel 7"] : iPhone;
  return cleanerBrowser.newContext({ ...profile, locale, baseURL: "http://127.0.0.1:15281", serviceWorkers: "block" });
}

async function loginManager(page, fixture) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(fixture.manager.email);
  await page.getByLabel("Password").fill(fixture.manager.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
}

async function createService(page, fixture, { propertyId, propertyName, scheduledDate, scheduledStart, cleanerCount, houseTotal, clientPrice }) {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Jobs" }).click();
  await expect(page.getByRole("heading", { name: "Cleaning jobs" })).toBeVisible();
  await page.getByRole("region", { name: "Cleaning jobs" }).getByRole("button", { name: "New service" }).click();
  const form = page.locator(".cleaning-form");
  await form.getByRole("searchbox").fill(propertyName);
  await form.getByRole("combobox", { name: "Property" }).selectOption(propertyId);
  await expect(form.getByRole("spinbutton", { name: "Client price" })).toHaveValue("250");
  if (cleanerCount) await form.getByLabel("Cleaners needed").selectOption(cleanerCount);
  if (houseTotal) await form.getByRole("spinbutton", { name: "Cleaner payout" }).fill(houseTotal);
  if (clientPrice) await form.getByRole("spinbutton", { name: "Client price" }).fill(clientPrice);
  await form.getByRole("textbox", { name: "Date" }).fill(scheduledDate);
  await form.getByRole("textbox", { name: "Scheduled time" }).fill(scheduledStart);
  await form.getByRole("textbox", { name: "Notes" }).fill(`private-note-marker ${fixture.run}`);
  await form.getByRole("button", { name: "Create cleaning" }).click();
  await expect(page.getByRole("heading", { name: propertyName })).toBeVisible();
  const jobs = await jobsForProperty(propertyId);
  expect(jobs).toHaveLength(1);
  return jobs[0].ref;
}

async function openCleaner(page, name) {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Cleaners" }).click();
  await page.getByRole("button", { name: `View ${name}` }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function issueCodeInUi(page, name) {
  await openCleaner(page, name);
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Cleaner schedule access" }) });
  await expect(panel.getByTestId("cleaner-hub-status")).toContainText("Not connected yet.");
  await panel.getByRole("button", { name: "Create access code" }).click();
  const code = (await panel.locator(".cleaner-hub-code__value").textContent()).trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(panel.locator(".cleaner-hub-code__message")).toContainText("/agenda");
  return { panel, code };
}

const onIphone = process.env.CLEANER_HUB_BROWSER !== "chromium";

async function signInCleaner(page, code, { iosTab = onIphone, lang = "pt" } = {}) {
  const copy = lang === "pt"
    ? { anyway: "Entrar aqui no Safari mesmo assim", label: "Código de acesso (12 letras e números)", submit: "Entrar", schedule: "Estas são as suas próximas limpezas", next: "Continuar", later: "Fazer depois (a agenda funciona no navegador)", finish: "Ver minha agenda" }
    : { anyway: "Sign in here in Safari anyway", label: "Access code (12 letters and numbers)", submit: "Sign in", schedule: "These are your next cleanings", next: "Continue", later: "Later (the schedule works in the browser)", finish: "See my schedule" };
  await page.goto("/agenda");
  if (iosTab) await page.getByRole("button", { name: copy.anyway }).click();
  await page.getByLabel(copy.label).fill(code.toLowerCase());
  await page.getByRole("button", { name: copy.submit, exact: true }).click();
  await expect(page.getByRole("heading", { name: copy.schedule })).toBeVisible();
  await page.getByRole("button", { name: copy.next }).click();
  await page.getByRole("button", { name: copy.later }).click();
  await page.getByRole("button", { name: copy.finish }).click();
}

test("cleaner sees her own real assignments, live, and nothing else", async ({ page }) => {
  const fixture = await seed();
  const firstDate = dateKey(3);
  const movedDate = dateKey(5);
  const cleanerA = await cleanerContext("pt-BR");
  const cleanerB = await cleanerContext("en-US");
  const pageA = await cleanerA.newPage();
  const pageB = await cleanerB.newPage();
  await pageA.emulateMedia({ colorScheme: "dark" });
  page.on("dialog", (dialog) => dialog.accept());
  if (process.env.CLEANER_HUB_DEBUG) for (const [label, target] of [["A", pageA], ["B", pageB]]) target.on("console", (message) => console.log(`[${label}] ${message.type()} ${message.text()}`));

  let mapleRef;
  await test.step("1. Manager creates a real Job and assigns Cleaner A with the existing screens", async () => {
    await loginManager(page, fixture);
    mapleRef = await createService(page, fixture, { propertyId: fixture.mapleId, propertyName: fixture.mapleName, scheduledDate: firstDate, scheduledStart: "10:30",
      cleanerCount: "2", houseTotal: "153.75", clientPrice: "287.39" });
    await page.locator(".job-intents__secondary > summary").click();
    await page.locator(".job-intents__actions").getByRole("button", { name: /Assign \/ change cleaner/ }).click();
    await page.getByLabel(fixture.cleanerAName).check();
    await page.getByRole("button", { name: "Confirm assignment" }).click();
    await expect(page.getByText("1 cleaner assigned")).toBeVisible();
    expect((await mapleRef.get()).data().assignedCleanerIds).toEqual([fixture.cleanerAId]);
  });

  await test.step("2-3. Cleaner A links her account once and sees the Job", async () => {
    const { code } = await issueCodeInUi(page, fixture.cleanerAName);
    await pageA.goto("/agenda");
    if (onIphone) await expect(pageA.getByText(/No iPhone, coloque o CleanFlow na tela inicial ANTES/)).toBeVisible();
    await evidence(pageA, "00-sign-in-iphone-tab");
    await signInCleaner(pageA, code);
    await expect(pageA.getByRole("heading", { name: "Olá, Ana" })).toBeVisible();
    await pageA.getByRole("button", { name: /^Agendadas/ }).click();
    const card = pageA.locator(`[data-job-id="${mapleRef.id}"]`);
    await expect(card).toContainText(fixture.mapleName);
    await expect(card).toContainText("10:30");
    await expect(pageA.locator(".hb-root")).toHaveCSS("color-scheme", "light");
    await expect(card).toContainText("Vaga atribuída a você");
    await expect(pageA.locator(".hb-fresh")).toContainText("Atualizada");
    await evidence(pageA, "01-agenda-upcoming");
    const text = await pageA.locator("body").innerText();
    await expect(card).toContainText(/US\$\s*76,88/);
    expect(text).not.toMatch(/153[.,]75|287[.,]39/);
    for (const secret of ["private-", "Synthetic Client", "Bia"]) expect(text).not.toContain(secret);
  });

  await test.step("4-5. Cleaner B is isolated from Cleaner A", async () => {
    await managerCall(fixture, "assignCleanerDirectly", { jobId: fixture.cedarJobId, cleanerId: fixture.cleanerBId });
    const { code } = await managerCall(fixture, "issueCleanerAccessCode", { cleanerId: fixture.cleanerBId });
    await signInCleaner(pageB, code, { lang: "en" });
    await expect(pageB.getByRole("heading", { name: "Hi, Bia" })).toBeVisible();
    await pageB.getByRole("button", { name: /^Scheduled/ }).click();
    await expect(pageB.locator(`[data-job-id="${fixture.cedarJobId}"]`)).toContainText("8:15");
    await expect(pageB.locator("body")).not.toContainText(fixture.mapleName);
    await expect(pageA.locator("body")).not.toContainText(fixture.cedarName);
    // Direct rule-level denial of A's entries for B is covered in security/cleanerHub.test.mjs.
  });

  await test.step("6. Cleaner adds and removes unavailable dates while the assigned service stays on the schedule", async () => {
    const openAvailability = async () => {
      await pageA.getByRole("button", { name: "Conta", exact: true }).click();
      await pageA.getByRole("button", { name: "Dias em que não posso trabalhar" }).click();
      await expect(pageA.getByRole("heading", { name: "Dias em que não posso trabalhar" })).toBeVisible();
    };
    const blocks = orgRef.collection("cleanerUnavailability").where("cleanerId", "==", fixture.cleanerAId);
    const warning = "Você tem 1 serviço neste período. Fale com a gerente.";
    await openAvailability();
    await pageA.getByRole("button", { name: "Adicionar período" }).click();
    await pageA.getByLabel("De", { exact: true }).fill(firstDate);
    await pageA.getByLabel("Até", { exact: true }).fill(dateKey(4));
    await expect(pageA.getByText(warning)).toBeVisible();
    await pageA.getByRole("button", { name: "Salvar período" }).click();
    const remove = pageA.getByRole("button", { name: /^Remover/ });
    await expect(remove).toBeVisible();
    await expect(pageA.getByText(warning)).toBeVisible();
    const saved = (await blocks.get()).docs;
    expect(saved).toHaveLength(1);
    expect(saved[0].data()).toMatchObject({ startDate: firstDate, endDate: dateKey(4), createdBy: "CLEANER" });
    expect((await mapleRef.get()).data().assignedCleanerIds).toEqual([fixture.cleanerAId]);
    await pageA.getByRole("button", { name: "Agenda", exact: true }).click();
    await openAvailability();
    await remove.click();
    await expect(pageA.getByText("Nenhum período adicionado.")).toBeVisible();
    expect((await blocks.get()).empty).toBe(true);
    await pageA.getByRole("button", { name: "Agenda", exact: true }).click();
    await pageA.getByRole("button", { name: /^Agendadas/ }).click();
    await expect(pageA.locator(`[data-job-id="${mapleRef.id}"]`)).toContainText(fixture.mapleName);
  });

  await test.step("7. Manager reschedules; Cleaner A's open screen updates without reload", async () => {
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Jobs" }).click();
    await page.getByRole("button", { name: new RegExp(fixture.mapleName) }).first().click();
    await page.locator(".job-intents__secondary > summary").click();
    await page.locator(".job-intents__actions").getByRole("button", { name: /Change date \/ time/ }).click();
    const schedule = page.getByRole("region", { name: "Change date / time" });
    await schedule.getByLabel("Scheduled date").fill(movedDate);
    await schedule.getByLabel("Scheduled time").fill("13:00");
    await schedule.getByRole("button", { name: "Save schedule" }).click();
    await expect(page.getByText("Schedule updated.")).toBeVisible();
    const card = pageA.locator(`[data-job-id="${mapleRef.id}"]`);
    await expect(card).toContainText("13:00");
    await expect(pageA.getByRole("heading", { name: "Mudanças recentes" })).toHaveCount(0);
    const banner = pageA.locator(`[data-reschedule-banner="${mapleRef.id}"]`);
    await expect(banner).toContainText(fixture.mapleName);
    await expect(banner).toContainText(/Antes.*10:30/);
    await expect(banner).toContainText(/Agora.*13:00/);
    await expect(banner.getByRole("button", { name: "Posso", exact: true })).toBeVisible();
    await evidence(pageA, "02-rescheduled-live");
    await card.click();
    await expect(pageA.getByRole("main")).toContainText(/Antes.*10:30/);
    await expect(pageA.getByRole("main")).toContainText(/Agora.*13:00/);
    await pageA.getByRole("button", { name: "Não posso", exact: true }).click();
    await expect(pageA.getByText("Você será retirada deste serviço.")).toBeVisible();
    expect((await mapleRef.get()).get("scheduleConfirmation.byCleaner")[fixture.cleanerAId].state).toBe("PENDING");

    const service = page.getByRole("heading", { name: "New date confirmation" });
    await expect(service).toBeVisible();
    await page.getByRole("button", { name: "Notify on WhatsApp" }).click();
    await expect(page.getByText(/https:\/\/clean-flow-prototipo.web.app\/agenda/)).toBeVisible();
    await expect(page.getByText(/Review the draft and send it in WhatsApp/i)).toBeVisible();

    await pageA.getByRole("button", { name: /Caixa de entrada/ }).click();
    const prompt = pageA.getByRole("listitem").filter({ has: pageA.getByRole("heading", { name: "Data ou horário alterado" }) });
    await expect(prompt).toContainText(/Antes.*10:30/);
    await expect(prompt).toContainText(/Agora.*13:00/);
    await expect(prompt.getByRole("button", { name: "Posso", exact: true })).toBeVisible();
    await evidence(pageA, "58-01-confirm-new-schedule");
    await pageA.getByRole("button", { name: "Agenda", exact: true }).click();
    await banner.getByRole("button", { name: "Posso", exact: true }).click();
    await expect(banner).toHaveCount(0);
    await expect(card.locator("..")).toContainText("Novo horário confirmado.");
    await expect.poll(async () => {
      const schedule = (await mapleRef.get()).data().scheduleConfirmation;
      return schedule?.byCleaner[fixture.cleanerAId]?.state;
    }).toBe("CONFIRMED");
    await pageA.getByRole("button", { name: /Caixa de entrada/ }).click();
    await expect(prompt).toContainText("Novo horário confirmado.");
    await expect(prompt.getByRole("button", { name: "Posso", exact: true })).toHaveCount(0);
    await evidence(pageA, "58-02-confirmed");
    await pageA.goto("/agenda");
  });

  let birchRef;
  await test.step("9. The manager sees zero, one and multiple manual interests before assigning explicitly", async () => {
    birchRef = await createService(page, fixture, { propertyId: fixture.birchId, propertyName: fixture.birchName, scheduledDate: dateKey(6), scheduledStart: "09:00" });
    await page.locator("details.job-detail-section > summary", { hasText: "Offers" }).click();
    await page.locator(".offers-section").getByRole("button", { name: "Offer cleaning to cleaners" }).click();
    await expect(page.getByLabel("Assign automatically to the first cleaner who accepts")).toHaveCount(0);
    await page.getByLabel(fixture.cleanerAName).check();
    await page.getByLabel(fixture.cleanerBName).check();
    await page.getByRole("button", { name: "Create offers" }).click();
    await expect(page.locator(".offers-section__success")).toContainText("Offers created (2)");
    const offerCards = page.locator(".offer-status-item");
    const offerA = offerCards.filter({ hasText: fixture.cleanerAName });
    const offerB = offerCards.filter({ hasText: fixture.cleanerBName });
    for (const card of [offerA, offerB]) {
      await card.getByRole("button", { name: "Create public link" }).click();
      await card.getByRole("button", { name: "Create public link" }).click();
      await expect(card.getByRole("link", { name: "Open public cleaner offer" })).toBeVisible();
    }
    await expect(offerCards.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("interest-decision")).toHaveCount(0);
    await evidence(page, "release-a-00-manual-zero-interested");

    await pageA.getByRole("button", { name: /^Ofertas/ }).click();
    const offer = pageA.locator(`[data-job-id="${birchRef.id}"]`);
    await expect(offer).toContainText("Esperando sua resposta");
    await expect(offer).toContainText("Padrão (troca de hóspedes)");
    await offer.click();
    await expect(pageA.getByText(`private-note-marker ${fixture.run}`)).toBeVisible();
    await pageA.getByRole("button", { name: "Tenho interesse" }).click();
    await expect(pageA.getByText("Resposta enviada para a gerente.")).toBeVisible();
    await expect(pageA.locator(".hb-facts")).toContainText("Você tem interesse · a gerente decide");
    await evidence(pageA, "03-offer-interested");
    await page.getByRole("button", { name: "Refresh offers" }).click();
    await expect(offerA.getByRole("button", { name: "Confirm", exact: true })).toBeVisible();
    await expect(offerB.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
    const firstInterest = (await birchRef.get()).data();
    expect([firstInterest.operationalStatus, firstInterest.assignedCleanerIds]).toEqual(["OFFERED", []]);
    expect((await birchRef.collection("offers").doc(fixture.cleanerAId).get()).data().status).toBe("INTERESTED");
    await expect(page.getByTestId("interest-decision").getByRole("button", { name: `Confirm ${fixture.cleanerAName}`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next step: Confirm interested cleaner", exact: true }).click();
    await expect(page.getByTestId("interest-decision")).toBeFocused();
    await evidence(page, "release-a-01-manual-one-interested");
    await pageA.getByRole("button", { name: "Voltar" }).click();
    await pageA.getByRole("button", { name: /^Agenda/ }).click();
    await pageA.getByRole("button", { name: /^Agendadas/ }).click();
    await expect(pageA.locator(`[data-job-id="${birchRef.id}"]`)).toHaveCount(0);

    await pageB.getByRole("button", { name: /^Offers/ }).click();
    await pageB.locator(`[data-job-id="${birchRef.id}"]`).click();
    await pageB.getByRole("button", { name: "I'm interested" }).click();
    await expect(pageB.locator(".hb-facts")).toContainText("You're interested · the manager decides");
    await pageB.getByRole("button", { name: "Back", exact: true }).click();
    await pageB.getByRole("button", { name: /^Schedule/ }).click();
    await pageB.getByRole("button", { name: /^Scheduled/ }).click();
    await page.getByRole("button", { name: "Refresh offers" }).click();
    await expect(offerCards.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(2);
    const multipleInterests = (await birchRef.get()).data();
    expect([multipleInterests.operationalStatus, multipleInterests.assignedCleanerIds]).toEqual(["OFFERED", []]);
    expect(multipleInterests.offerDistributionMode).toBeUndefined();
    expect((await birchRef.collection("assignments").get()).empty).toBe(true);
    await evidence(page, "release-a-02-manual-many-interested");

    await page.getByRole("button", { name: /\bInbox\b/ }).click();
    const interestItem = page.getByRole("listitem").filter({ hasText: fixture.birchName })
      .filter({ has: page.getByRole("heading", { name: "Cleaner expressed interest" }) }).first();
    await interestItem.getByRole("button", { name: "Review interested cleaners", exact: true }).click();
    const decision = page.getByTestId("interest-decision");
    await expect(decision).toBeFocused();
    await expect(decision.getByRole("button", { name: /^Confirm / })).toHaveCount(2);
    await evidence(page, "release-a-03-inbox-interest-focus");
    await decision.getByRole("button", { name: `Confirm ${fixture.cleanerAName}`, exact: true }).click();
    await expect.poll(async () => (await birchRef.get()).data().assignedCleanerIds).toEqual([fixture.cleanerAId]);
    expect((await birchRef.get()).data().firstAcceptClaim).toBeUndefined();
    expect((await birchRef.collection("offers").doc(fixture.cleanerBId).get()).data().status).toBe("INTERESTED");

    await page.getByRole("button", { name: /\bInbox\b/ }).click();
    const interestEvents = page.getByRole("listitem").filter({ hasText: fixture.birchName })
      .getByRole("heading", { name: "Cleaner expressed interest" });
    await expect(interestEvents).toHaveCount(2);
  });

  await test.step("12. Cleaner A starts her own checklist from the Hub", async () => {
    const run = mapleRef.collection("checklistRuns").doc("initial");
    expect((await run.get()).exists).toBe(false);
    await pageA.locator(`[data-job-id="${mapleRef.id}"]`).click();
    await pageA.getByRole("button", { name: /^(Abrir|Começar|Continuar) checklist$/ }).click();
    await pageA.waitForURL(/\/checklist\?t=/);
    await expect(pageA.locator("h1, h2").first()).toBeVisible();
    expect((await run.get()).get("createdBy")).toBe("CLEANER_HUB");
    const capability = (await run.collection("checklistCapabilities").doc("active").get()).data();
    expect(capability.cleanerId).toBe(fixture.cleanerAId);
  });

  await test.step("10. Reopening the Hub keeps her signed in", async () => {
    await pageA.goto("/agenda");
    await expect(pageA.getByRole("heading", { name: "Olá, Ana" })).toBeVisible();
    const again = await cleanerA.newPage();
    await again.goto("/agenda");
    await expect(again.getByRole("heading", { name: "Olá, Ana" })).toBeVisible();
    await again.close();
    // Closing a tab leaves the other one in the background; bring the Hub forward again.
    await pageA.bringToFront();
    await expect(pageA.locator(".hb-fresh")).toContainText("Atualizada");
  });

  await test.step("8. Removing the Assignment revokes the Job from her agenda", async () => {
    await pageA.locator(`[data-job-id="${mapleRef.id}"]`).click();
    await expect(pageA.getByRole("button", { name: /^(Abrir|Começar|Continuar) checklist$/ })).toBeVisible();
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Jobs" }).click();
    await page.getByRole("button", { name: new RegExp(fixture.mapleName) }).first().click();
    await page.locator("details.job-detail-section > summary", { hasText: "Cleaner & assignment" }).click();
    await page.locator(".assignment-roster__item").filter({ hasText: fixture.cleanerAName }).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("No cleaners assigned yet.")).toBeVisible();
    await expect.poll(async () => (await agendaFor(fixture.cleanerAId)).some((entry) => entry.jobId === mapleRef.id), { timeout: 20000 }).toBe(false);
    const removed = pageA.getByRole("status").filter({ hasText: fixture.mapleName });
    await expect(removed).toContainText("13:00");
    await expect(pageA.getByText(`private-note-marker ${fixture.run}`)).toHaveCount(0);
    await evidence(pageA, "04-assignment-removed");
    await pageA.getByRole("button", { name: "Voltar" }).click();
    await expect(pageA.locator(`[data-job-id="${mapleRef.id}"]`)).toHaveCount(0);
    const entries = await agendaFor(fixture.cleanerAId);
    expect(entries.some((entry) => entry.jobId === mapleRef.id)).toBe(false);
  });

  await test.step("Revocation by the manager ends Cleaner A's session", async () => {
    await pageA.bringToFront();
    await expect(pageA.locator(".hb-fresh")).toContainText("Atualizada");
    await openCleaner(page, fixture.cleanerAName);
    const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Cleaner schedule access" }) });
    await expect(panel.getByTestId("cleaner-hub-status")).toContainText("Connected since");
    await panel.getByRole("button", { name: "End access" }).click();
    await expect(panel.getByTestId("cleaner-hub-status")).toContainText("Access ended");
    const memberDocs = await orgRef.collection("members").where("cleanerId", "==", fixture.cleanerAId).get();
    expect(memberDocs.docs.map((doc) => doc.data().active)).toEqual([false]);
    await expect(pageA.getByRole("heading", { name: "Seu acesso foi encerrado" })).toBeVisible();
    await evidence(pageA, "05-access-revoked");
    await evidence(page, "06-manager-access-panel");
    await pageA.goto("/agenda");
    await expect(pageA.getByRole("heading", { name: "Entre na sua agenda" })).toBeVisible();
    const member = (await orgRef.collection("cleanerHubAccess").doc(fixture.cleanerAId).get()).data();
    expect(member.active).toBe(false);
  });

  // Playwright WebKit shares one network process across contexts, so offline
  // emulation runs after the other cleaner's live checks.
  await test.step("15. Offline shows the last confirmed agenda, labelled as not confirmed", async () => {
    const card = pageB.locator(`[data-job-id="${fixture.cedarJobId}"]`);
    await expect(pageB.locator(".hb-fresh")).toContainText("Up to date");
    await evidence(pageB, "08-cleaner-b-own-job-en");
    await cleanerB.setOffline(true);
    await expect(pageB.locator(".hb-fresh")).toContainText("Offline");
    await expect(pageB.getByText(/You're offline\. Showing the last confirmed version/)).toBeVisible();
    await expect(card).toBeVisible();
    await evidence(pageB, "07-offline-last-confirmed");
    await cleanerB.setOffline(false);
    await expect(pageB.locator(".hb-fresh")).toContainText("Up to date", { timeout: 45000 });
  });

  await test.step("11. Sign-out clears private data on that phone", async () => {
    await pageB.getByRole("button", { name: /^Account/ }).click();
    const signedOutNavigation = pageB.waitForEvent("framenavigated", {
      predicate: (frame) => frame === pageB.mainFrame(),
    });
    await pageB.getByRole("button", { name: "Sign out on this phone" }).click();
    await signedOutNavigation;
    await expect(pageB.getByRole("heading", { name: "Open your schedule" })).toBeVisible();
    await pageB.reload();
    await expect(pageB.getByRole("heading", { name: "Open your schedule" })).toBeVisible();
    await expect(pageB.locator("body")).not.toContainText("Bia");
    await expect(pageB.locator("body")).not.toContainText(fixture.cedarName);
  });

  await cleanerA.close();
  await cleanerB.close();
});

test("automatic offer confirms in the signed-in Hub and becomes unavailable to the other invitee", async ({ page, browser }) => {
  const fixture = await seed();
  const cleanerA = await cleanerContext("pt-BR");
  const cleanerB = await cleanerContext("en-US");
  const guest = await browser.newContext({ baseURL: "http://127.0.0.1:15281", locale: "en-US" });
  const pageA = await cleanerA.newPage();
  const pageB = await cleanerB.newPage();
  const publicPage = await guest.newPage();
  let releaseAcceptance;
  const waitForRelease = new Promise((resolve) => { releaseAcceptance = resolve; });

  try {
    await loginManager(page, fixture);
    const job = await createService(page, fixture, {
      propertyId: fixture.mapleId, propertyName: fixture.mapleName, scheduledDate: dateKey(3), scheduledStart: "11:15",
      houseTotal: "68.24", clientPrice: "379.56",
    });
    await page.locator("details.job-detail-section > summary", { hasText: "Offers" }).click();
    await page.locator(".offers-section").getByRole("button", { name: "Offer cleaning to cleaners" }).click();
    await page.getByLabel(fixture.cleanerAName).check();
    await page.getByLabel(fixture.cleanerBName).check();
    const optIn = page.getByLabel("Assign automatically to the first cleaner who accepts");
    await expect(optIn).toBeChecked();
    await page.getByRole("button", { name: "Create offers" }).click();
    await expect(page.locator(".offers-section__success")).toContainText("Automatic offers created (2)");
    expect((await job.get()).data().offerDistributionMode).toBe("FIRST_ACCEPT_WINS");
    // A later edit of the Job total must never replace the terms already offered.
    await page.locator("details.job-detail-section > summary", { hasText: "Financial" }).click();
    const pricing = page.getByRole("region", { name: "Edit prices" });
    await pricing.getByRole("button", { name: "Edit prices" }).click();
    await pricing.getByRole("spinbutton", { name: "Cleaner payout" }).fill("153.57");
    await pricing.getByRole("button", { name: "Save prices" }).click();
    await expect(pricing.getByText("Job prices updated.")).toBeVisible();
    expect((await job.get()).get("cleanerPayout")).toBe(153.57);

    const otherOffer = page.locator(".offer-status-item").filter({ hasText: fixture.cleanerBName });
    await expect(otherOffer).toContainText("Waiting for acceptance");
    await otherOffer.getByRole("button", { name: "Create public link" }).click();
    const publicLink = otherOffer.getByRole("link", { name: "Open public cleaner offer" });
    await expect(publicLink).toBeVisible();
    await publicPage.goto(await publicLink.getAttribute("href"));
    await expect(publicPage.getByRole("link", { name: /schedule/i })).toHaveAttribute("href", "/agenda");
    await expect(publicPage.getByRole("button", { name: /accept|interested|confirm/i })).toHaveCount(0);
    await expect(publicPage.locator("body")).not.toContainText(/68[.,]24|153[.,]57|379[.,]56/);

    const scenarios = [
      { target: pageA, cleanerId: fixture.cleanerAId, lang: "pt", accept: "Aceitar serviço", interest: "Tenho interesse" },
      { target: pageB, cleanerId: fixture.cleanerBId, lang: "en", accept: "Accept job", interest: "I'm interested" },
    ];
    for (const { target, cleanerId, lang, accept, interest } of scenarios) {
      const { code } = await managerCall(fixture, "issueCleanerAccessCode", { cleanerId });
      await signInCleaner(target, code, { lang });
      await target.goto("/agenda?inbox=1");
      const offerHeading = target.getByRole("heading", { name: lang === "pt" ? "Nova oferta" : "New offer" });
      await expect(offerHeading).toBeVisible();
      const inboxOffer = target.getByRole("listitem").filter({ has: offerHeading });
      await expect(inboxOffer).toContainText(fixture.mapleName);
      if (lang === "pt") {
        await evidence(target, "85-01-cleaner-inbox");
        await inboxOffer.getByRole("button", { name: "Marcar como lido" }).click();
        await target.getByRole("button", { name: "Lidos", exact: true }).click();
        await expect(offerHeading).toBeVisible();
      }
      await inboxOffer.getByRole("button", { name: lang === "pt" ? "Ver oferta" : "View offer", exact: true }).click();
      await expect(target.getByRole("button", { name: accept })).toBeEnabled();
      await expect(target.locator(".hb-facts")).toContainText(lang === "pt" ? /68,24/ : /68\.24/);
      await expect(target.locator("body")).not.toContainText(/153[.,]57|379[.,]56/);
      await expect(target.getByRole("button", { name: interest })).toHaveCount(0);
    }
    await evidence(pageA, "86-01-automatic-offer");

    // Pause the real request in transit to verify there is no optimistic confirmation.
    await pageA.route("**/respondToMyOffer", async (route) => {
      if (route.request().method() === "POST") await waitForRelease;
      await route.continue();
    });
    const acceptanceRequest = pageA.waitForRequest((request) => request.url().endsWith("/respondToMyOffer") && request.method() === "POST");
    await pageA.getByRole("button", { name: "Aceitar serviço" }).click();
    await acceptanceRequest;
    await expect(pageA.getByText("Serviço confirmado para você.")).toHaveCount(0);
    expect((await job.get()).data().assignedCleanerIds).toEqual([]);
    releaseAcceptance();

    const confirmed = pageA.getByText("Serviço confirmado para você.").or(pageA.getByText("Vaga atribuída a você"));
    await expect(confirmed.first()).toBeVisible();
    await evidence(pageA, "86-02-server-confirmed");
    const unavailable = "Unavailable — this job has already been filled.";
    await expect(pageB.getByText(unavailable)).toBeVisible();
    await expect(pageB.locator("body")).not.toContainText(/68[.,]24|153[.,]57|379[.,]56/);
    await expect(pageB.getByRole("button", { name: "Accept job" })).toHaveCount(0);
    await expect(pageB.locator("body")).not.toContainText(fixture.cleanerAName);
    await evidence(pageB, "86-03-other-invitee-unavailable");

    await pageA.goto("/agenda");
    await expect(pageA.getByRole("button", { name: /^Agendadas/ })).toBeVisible();
    await pageA.getByRole("button", { name: /^Agendadas/ }).click();
    await expect(pageA.locator(`[data-job-id="${job.id}"]`)).toContainText("Vaga atribuída a você");
    await expect(pageA.locator(`[data-job-id="${job.id}"]`)).toContainText(/68,24/);
    await expect(pageA.locator("body")).not.toContainText(/153[.,]57|379[.,]56/);
    await evidence(pageA, "86-04-confirmed-agenda-after-reload");
    await pageB.goto("/agenda");
    await expect(pageB.getByRole("button", { name: /^Scheduled/ })).toBeVisible();
    await pageB.getByRole("button", { name: /^Scheduled/ }).click();
    await expect(pageB.locator(`[data-job-id="${job.id}"]`)).toHaveCount(0);
    await pageB.getByRole("button", { name: /^Offers/ }).click();
    await expect(pageB.locator(`[data-job-id="${job.id}"]`)).toContainText(unavailable);

    await publicPage.reload();
    await expect(publicPage.getByText(/already been filled/i)).toBeVisible();
    await expect(publicPage.locator("body")).not.toContainText(fixture.cleanerAName);

    const jobData = (await job.get()).data();
    expect(jobData.assignedCleanerIds).toEqual([fixture.cleanerAId]);
    expect(jobData.firstAcceptClaim.cleanerId).toBe(fixture.cleanerAId);
    const assignments = await job.collection("assignments").get();
    expect(assignments.docs.map((snapshot) => snapshot.data().assignmentMethod)).toEqual(["FIRST_ACCEPT_WINS"]);
    await expect.poll(async () => {
      const events = await job.collection("managerNotificationDeliveries").get();
      return events.docs.map((snapshot) => [snapshot.get("eventType"), snapshot.get("deliveryStatus")])
        .sort(([left], [right]) => left.localeCompare(right));
    }).toEqual([
      ["AUTO_ASSIGNMENT_CONFIRMED", "NO_ACTIVE_DEVICES"], ["AUTO_OFFER_BATCH_FILLED", "NO_ACTIVE_DEVICES"],
    ]);

    await expect(otherOffer).toContainText("Unavailable");
    await page.locator("details.job-detail-section > summary", { hasText: "Cleaner & assignment" }).click();
    const rosterItem = page.locator(".assignment-roster__item").filter({ hasText: fixture.cleanerAName });
    await expect(rosterItem).toContainText("Assigned automatically");
    await evidence(page, "86-05-manager-assignment");

    await page.getByRole("button", { name: /\bInbox\b/ }).click();
    const managerJobItems = page.getByRole("listitem").filter({ hasText: fixture.mapleName });
    await expect(managerJobItems.getByRole("heading", { name: "Automatic assignment confirmed" })).toHaveCount(1);
    await expect(managerJobItems.getByRole("heading", { name: "All spots filled" })).toHaveCount(1);
    await expect(managerJobItems.getByText(/11:15/)).toHaveCount(2);
    await expect(managerJobItems.getByRole("heading", { name: "Cleaner expressed interest" })).toHaveCount(0);
    await evidence(page, "85-02-manager-inbox");

    await pageA.goto("/agenda?inbox=1");
    const autoReceipt = pageA.getByRole("heading", { name: "Serviço confirmado pelo seu aceite" });
    await expect(autoReceipt).toHaveCount(1);
    await evidence(pageA, "85-03-cleaner-confirmation-inbox");
    await pageA.getByRole("listitem").filter({ has: autoReceipt }).getByRole("button", { name: "Ver serviço", exact: true }).click();
    await pageA.getByRole("button", { name: /^(Abrir|Começar|Continuar) checklist$/ }).click();
    await pageA.waitForURL(/\/checklist\?t=/);
    const capability = (await job.collection("checklistRuns").doc("initial").collection("checklistCapabilities").doc("active").get()).data();
    expect(capability.cleanerId).toBe(fixture.cleanerAId);

    await pageB.goto("/agenda?inbox=1");
    await expect(pageB.getByRole("heading", { name: "New offer" })).toHaveCount(1);
    await expect(pageB.getByRole("heading", { name: "Job confirmed by your acceptance" })).toHaveCount(0);
    await expect(pageB.getByText("This item is no longer available.")).toBeVisible();
    await expect(pageB.locator("body")).not.toContainText(fixture.cleanerAName);
    await evidence(pageB, "85-04-closed-inbox");
  } finally {
    releaseAcceptance();
    await Promise.all([cleanerA.close(), cleanerB.close(), guest.close()]);
  }
});

test("reports and approves worked time in the signed-in experiences", async ({ page }) => {
  const fixture = await seed();
  const job = orgRef.collection("jobs").doc(fixture.cedarJobId);
  await job.update({ serviceType: "AIRBNB_TOUCH_UP", pay: { mode: "HOURLY", rateCents: 2210 },
    billing: { mode: "HOURLY", hourlyRateCents: 3810 } });
  await managerCall(fixture, "assignCleanerDirectly", { jobId: job.id, cleanerId: fixture.cleanerAId });
  await job.update({ operationalStatus: "IN_PROGRESS" });
  const { code } = await managerCall(fixture, "issueCleanerAccessCode", { cleanerId: fixture.cleanerAId });
  const context = await cleanerContext("pt-BR");
  try {
    const cleaner = await context.newPage();
    await cleaner.setViewportSize({ width: 375, height: 812 });
    await cleaner.emulateMedia({ colorScheme: "light" });
    await signInCleaner(cleaner, code);
    await cleaner.getByRole("button", { name: /^Agendadas/ }).click();
    await cleaner.locator(`[data-job-id="${job.id}"]`).click();
    await expect(cleaner.getByRole("heading", { name: "Informar minhas horas" })).toBeVisible();
    await expect(cleaner.getByLabel("Minutos trabalhados")).toHaveValue("120");
    await evidence(cleaner, "stage-b-report-light");
    await cleaner.getByLabel("Minutos trabalhados").fill("118");
    await cleaner.getByRole("button", { name: "Salvar horas" }).click();
    await expect(cleaner.getByText("Aguardando aprovação · 120 min")).toBeVisible();
    await cleaner.emulateMedia({ colorScheme: "dark" });
    await evidence(cleaner, "stage-b-waiting-dark");

    await loginManager(page, fixture);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Jobs" }).click();
    await page.getByText(fixture.cedarName, { exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Hours to approve" })).toBeVisible();
    await page.getByLabel("Minutes worked").fill("115");
    await page.getByRole("heading", { name: "Hours to approve" }).scrollIntoViewIfNeeded();
    await evidence(page, "stage-b-manager-approval");
    await page.getByRole("button", { name: "Approve hours" }).click();
    await expect(page.getByText(/Approved · 115 min/)).toBeVisible();
    await expect(cleaner.getByText(/Aprovadas · 115 min/)).toBeVisible();
    await evidence(cleaner, "stage-b-approved-dark");
  } finally {
    await context.close();
  }
});
