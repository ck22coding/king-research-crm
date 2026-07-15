import { test, expect } from "@playwright/test";

// Authenticated (default storageState from playwright.config.ts — runner session).
test.describe("app shell", () => {
  test("sidebar has Companies and Markets nav items", async ({ page }) => {
    await page.goto("/companies");
    await expect(page.locator(".sidebar")).toBeVisible();

    const navItems = page.locator(".nav-item");
    await expect(navItems).toHaveCount(2);
    await expect(navItems.nth(0)).toContainText("Companies");
    await expect(navItems.nth(1)).toContainText("Markets");
  });

  test("clicking Sign out lands back on /login", async ({ page }) => {
    await page.goto("/companies");
    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
