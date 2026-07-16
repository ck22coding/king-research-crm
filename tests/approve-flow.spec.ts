import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Loaded again here (also done by playwright.config.ts / global-setup.ts) —
// test files run in their own worker process, so don't rely on module-load
// order in the main process.
process.loadEnvFile("/Users/carterking/Projects/dad/.env");

// Live seed: supabase/seed.sql. Waystar's growth_signals fact, seeded
// 'suggested'. Prior test runs (or manual approvals) may have flipped it to
// 'approved' — beforeEach resets it so this test is self-resetting.
const WAYSTAR_ID = "c0000000-0000-4000-8000-000000000001";
const SUGGESTED_FACT_ID = "f0000000-0000-4000-8000-000000000107";
const FACT_TEXT = "38 open roles";
// Waystar's GPO-contracts fact, seeded 'approved' — the un-accept fixture.
const APPROVED_FACT_ID = "f0000000-0000-4000-8000-000000000108";
const APPROVED_FACT_TEXT = "GPO contracts";

test.describe("approve / reject suggested facts", () => {
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

    const { error } = await supabase
      .from("facts")
      .update({ status: "suggested" })
      .eq("id", SUGGESTED_FACT_ID);
    if (error) throw error;

    // Self-resetting like the suggested fixture: prior runs of the remove
    // test leave this fact 'rejected'.
    const { error: approvedResetError } = await supabase
      .from("facts")
      .update({ status: "approved" })
      .eq("id", APPROVED_FACT_ID);
    if (approvedResetError) throw approvedResetError;
  });

  test("approving a suggested fact persists as approved across reload", async ({
    browser,
    baseURL,
  }) => {
    // A dedicated, freshly-authenticated context rather than the shared
    // `page` fixture's runner storageState. That storageState (one session,
    // one refresh token) is copied into every parallel test file's context;
    // Supabase rotates the refresh token on use, so concurrent contexts
    // sharing it race and the loser gets logged out on its next request.
    // This test reload()s, which would hit exactly that race under
    // `fullyParallel`. Signing in fresh here gives it its own refresh-token
    // lineage that no other test shares.
    const context = await browser.newContext({ baseURL });
    const auth = await context.request.post("/api/test-auth", {
      data: { email: process.env.RUNNER_EMAIL, password: process.env.RUNNER_PASSWORD },
    });
    if (!auth.ok()) throw new Error(`/api/test-auth failed: ${auth.status()} ${await auth.text()}`);
    const page = await context.newPage();

    await page.goto(`/companies/${WAYSTAR_ID}`);

    const item = page.locator(".item", { hasText: FACT_TEXT });
    await expect(item).toBeVisible();
    await expect(item).toHaveClass(/\bsuggested\b/);
    await expect(item.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(item.getByRole("button", { name: "Reject" })).toBeVisible();

    await item.getByRole("button", { name: "Approve" }).click();

    // Server action revalidates the page in place — no Approve/Reject left,
    // no 'suggested' class — before we even reload.
    await expect(item).not.toHaveClass(/\bsuggested\b/);
    await expect(item.getByRole("button", { name: "Approve" })).toHaveCount(0);

    await page.reload();

    const approvedItem = page.locator(".item", { hasText: FACT_TEXT });
    await expect(approvedItem).toBeVisible();
    await expect(approvedItem).not.toHaveClass(/\bsuggested\b/);
    await expect(approvedItem.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(approvedItem.getByRole("button", { name: "Reject" })).toHaveCount(0);

    await context.close();
  });

  test("removing an approved fact hides it and persists across reload", async ({
    browser,
    baseURL,
  }) => {
    // Same fresh-context rationale as the approve test above.
    const context = await browser.newContext({ baseURL });
    const auth = await context.request.post("/api/test-auth", {
      data: { email: process.env.RUNNER_EMAIL, password: process.env.RUNNER_PASSWORD },
    });
    if (!auth.ok()) throw new Error(`/api/test-auth failed: ${auth.status()} ${await auth.text()}`);
    const page = await context.newPage();

    await page.goto(`/companies/${WAYSTAR_ID}`);

    const item = page.locator(".item", { hasText: APPROVED_FACT_TEXT });
    await expect(item).toBeVisible();
    await expect(item.getByRole("button", { name: "Remove" })).toBeVisible();

    await item.getByRole("button", { name: "Remove" }).click();

    // Rejected facts are excluded from the page query — the item disappears.
    await expect(item).toHaveCount(0);

    await page.reload();
    await expect(page.locator(".item", { hasText: APPROVED_FACT_TEXT })).toHaveCount(0);

    await context.close();
  });
});
