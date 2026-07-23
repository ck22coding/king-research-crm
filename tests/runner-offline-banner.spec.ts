import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Test user = the fixture account global-setup signs in as (see tests/global-setup.ts).
function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

test("banner shows with a queued job and no fresh heartbeat, clears with one", async ({ page }) => {
  const supabase = db();
  const { data: auth } = await supabase.auth.signInWithPassword({
    email: process.env.RUNNER_EMAIL!,
    password: process.env.RUNNER_PASSWORD!,
  });
  const uid = auth.user!.id;

  // Ensure NO fresh heartbeat, and one queued job owned by the test user.
  await supabase.from("runner_heartbeats").upsert({
    user_id: uid, last_seen_at: new Date(Date.now() - 10 * 60_000).toISOString(), hostname: "stale-test",
  });
  const { data: co } = await supabase.from("companies").select("id").eq("domain", "runner-test.example").single();
  const { data: job } = await supabase.from("enrichment_jobs")
    .insert({ company_id: co!.id, requested_by: uid }).select("id").single();

  try {
    await page.goto("/companies");
    await expect(page.getByTestId("runner-offline")).toBeVisible();

    await supabase.from("runner_heartbeats").upsert({
      user_id: uid, last_seen_at: new Date().toISOString(), hostname: "fresh-test",
    });
    await page.reload();
    await expect(page.getByTestId("runner-offline")).toHaveCount(0);
  } finally {
    await supabase.from("enrichment_jobs").update({ status: "failed", error: "test cleanup", finished_at: new Date().toISOString() }).eq("id", job!.id);
  }
});
