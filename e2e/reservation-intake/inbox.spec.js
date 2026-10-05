import { test, expect } from "@playwright/test";
for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
  test(`${name} explicit operator acceptance, reload, discrepancy and safe ignore`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors = [], remote = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4191")) remote.push(request.url()); });
    const shot = state => page.screenshot({ path: `artifacts/reservation-acceptance-${name}-${state}.png`, fullPage: true });
    const counts = () => page.evaluate(() => window.__intakeAcceptance.counts());
    await page.goto("/e2e/reservation-intake/inbox.html");
    await expect(page.locator("article")).toHaveCount(5);
    expect(await counts()).toEqual({ reservations: 0, jobs: 0 }); await shot("inbox");
    const originalHeight = await page.locator("article").first().evaluate(element => element.clientHeight);
    await page.getByRole("button", { name: "View observation / diff" }).last().click();
    await expect(page.getByRole("heading", { name: /Selected candidate/ })).toBeFocused();
    const selectedHeight = await page.locator("article").first().evaluate(element => element.clientHeight);
    expect(selectedHeight).toBeLessThanOrEqual(originalHeight + 50); // Slightly narrower list may wrap one line; never stretches to the panel.
    await shot("selected");
    await page.getByRole("button", { name: "Read saved review" }).click();
    await expect(page.getByRole("button", { name: "Save Property selection" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Promote to Reservation" })).toHaveCount(0);
    await page.getByRole("combobox", { name: "Select CleanFlow Property explicitly" }).selectOption("synthetic-property-one");
    await page.getByRole("button", { name: "Save Property selection" }).click(); await shot("property");
    expect(await page.locator("article").first().evaluate(element => element.clientHeight)).toBe(selectedHeight);
    await expect(page.getByRole("button", { name: "Promote to Reservation" })).toBeDisabled();
    await expect(page.getByText("Creates exactly one Reservation. No cleaning Job. Later external changes require human review.")).toBeVisible();
    await page.getByRole("checkbox").check(); await shot("confirmation");
    await page.getByRole("button", { name: "Promote to Reservation" }).click();
    await expect(page.locator("#reservation-review-detail").getByText("Promoted to Reservation", { exact: true })).toBeVisible();
    expect(await counts()).toEqual({ reservations: 1, jobs: 0 }); await shot("promoted");
    await page.reload(); await page.getByRole("button", { name: "View observation / diff" }).last().click();
    await page.getByRole("button", { name: "Read saved review" }).click();
    await expect(page.locator("#reservation-review-detail").getByText("Promoted to Reservation", { exact: true })).toBeVisible();
    expect(await counts()).toEqual({ reservations: 1, jobs: 0 });
    for (const signal of ["DATES_CHANGED", "STATUS_CHANGED", "SOURCE_DISAPPEARED"]) {
      const content = await page.evaluate(signal => window.__intakeAcceptance.snapshot(signal), signal);
      await page.getByLabel("Import sanitized shadow JSON").setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: Buffer.from(content) });
      await page.getByRole("button", { name: "View observation / diff" }).last().click();
      await page.getByRole("button", { name: "Read saved review" }).click();
      await expect(page.getByText("External change requires review. Saved Reservation has not been changed.")).toBeVisible();
      expect(await counts()).toEqual({ reservations: 1, jobs: 0 });
      if (signal === "DATES_CHANGED") await shot("discrepancy");
    }
    await page.getByRole("button", { name: "View observation / diff" }).first().click();
    await page.getByRole("button", { name: "Read saved review" }).click();
    await page.getByRole("button", { name: "Ignore candidate" }).click();
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Escape"); await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Ignore candidate" }).click();
    await page.getByRole("button", { name: "Confirm ignore" }).click();
    await page.reload(); await page.getByRole("button", { name: "View observation / diff" }).first().click();
    await page.getByRole("button", { name: "Read saved review" }).click();
    await expect(page.locator("#reservation-review-detail").getByText("Ignored", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Promote to Reservation" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]); expect(remote).toEqual([]);
    await expect(page.getByRole("button", { name: /Create Job|Assign cleaner|Send message/ })).toHaveCount(0);
  });
}
