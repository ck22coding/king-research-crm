import { test, expect, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Loaded again here (also done by playwright.config.ts / global-setup.ts) —
// test files run in their own worker process, so don't rely on module-load
// order in the main process.
process.loadEnvFile("/Users/carterking/Projects/dad/.env");

// Live seed: supabase/seed.sql. Post-pivot (§E) facts are auto-included; the
// only curation actions are Remove from report and Restore. Waystar's
// growth_signals "38 open roles" fact is the fixture — beforeEach resets it
// to 'included' so the suite is self-resetting.
const WAYSTAR_ID = "c0000000-0000-4000-8000-000000000001";
const FIXTURE_FACT_ID = "f0000000-0000-4000-8000-000000000107";
const FACT_TEXT = "38 open roles";

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

test.describe("remove / restore facts (§E auto-include)", () => {
  test.beforeEach(async () => {
    const supabase = await signedInClient();
    const { error } = await supabase
      .from("facts")
      .update({ status: "included" })
      .eq("id", FIXTURE_FACT_ID);
    if (error) throw error;
  });

  // A dedicated, freshly-authenticated context rather than the shared `page`
  // fixture's runner storageState. That storageState (one session, one
  // refresh token) is copied into every parallel test file's context;
  // Supabase rotates the refresh token on use, so concurrent contexts
  // sharing it race and the loser gets logged out on its next request. The
  // tests here reload(), which would hit exactly that race under
  // `fullyParallel`. Signing in fresh gives each its own refresh-token
  // lineage that no other test shares.
  async function freshPage(browser: Browser, baseURL: string | undefined) {
    const context = await browser.newContext({ baseURL });
    const auth = await context.request.post("/api/test-auth", {
      data: { email: process.env.RUNNER_EMAIL, password: process.env.RUNNER_PASSWORD },
    });
    if (!auth.ok()) throw new Error(`/api/test-auth failed: ${auth.status()} ${await auth.text()}`);
    return { context, page: await context.newPage() };
  }

  test("removing an included fact hides it from Source and persists across reload", async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await freshPage(browser, baseURL);

    await page.goto(`/companies/${WAYSTAR_ID}?view=source`);

    const item = page.locator(".item", { hasText: FACT_TEXT });
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: "Remove from report" }).click();

    // Removed facts are filtered out of Source in memory — the item disappears.
    await expect(item).toHaveCount(0);

    await page.reload();
    await expect(page.locator(".item", { hasText: FACT_TEXT })).toHaveCount(0);

    await context.close();
  });

  test("removed fact is marked in History and Restore returns it to Source", async ({
    browser,
    baseURL,
  }) => {
    // Start from the removed state (as if a colleague removed it earlier).
    const supabase = await signedInClient();
    const { error } = await supabase
      .from("facts")
      .update({ status: "removed" })
      .eq("id", FIXTURE_FACT_ID);
    if (error) throw error;

    const { context, page } = await freshPage(browser, baseURL);

    await page.goto(`/companies/${WAYSTAR_ID}?view=history`);
    const item = page.locator(".item", { hasText: FACT_TEXT });
    await expect(item).toBeVisible();
    await expect(item.getByText("Removed from report")).toBeVisible();

    await item.getByRole("button", { name: "Restore" }).click();

    // Server action revalidates in place — the removed marker goes away.
    await expect(item.getByText("Removed from report")).toHaveCount(0);

    // And Source shows the fact again.
    await page.goto(`/companies/${WAYSTAR_ID}?view=source`);
    await expect(page.locator(".item", { hasText: FACT_TEXT })).toBeVisible();

    await context.close();
  });
});
