import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Loaded again here (also done by playwright.config.ts / global-setup.ts) —
// test files run in their own worker process, so don't rely on module-load
// order in the main process.
process.loadEnvFile("/Users/carterking/Projects/dad/.env");

// Live seed: supabase/seed.sql. "GPO contracts" is this file's removed-fact
// fixture; remove-flow.spec.ts uses a different fact, and workers: 1 in
// playwright.config.ts means these files never run concurrently anyway.
const WAYSTAR_ID = "c0000000-0000-4000-8000-000000000001";
const REMOVED_FACT_ID = "f0000000-0000-4000-8000-000000000108";
const REMOVED_FACT_TEXT = "GPO contracts";
// Waystar's growth_signals fact — included (not removed), so History should
// show it un-marked, same as Source.
const INCLUDED_FACT_TEXT = "38 open roles";

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

    // Force the fixture fact into 'removed' so this file's tests have a
    // real removed-fact case to check, regardless of what state a prior
    // test run left it in.
    const { error } = await supabase.from("facts").update({ status: "removed" }).eq("id", REMOVED_FACT_ID);
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
    // Self-reset back to the baseline (included) so a re-run of this file
    // starts from the same known state.
    await supabase.from("facts").update({ status: "included" }).eq("id", REMOVED_FACT_ID);
  });

  test("removed fact is excluded from Source but present, marked, in History", async ({ page }) => {
    await page.goto(`/companies/${WAYSTAR_ID}?view=source`);
    await expect(page.locator(".item", { hasText: REMOVED_FACT_TEXT })).toHaveCount(0);

    await page.goto(`/companies/${WAYSTAR_ID}?view=history`);
    const item = page.locator(".item", { hasText: REMOVED_FACT_TEXT });
    await expect(item).toBeVisible();
    await expect(item).toHaveClass(/\bremoved\b/);
    await expect(item.getByText("Removed from report")).toBeVisible();

    // Removal is reversible post-pivot — History offers exactly one action,
    // Restore. (The item's source chips are also <button>s, so scope to
    // fact-actions.)
    await expect(item.locator(".fact-actions button")).toHaveCount(1);
    await expect(item.getByRole("button", { name: "Restore" })).toBeVisible();
  });

  test("facts still in the report show in History too, unmarked", async ({ page }) => {
    await page.goto(`/companies/${WAYSTAR_ID}?view=history`);

    const includedItem = page.locator(".item", { hasText: INCLUDED_FACT_TEXT });
    await expect(includedItem).toBeVisible();
    await expect(includedItem).not.toHaveClass(/\bremoved\b/);
    await expect(includedItem.getByText("Removed from report")).toHaveCount(0);
  });
});
