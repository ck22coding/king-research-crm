import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Loaded again here (also done by playwright.config.ts / global-setup.ts) —
// test files run in their own worker process, so don't rely on module-load
// order in the main process.
process.loadEnvFile("/Users/carterking/Projects/dad/.env");

// Live seed: supabase/seed.sql. Waystar seeds with status 'ready' (no active
// job) — a clean baseline so the pill flip actually proves the insert
// happened, rather than R1 RCM's seeded 'in_progress' masking a no-op.
const WAYSTAR_ID = "c0000000-0000-4000-8000-000000000001";

// Authenticated (default storageState from playwright.config.ts — runner session).
test.describe("enrich button", () => {
  test("clicking Enrich queues an enrichment_jobs row and shows the spinner pill live", async ({
    page,
  }) => {
    // A second, bare Node Supabase client signed in as the runner — used to
    // read back enrichment_jobs (and clean up), not to drive the UI.
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

    await page.goto(`/companies/${WAYSTAR_ID}`);
    const pill = page.locator(".toolbar .status");
    await expect(pill).not.toHaveClass(/in_progress/);

    let jobId: string | undefined;
    try {
      await page.getByRole("button", { name: "Enrich" }).click();

      // Server action revalidates the page in place — no reload needed.
      await expect(pill).toHaveClass(/in_progress/, { timeout: 15000 });
      await expect(pill).toHaveText(/In progress/);

      const { data: jobs, error } = await runner
        .from("enrichment_jobs")
        .select("id, status, requested_by")
        .eq("company_id", WAYSTAR_ID)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;

      expect(jobs).toHaveLength(1);
      expect(jobs![0].status).toBe("queued");
      expect(jobs![0].requested_by).toBe(userId);
      jobId = jobs![0].id;
    } finally {
      // No delete policy on enrichment_jobs — mark it done instead, so the
      // spinner clears and other tests see Waystar back at its seeded 'ready'.
      if (jobId) {
        await runner.from("enrichment_jobs").update({ status: "done" }).eq("id", jobId);
      }
    }
  });
});
