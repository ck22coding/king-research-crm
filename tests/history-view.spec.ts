import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Loaded again here (also done by playwright.config.ts / global-setup.ts) —
// test files run in their own worker process, so don't rely on module-load
// order in the main process.
process.loadEnvFile("/Users/carterking/Projects/dad/.env");

// Live seed: supabase/seed.sql. Same "GPO contracts" fixture approve-flow.spec.ts
// uses for its "un-accept" test — seeded 'approved', both files reset it to
// 'approved' in their own beforeEach, so this is safe to share (workers: 1
// in playwright.config.ts means these never run concurrently).
const WAYSTAR_ID = "c0000000-0000-4000-8000-000000000001";
const APPROVED_FACT_ID = "f0000000-0000-4000-8000-000000000108";
const APPROVED_FACT_TEXT = "GPO contracts";
// Waystar's suggested growth_signals fact — included (not removed), so
// History should show it un-marked, same as Source.
const SUGGESTED_FACT_TEXT = "38 open roles";

test.describe("History view — durable archive", () => {
  test.beforeEach(async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: process.env.RUNNER_EMAIL!,
      password: process.env.RUNNER_PASSWORD!,
    });
    if (authError) throw authError;

    // Force the fixture fact into 'rejected' (removed) so this file's tests
    // have a real removed-fact case to check, regardless of what state a
    // prior test run left it in.
    const { error } = await supabase.from("facts").update({ status: "rejected" }).eq("id", APPROVED_FACT_ID);
    if (error) throw error;
  });

  test.afterEach(async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await supabase.auth.signInWithPassword({
      email: process.env.RUNNER_EMAIL!,
      password: process.env.RUNNER_PASSWORD!,
    });
    // Self-reset back to the seed's baseline so approve-flow.spec.ts (and a
    // re-run of this file) start from the same known state.
    await supabase.from("facts").update({ status: "approved" }).eq("id", APPROVED_FACT_ID);
  });

  test("removed fact is excluded from Source but present, marked, in History", async ({ page }) => {
    await page.goto(`/companies/${WAYSTAR_ID}?view=source`);
    await expect(page.locator(".item", { hasText: APPROVED_FACT_TEXT })).toHaveCount(0);

    await page.goto(`/companies/${WAYSTAR_ID}?view=history`);
    const item = page.locator(".item", { hasText: APPROVED_FACT_TEXT });
    await expect(item).toBeVisible();
    await expect(item).toHaveClass(/\bremoved\b/);
    await expect(item.getByText("Removed from report")).toBeVisible();

    // No re-approve action offered — rejected is terminal in the app today.
    // (The item's source chips are also <button>s, so scope to fact-actions.)
    await expect(item.locator(".fact-actions button")).toHaveCount(0);
  });

  test("facts still in the report show in History too, unmarked", async ({ page }) => {
    await page.goto(`/companies/${WAYSTAR_ID}?view=history`);

    const suggestedItem = page.locator(".item", { hasText: SUGGESTED_FACT_TEXT });
    await expect(suggestedItem).toBeVisible();
    await expect(suggestedItem).not.toHaveClass(/\bremoved\b/);
    await expect(suggestedItem.getByText("Removed from report")).toHaveCount(0);
  });
});
