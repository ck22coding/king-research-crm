import { test, expect } from "@playwright/test";

// Static sample data (lib/markets-data.ts, ported verbatim from
// crm-ui/data.js) — markets have no Supabase table in v1 (BUILD.md).
test.describe("markets list", () => {
  test("renders exactly the 3 sample markets", async ({ page }) => {
    await page.goto("/markets");

    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(3);

    const names = rows.locator(".rec-chip");
    await expect(names).toContainText([
      "Denials Management",
      "Prior Authorization Technology",
      "Revenue Cycle Management",
    ]);
  });

  test("clicking a market navigates to its record page with the primary TAM KPI", async ({
    page,
  }) => {
    await page.goto("/markets");

    await page.getByText("Denials Management").click();
    await expect(page).toHaveURL(/\/markets\/denials-management$/);

    // primaryTam(): highest year, then highest value tie-break. Denials
    // Management's tam_estimates are [4.6B/2024/Grand View Research,
    // 5.0B/2024/MarketsandMarkets, 3.6B/2022/Fortune Business Insights] —
    // both leaders are 2024, so the $5.0B MarketsandMarkets estimate wins.
    const tamKpi = page.locator(".kpi", { has: page.locator(".k", { hasText: "TAM" }) });
    await expect(tamKpi.locator(".v")).toHaveText("$5.0B");
    await expect(tamKpi).toContainText("MarketsandMarkets, 2024");
  });

  test("tag-row filter narrows the list", async ({ page }) => {
    await page.goto("/markets");

    await page.locator(".tag", { hasText: "RCM" }).click();

    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(2);
    const names = rows.locator(".rec-chip");
    await expect(names).toContainText(["Denials Management", "Revenue Cycle Management"]);

    // Clearing goes back to all 3.
    await page.locator(".tag", { hasText: "Clear" }).click();
    await expect(rows).toHaveCount(3);
  });
});
