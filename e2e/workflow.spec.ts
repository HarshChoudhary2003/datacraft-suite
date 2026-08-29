import { test, expect } from "@playwright/test";

test.describe("DataIQ Pro End-to-End Application Workflow", () => {
  test("loads landing page and presents sample dataset options", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/DataIQ Pro|Data Science/i);

    // Verify presence of sample dataset drop zone or sample buttons
    const bodyText = await page.innerText("body");
    expect(bodyText).toMatch(/Sales 2024|Customer Churn|Titanic|Upload|Drag & Drop/i);
  });

  test("navigates through dataset overview and quality modules", async ({ page }) => {
    await page.goto("/overview");
    await expect(page.locator("body")).toBeVisible();
  });

  test("loads data prep module", async ({ page }) => {
    await page.goto("/prep");
    await expect(page.locator("body")).toBeVisible();
  });

  test("loads AutoML studio module", async ({ page }) => {
    await page.goto("/train");
    await expect(page.locator("body")).toBeVisible();
  });

  test("loads code generation module", async ({ page }) => {
    await page.goto("/codegen");
    await expect(page.locator("body")).toBeVisible();
  });

  test("loads export hub module", async ({ page }) => {
    await page.goto("/export");
    await expect(page.locator("body")).toBeVisible();
  });
});
