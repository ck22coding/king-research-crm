import { test, expect, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Loaded again here (also done by playwright.config.ts / global-setup.ts) —
// test files run in their own worker process, so don't rely on module-load
// order in the main process.
process.loadEnvFile("/Users/carterking/Projects/dad/.env");

// Review gate: facts land from the runner as "suggested sources"
// (reviewed_at null) and the PDF cannot be generated — popup on Download,
// prompt in the report pane, 409 from the route — until every suggestion is
// approved or denied.
//
// Fixture is R1 RCM, not Waystar: the PDF specs (pdf-report, pdf-cap) fetch
// Waystar's PDF and would 409 while a Waystar fact sat unreviewed. No spec
// fetches R1's PDF, so this file can toggle its fact freely.
const R1_ID = "c0000000-0000-4000-8000-000000000002";
const FIXTURE_FACT_ID = "f0000000-0000-4000-8000-000000000205";
const FACT_TEXT = "Job postings shifted";

// Signed-in anon client for fixture resets — same pattern as the sibling
// spec files (created per call site so TS infers the client type).
async function signedInClient() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.RUNNER_EMAIL!,
    password: process.env.RUNNER_PASSWORD!,
  });
  if (error) throw error;
  return supabase;
}

async function setFixture(reviewed_at: string | null) {
  const supabase = await signedInClient();
  const { error } = await supabase
    .from("facts")
    .update({ status: "included", reviewed_at })
    .eq("id", FIXTURE_FACT_ID);
  if (error) throw error;
  // Deterministic prose state: no narrative (tests that want it fresh stamp
  // their own), and no stray active job left by a crashed run (a queued job
  // renders Generate as a disabled "Working…" button).
  const { error: narrativeError } = await supabase
    .from("companies")
    .update({ report_narrative: null })
    .eq("id", R1_ID);
  if (narrativeError) throw narrativeError;
  const { error: jobError } = await supabase
    .from("enrichment_jobs")
    .update({ status: "done" })
    .eq("company_id", R1_ID)
    .in("status", ["queued", "running"]);
  if (jobError) throw jobError;
}

test.describe("review gate: suggested sources block the PDF", () => {
  test.beforeEach(async () => {
    await setFixture(null); // one pending suggestion
  });

  test.afterEach(async () => {
    // Leave the live seed reviewed — the real UI (and any other spec looking
    // at R1) expects its report unlocked between runs.
    await setFixture(new Date().toISOString());
  });

  // Fresh per-test auth context — same refresh-token-race rationale as
  // remove-flow.spec.ts.
  async function freshPage(browser: Browser, baseURL: string | undefined) {
    const context = await browser.newContext({ baseURL });
    const auth = await context.request.post("/api/test-auth", {
      data: { email: process.env.RUNNER_EMAIL, password: process.env.RUNNER_PASSWORD },
    });
    if (!auth.ok()) throw new Error(`/api/test-auth failed: ${auth.status()} ${await auth.text()}`);
    return { context, page: await context.newPage() };
  }

  test("pending suggestion: Download popup, report-pane prompt, 409 from the route", async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await freshPage(browser, baseURL);

    // Default view is the PDF report — gated, it shows the prompt, not the iframe.
    await page.goto(`/companies/${R1_ID}`);
    await expect(page.locator(".content .empty")).toContainText("suggested source");
    await expect(page.locator("iframe.pdf-frame")).toHaveCount(0);

    // Download opens the explainer popup instead of downloading.
    await page.getByRole("button", { name: "Download PDF" }).click();
    const dialog = page.locator(".gate-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Review suggested sources first");

    // The dependency holds server-side, not just in the UI.
    const res = await context.request.get(`/companies/${R1_ID}/pdf`);
    expect(res.status()).toBe(409);

    await context.close();
  });

  test("approving the last suggestion unlocks Download and the PDF route", async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await freshPage(browser, baseURL);

    await page.goto(`/companies/${R1_ID}?view=source`);
    const item = page.locator(".item", { hasText: FACT_TEXT });
    await expect(item.getByText("Suggested")).toBeVisible();
    await item.getByRole("button", { name: "Approve" }).click();

    // Badge gone — a normal included fact again, back to remove-only (§E).
    await expect(item.getByText("Suggested")).toHaveCount(0);
    await expect(item.getByRole("button", { name: "Remove from report" })).toBeVisible();

    // Gate cleared — but the prose is a generated artifact: the toolbar
    // offers Generate report and the route refuses until it has run.
    await expect(page.getByRole("button", { name: "Generate report" })).toBeVisible();
    const gated = await context.request.get(`/companies/${R1_ID}/pdf`);
    expect(gated.status()).toBe(409);
    expect(await gated.text()).toContain("Generate report");

    // Stand in for the runner: stamp a fresh narrative — the route unlocks.
    const supabase = await signedInClient();
    const { error } = await supabase
      .from("companies")
      .update({
        report_narrative: { sections: {}, generated_at: new Date(Date.now() + 60_000).toISOString() },
      })
      .eq("id", R1_ID);
    if (error) throw error;
    const res = await context.request.get(`/companies/${R1_ID}/pdf`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");

    await context.close();
  });

  test("denying a suggestion clears the gate too (fact removed)", async ({ browser, baseURL }) => {
    const { context, page } = await freshPage(browser, baseURL);

    await page.goto(`/companies/${R1_ID}?view=source`);
    const item = page.locator(".item", { hasText: FACT_TEXT });
    await expect(item.getByText("Suggested")).toBeVisible();
    await item.getByRole("button", { name: "Deny" }).click();

    // Denied = removed from Source (History keeps it — remove-flow.spec).
    await expect(item).toHaveCount(0);
    // Gate cleared; prose still pending — Generate is the offered action.
    await page.goto(`/companies/${R1_ID}`);
    // Generate renders in both the toolbar and the PDF pane — scope to one.
    await expect(page.locator(".toolbar").getByRole("button", { name: "Generate report" })).toBeVisible();

    await context.close();
  });

  test("Generate report enqueues a kind='generate' job for the runner", async ({
    browser,
    baseURL,
  }) => {
    // Requires migration 20260723140000 (enrichment_jobs.kind).
    await setFixture(new Date().toISOString()); // review already complete

    const { context, page } = await freshPage(browser, baseURL);
    await page.goto(`/companies/${R1_ID}`);
    await page.locator(".toolbar").getByRole("button", { name: "Generate report" }).click();

    const supabase = await signedInClient();
    await expect
      .poll(async () => {
        const { data } = await supabase
          .from("enrichment_jobs")
          .select("kind, status")
          .eq("company_id", R1_ID)
          .order("created_at", { ascending: false })
          .limit(1);
        return data?.[0] ? `${data[0].kind}:${data[0].status}` : "none";
      })
      .toBe("generate:queued");

    // Settle it so R1 never wedges (no delete policy — mark done, like the
    // sibling specs do).
    const { error } = await supabase
      .from("enrichment_jobs")
      .update({ status: "done" })
      .eq("company_id", R1_ID)
      .in("status", ["queued"]);
    if (error) throw error;

    await context.close();
  });
});
