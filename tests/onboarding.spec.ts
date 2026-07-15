import { test, expect } from "@playwright/test";

test.describe("onboarding page", () => {
  test("loads at /onboarding with the marketplace add one-liner", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByText("claude plugin marketplace add ck22coding/king-research")).toBeVisible();
  });
});
