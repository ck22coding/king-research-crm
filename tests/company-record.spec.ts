import { test, expect } from "@playwright/test";

// Authenticated (default storageState from playwright.config.ts — runner session).
// Live seed: fixed company ids from supabase/seed.sql.
const WAYSTAR_ID = "c0000000-0000-4000-8000-000000000001";
const R1_RCM_ID = "c0000000-0000-4000-8000-000000000002";

const SECTION_TITLES = [
  "News & announcements",
  "Growth signals",
  "Money",
  "Leadership & people",
  "Risk flags",
  "Regulatory",
  "Segmentation",
  "Market sizing",
];

test.describe("company record page", () => {
  test("shows TL;DR and all 8 sections in order", async ({ page }) => {
    await page.goto(`/companies/${WAYSTAR_ID}`);

    // TL;DR is the first card, non-empty.
    const tldr = page.locator(".tldr");
    await expect(tldr).toBeVisible();
    expect((await tldr.textContent())?.trim().length).toBeGreaterThan(0);

    // The 8 section cards follow, in the fixed order.
    const headings = await page.locator(".content .card h3").allTextContents();
    const sectionHeadings = headings.slice(1); // drop the TL;DR heading
    expect(sectionHeadings).toHaveLength(SECTION_TITLES.length);
    SECTION_TITLES.forEach((title, i) => {
      expect(sectionHeadings[i]).toContain(title);
    });
  });

  test("clicking a source chip in News opens the reading pane on that source's url", async ({
    page,
  }) => {
    await page.goto(`/companies/${WAYSTAR_ID}`);

    const newsCard = page.locator(".card", { has: page.locator("h3", { hasText: "News & announcements" }) });
    const chip = newsCard.locator(".src").first();
    const url = await chip.getAttribute("data-url");
    expect(url).toBeTruthy();

    await chip.click();

    await expect(page.locator("aside.browser")).toBeVisible();
    await expect(page.locator("#bpFrame")).toHaveAttribute("src", url!);
  });

  test("R1 RCM renders the 'Nothing found' empty state for its empty sections", async ({
    page,
  }) => {
    await page.goto(`/companies/${R1_RCM_ID}`);

    // Seed leaves regulatory/segmentation/market_sizing empty for R1 RCM.
    await expect(page.getByText("Nothing found").first()).toBeVisible();
  });
});
