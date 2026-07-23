import { test, expect } from "@playwright/test";

test("Connect this computer issues a one-time pairing code", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Connect this computer" }).click();
  // Code renders once, grouped XXXX-XXXX, unambiguous alphabet
  await expect(page.getByTestId("pairing-code")).toHaveText(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
});
