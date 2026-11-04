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

async function createService(page, fixture, { propertyId, propertyName, scheduledDate, scheduledStart }) {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Jobs" }).click();
  await expect(page.getByRole("heading", { name: "Cleaning jobs" })).toBeVisible();
  await page.getByRole("button", { name: "New service" }).click();
  const form = page.locator(".cleaning-form");
  await form.getByRole("searchbox").fill(propertyName);
  await form.getByRole("combobox", { name: "Property" }).selectOption(propertyId);
  await expect(form.getByRole("spinbutton", { name: "Client price" })).toHaveValue("250");
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
  page.on("dialog", (dialog) => dialog.accept());
  if (process.env.CLEANER_HUB_DEBUG) for (const [label, target] of [["A", pageA], ["B", pageB]]) target.on("console", (message) => console.log(`[${label}] ${message.type()} ${message.text()}`));

  let mapleRef;
  await test.step("1. Manager creates a real Job and assigns Cleaner A with the existing screens", async () => {
    await loginManager(page, fixture);
    mapleRef = await createService(page, fixture, { propertyId: fixture.mapleId, propertyName: fixture.mapleName, scheduledDate: firstDate, scheduledStart: "10:30" });
    await page.getByRole("button", { name: "Assign cleaner" }).click();
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
    await pageA.getByRole("button", { name: /^Próximas/ }).click();
    const card = pageA.locator(`[data-job-id="${mapleRef.id}"]`);
    await expect(card).toContainText(fixture.mapleName);
    await expect(card).toContainText("10:30");
    await expect(card).toContainText("Confirmada para você");
    await expect(pageA.locator(".hb-fresh")).toContainText("Atualizada");
    await evidence(pageA, "01-agenda-upcoming");
    const text = await pageA.locator("body").innerText();
    for (const secret of ["250", "150", "private-", "Synthetic Client", "Bia"]) expect(text).not.toContain(secret);
  });

  await test.step("4-5. Cleaner B is isolated from Cleaner A", async () => {
    await managerCall(fixture, "assignCleanerDirectly", { jobId: fixture.cedarJobId, cleanerId: fixture.cleanerBId });
    const { code } = await managerCall(fixture, "issueCleanerAccessCode", { cleanerId: fixture.cleanerBId });
    await signInCleaner(pageB, code, { lang: "en" });
    await expect(pageB.getByRole("heading", { name: "Hi, Bia" })).toBeVisible();
    await pageB.getByRole("button", { name: /^Upcoming/ }).click();
    await expect(pageB.locator(`[data-job-id="${fixture.cedarJobId}"]`)).toContainText("8:15");
    await expect(pageB.locator("body")).not.toContainText(fixture.mapleName);
    await expect(pageA.locator("body")).not.toContainText(fixture.cedarName);
    // Direct rule-level denial of A's entries for B is covered in security/cleanerHub.test.mjs.
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
    await expect(pageA.locator(".hb-change.is-moved")).toContainText("Mudou de");
    await evidence(pageA, "02-rescheduled-live");
  });

  let birchRef;
  await test.step("9. An Offer stays separate from the agenda; interest does not assign", async () => {
    birchRef = await createService(page, fixture, { propertyId: fixture.birchId, propertyName: fixture.birchName, scheduledDate: dateKey(6), scheduledStart: "09:00" });
    await page.locator("details.job-detail-section > summary", { hasText: "Offers" }).click();
    await page.getByRole("button", { name: "Offer cleaning to cleaners" }).click();
    await page.getByLabel(fixture.cleanerAName).check();
    await page.getByRole("button", { name: "Create offers" }).click();
    await expect(page.locator(".offers-section__success")).toContainText("Offers created (1)");
    const offerCard = page.locator(".offer-status-item").filter({ hasText: fixture.cleanerAName });
    await offerCard.getByRole("button", { name: "Create public link" }).click();
    await offerCard.getByRole("button", { name: "Create public link" }).click();
    await expect(offerCard.getByRole("link", { name: "Open public cleaner offer" })).toBeVisible();

    await pageA.getByRole("button", { name: /^Ofertas/ }).click();
    const offer = pageA.locator(`[data-job-id="${birchRef.id}"]`);
    await expect(offer).toContainText("Esperando sua resposta");
    await offer.click();
    await pageA.getByRole("button", { name: "Tenho interesse" }).click();
    await expect(pageA.getByText("Resposta enviada para a gerente.")).toBeVisible();
    await expect(pageA.locator(".hb-facts")).toContainText("Você tem interesse · a gerente decide");
    await evidence(pageA, "03-offer-interested");
    const job = (await birchRef.get()).data();
    expect([job.operationalStatus, job.assignedCleanerIds]).toEqual(["OFFERED", []]);
    expect((await birchRef.collection("offers").doc(fixture.cleanerAId).get()).data().status).toBe("INTERESTED");
    await pageA.getByRole("button", { name: "Voltar" }).click();
    await pageA.getByRole("button", { name: /^Agenda/ }).click();
    await pageA.getByRole("button", { name: /^Próximas/ }).click();
    await expect(pageA.locator(`[data-job-id="${birchRef.id}"]`)).toHaveCount(0);
  });

  await test.step("12. Cleaner A opens the existing checklist for her own Job", async () => {
    await managerCall(fixture, "createChecklistRun", { jobId: mapleRef.id });
    await pageA.locator(`[data-job-id="${mapleRef.id}"]`).click();
    await pageA.getByRole("button", { name: "Abrir checklist" }).click();
    await pageA.waitForURL(/\/checklist\?t=/);
    await expect(pageA.locator("h1, h2").first()).toBeVisible();
    const capability = (await mapleRef.collection("checklistRuns").doc("initial").collection("checklistCapabilities").doc("active").get()).data();
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
    await expect(pageA.getByRole("button", { name: "Abrir checklist" })).toBeVisible();
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Jobs" }).click();
    await page.getByRole("button", { name: new RegExp(fixture.mapleName) }).first().click();
    await page.locator("details.job-detail-section > summary", { hasText: "Cleaner & assignment" }).click();
    await page.locator(".assignment-roster__item").filter({ hasText: fixture.cleanerAName }).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("No cleaners assigned yet.")).toBeVisible();
    await expect.poll(async () => (await agendaFor(fixture.cleanerAId)).some((entry) => entry.jobId === mapleRef.id), { timeout: 20000 }).toBe(false);
    await expect(pageA.getByText("Este serviço não está mais na sua agenda.")).toBeVisible();
    await pageA.getByRole("button", { name: "Voltar" }).click();
    await expect(pageA.locator(".hb-change.is-removed")).toContainText("Saiu da sua agenda");
    await evidence(pageA, "04-assignment-removed");
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
    });
    await page.locator("details.job-detail-section > summary", { hasText: "Offers" }).click();
    await page.getByRole("button", { name: "Offer cleaning to cleaners" }).click();
    await page.getByLabel(fixture.cleanerAName).check();
    await page.getByLabel(fixture.cleanerBName).check();
    const optIn = page.getByLabel("Assign automatically to the first cleaner who accepts");
    await expect(optIn).not.toBeChecked();
    await optIn.check();
    await page.getByRole("button", { name: "Create offers" }).click();
    await expect(page.locator(".offers-section__success")).toContainText("Automatic offers created (2)");
    expect((await job.get()).data().offerDistributionMode).toBe("FIRST_ACCEPT_WINS");

    const otherOffer = page.locator(".offer-status-item").filter({ hasText: fixture.cleanerBName });
    await expect(otherOffer).toContainText("Waiting for acceptance");
    await otherOffer.getByRole("button", { name: "Create public link" }).click();
    const publicLink = otherOffer.getByRole("link", { name: "Open public cleaner offer" });
    await expect(publicLink).toBeVisible();
    await publicPage.goto(await publicLink.getAttribute("href"));
    await expect(publicPage.getByRole("link", { name: /schedule/i })).toHaveAttribute("href", "/agenda");
    await expect(publicPage.getByRole("button", { name: /accept|interested|confirm/i })).toHaveCount(0);

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
      await inboxOffer.getByRole("button", { name: lang === "pt" ? "Abrir" : "Open", exact: true }).click();
      await expect(target.getByRole("button", { name: accept })).toBeEnabled();
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

    const confirmed = pageA.getByText("Serviço confirmado para você.").or(pageA.getByText("Confirmada para você"));
    await expect(confirmed.first()).toBeVisible();
    await evidence(pageA, "86-02-server-confirmed");
    const unavailable = "Unavailable — this job has already been accepted.";
    await expect(pageB.getByText(unavailable)).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Accept job" })).toHaveCount(0);
    await expect(pageB.locator("body")).not.toContainText(fixture.cleanerAName);
    await evidence(pageB, "86-03-other-invitee-unavailable");

    await pageA.goto("/agenda");
    await expect(pageA.getByRole("button", { name: /^Próximas/ })).toBeVisible();
    await pageA.getByRole("button", { name: /^Próximas/ }).click();
    await expect(pageA.locator(`[data-job-id="${job.id}"]`)).toContainText("Confirmada para você");
    await evidence(pageA, "86-04-confirmed-agenda-after-reload");
    await pageB.goto("/agenda");
    await expect(pageB.getByRole("button", { name: /^Upcoming/ })).toBeVisible();
    await pageB.getByRole("button", { name: /^Upcoming/ }).click();
    await expect(pageB.locator(`[data-job-id="${job.id}"]`)).toHaveCount(0);
    await pageB.getByRole("button", { name: /^Offers/ }).click();
    await expect(pageB.locator(`[data-job-id="${job.id}"]`)).toContainText(unavailable);

    await publicPage.reload();
    await expect(publicPage.getByText(/already been accepted/i)).toBeVisible();
    await expect(publicPage.locator("body")).not.toContainText(fixture.cleanerAName);

    const jobData = (await job.get()).data();
    expect(jobData.assignedCleanerIds).toEqual([fixture.cleanerAId]);
    expect(jobData.firstAcceptClaim.cleanerId).toBe(fixture.cleanerAId);
    const assignments = await job.collection("assignments").get();
    expect(assignments.docs.map((snapshot) => snapshot.data().assignmentMethod)).toEqual(["FIRST_ACCEPT_WINS"]);
    await expect.poll(async () => {
      const events = await job.collection("managerNotificationDeliveries").get();
      return events.docs.map((snapshot) => [snapshot.get("eventType"), snapshot.get("deliveryStatus")]);
    }).toEqual([["ASSIGNMENT_CONFIRMED", "NO_ACTIVE_DEVICES"]]);

    await expect(otherOffer).toContainText("Unavailable");
    await page.locator("details.job-detail-section > summary", { hasText: "Cleaner & assignment" }).click();
    const rosterItem = page.locator(".assignment-roster__item").filter({ hasText: fixture.cleanerAName });
    await expect(rosterItem).toContainText("Assigned automatically");
    await evidence(page, "86-05-manager-assignment");

    await page.getByRole("button", { name: /^Inbox/ }).click();
    const managerJobItems = page.getByRole("listitem").filter({ hasText: fixture.mapleName });
    await expect(managerJobItems.getByRole("heading", { name: "Automatic assignment confirmed" })).toHaveCount(1);
    await expect(managerJobItems.getByRole("heading", { name: "Cleaner expressed interest" })).toHaveCount(0);
    await evidence(page, "85-02-manager-inbox");

    await pageA.goto("/agenda?inbox=1");
    const autoReceipt = pageA.getByRole("heading", { name: "Serviço confirmado pelo seu aceite" });
    await expect(autoReceipt).toHaveCount(1);
    await evidence(pageA, "85-03-cleaner-confirmation-inbox");
    await managerCall(fixture, "createChecklistRun", { jobId: job.id });
    await pageA.getByRole("listitem").filter({ has: autoReceipt }).getByRole("button", { name: "Abrir", exact: true }).click();
    await pageA.getByRole("button", { name: "Abrir checklist" }).click();
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
