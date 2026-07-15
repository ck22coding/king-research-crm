import { test, expect } from "@playwright/test";

// Fresh, unauthenticated context: no cookies at all.
test.describe("unauthenticated", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("hitting / redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});

// Uses the runner storageState from playwright.config.ts (Task 1's global-setup).
test.describe("authenticated (runner session)", () => {
  test("hitting / lands on /companies", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/companies$/);
    await expect(page.locator("body")).toContainText("Companies");
  });
});
