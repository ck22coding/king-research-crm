import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Loaded again here (also done by playwright.config.ts / global-setup.ts) —
// test files run in their own worker process, so don't rely on module-load
// order in the main process.
process.loadEnvFile("/Users/carterking/Projects/dad/.env");

// Live seed: supabase/seed.sql.
const WAYSTAR_ID = "c0000000-0000-4000-8000-000000000001"; // seeded status 'ready'
const AVAILITY_ID = "c0000000-0000-4000-8000-000000000003"; // seeded status 'queued'

// Authenticated (default storageState from playwright.config.ts — runner session).
test.describe("realtime status pills", () => {
  test("company status changes and enrichment_jobs inserts update still-open pages live, no reload", async ({
    page,
  }) => {
    // Generous budget: two realtime round trips, each with an explicit
    // warm-up wait plus a timeout margin (see comments below).
    test.setTimeout(90000);

    // A second, bare Node Supabase client signed in as the runner —
    // deliberately NOT the Playwright page/browser (mirrors the task: "from
    // a second Supabase client signed in as the runner, not through the
    // UI"). Runner has can_enrich=true (BUILD.md Phase 1), so it can update
    // companies.status and enrichment_jobs.
    const runner = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: signIn, error: authError } = await runner.auth.signInWithPassword({
      email: process.env.RUNNER_EMAIL!,
      password: process.env.RUNNER_PASSWORD!,
    });
    if (authError) throw authError;
    const userId = signIn.user!.id;

    // --- company status change, seen live on the still-open companies list ---
    await page.goto("/companies");
    const row = page.locator("tr", { hasText: "Waystar" });
    await expect(row.locator(".status")).toHaveText(/Ready/);
    // ponytail: confirmed by hand that a freshly-subscribed postgres_changes
    // channel needs a few seconds before its change stream actually starts
    // flowing (subscribe() acks "SUBSCRIBED" well before that) — a Supabase
    // Realtime warm-up characteristic, not app flakiness. Give it a beat
    // before writing the row we're about to watch for.
    await page.waitForTimeout(5000);

    const { error: statusError } = await runner
      .from("companies")
      .update({ status: "in_progress" })
      .eq("id", WAYSTAR_ID);
    if (statusError) throw statusError;

    try {
      await expect(row.locator(".status")).toHaveClass(/in_progress/, { timeout: 15000 });
      await expect(row.locator(".status")).toHaveText(/In progress/);
    } finally {
      await runner.from("companies").update({ status: "ready" }).eq("id", WAYSTAR_ID);
    }

    // --- enrichment_jobs insert, seen live on the still-open record page ---
    await page.goto(`/companies/${AVAILITY_ID}`);
    const pill = page.locator(".toolbar .status");
    await expect(pill).toHaveText(/Queued/);
    await page.waitForTimeout(5000); // same realtime warm-up as above

    const { data: job, error: jobError } = await runner
      .from("enrichment_jobs")
      .insert({ company_id: AVAILITY_ID, status: "queued", requested_by: userId })
      .select("id")
      .single();
    if (jobError) throw jobError;

    try {
      // Availity's own company.status stays 'queued' — the spinner comes
      // purely from the active enrichment_jobs row (task 7's OR logic).
      await expect(pill).toHaveClass(/in_progress/, { timeout: 15000 });
      await expect(pill).toHaveText(/In progress/);
    } finally {
      // No delete policy on enrichment_jobs — mark it done instead.
      await runner.from("enrichment_jobs").update({ status: "done" }).eq("id", job.id);
    }
  });
});
