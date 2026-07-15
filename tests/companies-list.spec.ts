import { test, expect } from "@playwright/test";

// Authenticated (default storageState from playwright.config.ts — runner session).
// Live seed: 3 companies (Waystar, R1 RCM, Availity) — supabase/seed.sql.
test.describe("companies list", () => {
  test("renders the 3 seeded companies", async ({ page }) => {
    await page.goto("/companies");

    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(3);

    const names = rows.locator(".rec-chip");
    await expect(names).toContainText(["Waystar", "R1 RCM", "Availity"]);
  });

  test("filtering by 'Way' narrows to Waystar only", async ({ page }) => {
    await page.goto("/companies");

    await page.getByPlaceholder("Filter…").fill("Way");

    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Waystar");
  });
});
