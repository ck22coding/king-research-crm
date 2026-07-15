import { test, expect } from "@playwright/test";

// Authenticated (default storageState from playwright.config.ts — runner session).
// Live seed: 3 companies (Waystar, R1 RCM, Availity) — supabase/seed.sql.
test.describe("companies list", () => {
  test("renders the 3 seeded companies", async ({ page }) => {
    await page.goto("/companies");

    // Row-presence checks, not an exact total count: tests/enrich-e2e.spec.ts
    // (Task 11) find-or-creates a persistent "E2E Test Co" row with no
    // delete policy to clean it up, so the table can legitimately hold more
    // than the 3 seeded companies from here on.
    const rows = page.locator("table tbody tr");
    await expect(rows.locator(".rec-chip", { hasText: "Waystar" })).toHaveCount(1);
    await expect(rows.locator(".rec-chip", { hasText: "R1 RCM" })).toHaveCount(1);
    await expect(rows.locator(".rec-chip", { hasText: "Availity" })).toHaveCount(1);
  });

  test("filtering by 'Way' narrows to Waystar only", async ({ page }) => {
    await page.goto("/companies");

    await page.getByPlaceholder("Filter…").fill("Way");

    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Waystar");
  });
});
