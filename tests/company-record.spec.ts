import { test, expect } from "@playwright/test";

// Authenticated (default storageState from playwright.config.ts — runner session).
// Live seed: fixed company ids from supabase/seed.sql.
const WAYSTAR_ID = "c0000000-0000-4000-8000-000000000001";
const R1_RCM_ID = "c0000000-0000-4000-8000-000000000002";

// PDF pivot's report order (lib/pdf/report.ts REPORT_SECTIONS, minus the
// company_summary TL;DR card) — Source/History share it with the PDF.
const SECTION_TITLES = [
  "Leadership & People",
  "Acquisitions & Partnerships",
  "News & Announcements",
  "Financials",
  "Growth Signals",
  "Risk Flags",
];

test.describe("company record page", () => {
  test("shows TL;DR and all 6 sections in order", async ({ page }) => {
    // Source view — PDF report is now the default view (tests/pdf-report.spec.ts).
    await page.goto(`/companies/${WAYSTAR_ID}?view=source`);

    // TL;DR is the first card, non-empty.
    const tldr = page.locator(".tldr");
    await expect(tldr).toBeVisible();
    expect((await tldr.textContent())?.trim().length).toBeGreaterThan(0);

    // The 6 section cards follow, in the fixed order.
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
    await page.goto(`/companies/${WAYSTAR_ID}?view=source`);

    const newsCard = page.locator(".card", { has: page.locator("h3", { hasText: "News & Announcements" }) });
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
    await page.goto(`/companies/${R1_RCM_ID}?view=source`);

    // Acquisitions & Partnerships is always empty pre-migration (no DB slug
    // maps to it yet), so every company has at least one empty section.
    await expect(page.getByText("Nothing found").first()).toBeVisible();
  });
});
