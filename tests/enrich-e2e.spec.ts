import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Loaded again here (also done by playwright.config.ts / global-setup.ts) —
// test files run in their own worker process, so don't rely on module-load
// order in the main process.
process.loadEnvFile("/Users/carterking/Projects/dad/.env");

// Capstone: one stable test company, reused/idempotent across runs (Task 11).
// Not a live-seed id — found-or-created below.
const COMPANY_NAME = "E2E Test Co";
const COMPANY_DOMAIN = "e2e-test.example";

function runnerClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

async function signInRunner() {
  const runner = runnerClient();
  const { data, error } = await runner.auth.signInWithPassword({
    email: process.env.RUNNER_EMAIL!,
    password: process.env.RUNNER_PASSWORD!,
  });
  if (error) throw error;
  return { runner, userId: data.user!.id };
}

let companyId: string;

test.describe.serial("capstone: enrich flow with stubbed fact insert", () => {
  test.beforeAll(async ({ browser, baseURL }) => {
    const { runner } = await signInRunner();

    const { data: existing, error } = await runner
      .from("companies")
      .select("id")
      .eq("domain", COMPANY_DOMAIN)
      .maybeSingle();
    if (error) throw error;

    if (existing) {
      companyId = existing.id;
      return;
    }

    // Absent — drive the real Task 4 Add-company UI to create it, rather
    // than inserting directly, so that flow gets exercised for real too.
    const context = await browser.newContext({ baseURL });
    const auth = await context.request.post("/api/test-auth", {
      data: { email: process.env.RUNNER_EMAIL, password: process.env.RUNNER_PASSWORD },
    });
    if (!auth.ok()) throw new Error(`/api/test-auth failed: ${auth.status()} ${await auth.text()}`);
    const page = await context.newPage();

    await page.goto("/companies");
    await page.getByRole("button", { name: "+ New" }).click();
    await page.getByPlaceholder("Company name").fill(COMPANY_NAME);
    await page.getByPlaceholder("Domain (e.g. acme.com)").fill(COMPANY_DOMAIN);
    await page.getByRole("button", { name: "Add" }).click();

    const row = page.locator("tr", { hasText: COMPANY_NAME });
    await expect(row).toBeVisible();
    const href = await row.getAttribute("data-href");
    if (!href) throw new Error("new company row missing data-href");
    companyId = href.split("/").pop()!;

    await context.close();
  });

  test.afterAll(async () => {
    // No delete policies exist on any table — remove every fact belonging
    // to the test company instead, so it starts at zero included facts
    // next run (idempotent/reusable).
    const { runner } = await signInRunner();
    const { error } = await runner.from("facts").update({ status: "removed" }).eq("company_id", companyId);
    if (error) throw error;
  });

  test("enrich queues a job + spinner, a runner-inserted fact appears live as a suggested source", async ({
    page,
  }) => {
    // Generous budget: an enrich round trip plus a realtime round trip, each
    // with its own warm-up wait (see realtime-smoke.spec.ts).
    test.setTimeout(90000);

    // Source view — this test drives the fact list (.item rows), which
    // PDF report (now the default view) doesn't render.
    await page.goto(`/companies/${companyId}?view=source`);
    const pill = page.locator(".toolbar .status");
    await expect(pill).not.toHaveClass(/in_progress/);

    // --- Task 8: Enrich queues a job; Task 7's spinner pill shows ---
    await page.getByRole("button", { name: "Enrich" }).click();
    await expect(pill).toHaveClass(/in_progress/, { timeout: 15000 });
    await expect(pill).toHaveText(/In progress/);

    const { runner, userId } = await signInRunner();
    const { data: jobs, error: jobsError } = await runner
      .from("enrichment_jobs")
      .select("id, status, requested_by")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (jobsError) throw jobsError;
    expect(jobs).toHaveLength(1);
    expect(jobs![0].status).toBe("queued");
    expect(jobs![0].requested_by).toBe(userId);

    // Mark the job done (mirrors what the real runner would do, and — since
    // there's no delete policy — keeps it from wedging the company in a
    // permanent spinner state for future runs of this reused test company).
    await runner.from("enrichment_jobs").update({ status: "done" }).eq("id", jobs![0].id);
    await expect(pill).not.toHaveClass(/in_progress/, { timeout: 15000 });

    // ponytail: confirmed by hand (realtime-smoke.spec.ts) that a
    // freshly-subscribed postgres_changes channel needs a few seconds before
    // its change stream actually flows — give it a beat before writing the
    // row we're about to watch for.
    await page.waitForTimeout(5000);

    // --- stubbed skill output: runner (can_enrich=true) inserts a fact +
    // source, standing in for a real enrichment run. No status: the column
    // defaults to 'included' (§E auto-include by rule). ---
    const factText = `E2E stub fact ${Date.now()}`;
    const { data: fact, error: factError } = await runner
      .from("facts")
      .insert({ company_id: companyId, section: "news", text: factText })
      .select("id")
      .single();
    if (factError) throw factError;

    const { error: sourceError } = await runner
      .from("sources")
      .insert({ fact_id: fact.id, publisher: "E2E Wire", url: "https://e2e-test.example/story", year: 2026 });
    if (sourceError) throw sourceError;

    // Still-open page, no reload — Task 7's realtime subscription surfaces
    // it. Still auto-included (§E), but the review gate marks it as a
    // suggested source until someone approves or denies it.
    const item = page.locator(".item", { hasText: factText });
    await expect(item).toBeVisible({ timeout: 15000 });
    await expect(item).not.toHaveClass(/\bremoved\b/);
    await expect(item.getByText("Suggested")).toBeVisible();
    await expect(item.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(item.getByRole("button", { name: "Deny" })).toBeVisible();

    // Persists as a suggestion across reload; approving flips it back to the
    // remove-only state (§E) and unblocks the PDF.
    await page.reload();
    const persistedItem = page.locator(".item", { hasText: factText });
    await expect(persistedItem).toBeVisible();
    await persistedItem.getByRole("button", { name: "Approve" }).click();
    await expect(persistedItem.getByRole("button", { name: "Remove from report" })).toBeVisible();
  });
});
