import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Loaded again here (also done by playwright.config.ts / global-setup.ts) —
// test files run in their own worker process, so don't rely on module-load
// order in the main process.
process.loadEnvFile("/Users/carterking/Projects/dad/.env");

// Waystar: seeded 'ready' with a tldr — the "has been enriched" fixture.
const WAYSTAR_ID = "c0000000-0000-4000-8000-000000000001";

// Same find-or-create fixture as tests/enrich-e2e.spec.ts. Nothing in this
// file ever sets its tldr, so it stays null across runs — the stable "never
// enriched" fixture for the disabled-Download-button case.
const NOT_ENRICHED_NAME = "E2E Test Co";
const NOT_ENRICHED_DOMAIN = "e2e-test.example";

async function findNotEnrichedCompanyId(): Promise<string> {
  const runner = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error: authError } = await runner.auth.signInWithPassword({
    email: process.env.RUNNER_EMAIL!,
    password: process.env.RUNNER_PASSWORD!,
  });
  if (authError) throw authError;

  const { data, error } = await runner.from("companies").select("id").eq("domain", NOT_ENRICHED_DOMAIN).maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      `"${NOT_ENRICHED_NAME}" fixture company not found — run enrich-e2e.spec.ts first (it creates it via the Add-company UI).`,
    );
  }
  return data.id;
}

test.describe("Download PDF / Enrich button state machine", () => {
  test("pre-enrich: Download is genuinely disabled with a tooltip, Enrich is primary", async ({ page }) => {
    const companyId = await findNotEnrichedCompanyId();
    await page.goto(`/companies/${companyId}`);

    const download = page.getByRole("button", { name: "Download PDF" });
    await expect(download).toBeVisible();
    await expect(download).toBeDisabled();
    await expect(download).toHaveAttribute("aria-disabled", "true");
    await expect(download).toHaveAttribute("title", "Enrich this company first");

    const enrich = page.getByRole("button", { name: "Enrich" });
    await expect(enrich).toBeEnabled();
    await expect(enrich).toHaveClass(/\bprimary\b/);
  });

  test("post-enrich: Download is the primary action, Enrich stays gray but clickable", async ({ page }) => {
    await page.goto(`/companies/${WAYSTAR_ID}`);

    // Enriched — Download renders as a real link (not a disabled button) so
    // its `download` attribute can force a save.
    const download = page.getByRole("link", { name: "Download PDF" });
    await expect(download).toBeVisible();
    await expect(download).toHaveClass(/\bprimary\b/);
    await expect(download).toHaveAttribute("href", `/companies/${WAYSTAR_ID}/pdf`);
    await expect(download).toHaveAttribute("download", "Waystar.pdf");

    const enrich = page.getByRole("button", { name: "Enrich" });
    await expect(enrich).toBeEnabled();
    await expect(enrich).not.toHaveAttribute("disabled");
    await expect(enrich).not.toHaveClass(/\bprimary\b/);
  });
});

test.describe("PDF report / Source view switch", () => {
  test("defaults to the PDF report view with the report embedded inline", async ({ page }) => {
    await page.goto(`/companies/${WAYSTAR_ID}`);

    await expect(page.locator("button.tag", { hasText: "PDF report" })).toHaveClass(/\bon\b/);
    await expect(page.locator("button.tag", { hasText: "Source" })).not.toHaveClass(/\bon\b/);

    const frame = page.locator("iframe.pdf-frame");
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("src", `/companies/${WAYSTAR_ID}/pdf`);

    // The Source view's fact list isn't rendered at all in this view.
    await expect(page.locator(".tldr")).toHaveCount(0);
  });

  test("Source tab switches to the fact list and drops the PDF iframe", async ({ page }) => {
    await page.goto(`/companies/${WAYSTAR_ID}`);

    await page.locator("button.tag", { hasText: "Source" }).click();
    await expect(page).toHaveURL(/view=source/);

    await expect(page.locator("button.tag", { hasText: "Source" })).toHaveClass(/\bon\b/);
    await expect(page.locator(".tldr")).toBeVisible();
    await expect(page.locator("iframe.pdf-frame")).toHaveCount(0);
  });

  test("History tab is a non-navigating stub", async ({ page }) => {
    await page.goto(`/companies/${WAYSTAR_ID}`);
    const history = page.locator(".tag", { hasText: "History" });
    await expect(history).toBeVisible();
    await expect(history).not.toHaveAttribute("data-href", /.+/);
  });
});

test.describe("PDF generation route", () => {
  test("GET /companies/:id/pdf returns a real, inline PDF", async ({ request }) => {
    const res = await request.get(`/companies/${WAYSTAR_ID}/pdf`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("application/pdf");
    expect(res.headers()["content-disposition"]).toContain("inline");

    const body = await res.body();
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(body.subarray(-6).toString("latin1").trim()).toBe("%%EOF");
  });
});
