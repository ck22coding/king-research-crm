import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// A partial report is the topic-graph pipeline's failure-containment payoff:
// one dead topic node no longer fails the job, it finishes 'done' with the
// surviving sections written and the loss recorded in enrichment_jobs.error.
// Nothing surfaced that before — the company read a plain green "Ready", so a
// brief with a hole in it looked identical to a complete one.

// Sign in ONCE for the whole file. Supabase rate-limits auth, and a
// signInWithPassword per test trips it as soon as the suite is run a few times
// in a row (the client comes back with a null user and every later `!` throws).
let clientPromise: Promise<{ supabase: SupabaseClient; uid: string }> | null = null;
function db() {
  clientPromise ??= (async () => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: process.env.RUNNER_EMAIL!,
      password: process.env.RUNNER_PASSWORD!,
    });
    if (error) throw error;
    return { supabase, uid: data.user!.id };
  })();
  return clientPromise;
}

// Its OWN company, deliberately not the shared `runner-test.example` fixture:
// the runner repo's lifecycle suite hammers that one, and these tests assert on
// "the newest job for this company", which a concurrent runner test would
// happily invalidate.
const DOMAIN = "partial-ui-test.example";

async function fixtureCompany(supabase: SupabaseClient, uid: string) {
  const { data: existing } = await supabase.from("companies").select("id").eq("domain", DOMAIN).maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from("companies")
    .insert({ name: "Partial UI Test Co", domain: DOMAIN, created_by: uid, status: "ready" })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

// Exactly the string runner/index.mjs writes on a partial run. If the runner's
// wording drifts, this test is what catches it.
const PARTIAL_NOTE = "partial: financials, risk_flags failed; the rest of the report completed";

async function newestJob(companyId: string, error: string | null) {
  const { supabase, uid } = await db();
  const { data, error: insertError } = await supabase
    .from("enrichment_jobs")
    .insert({
      company_id: companyId,
      requested_by: uid,
      status: "done",
      error,
      finished_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return data.id;
}

test("a partial run surfaces as a Partial pill plus a named-sections notice", async ({ page }) => {
  const { supabase, uid } = await db();
  const companyId = await fixtureCompany(supabase, uid);
  const jobId = await newestJob(companyId, PARTIAL_NOTE);

  try {
    await page.goto(`/companies/${companyId}`);

    // The loud part: names what was lost, in human section titles, not slugs.
    const notice = page.getByTestId("partial-report");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("This brief is incomplete");
    await expect(notice).toContainText("Financials");
    await expect(notice).toContainText("Risk Flags");

    // Not "Ready" — that was the whole bug.
    await expect(page.locator(".status.partial")).toHaveText(/Partial/);
    await expect(page.locator(".status.ready")).toHaveCount(0);

    // The rail's "Brief status" reads the same derivation as the pill.
    await expect(page.locator(".rail")).toContainText("Partial");
  } finally {
    await supabase.from("enrichment_jobs").delete().eq("id", jobId);
  }
});

test("a clean done job shows no partial notice", async ({ page }) => {
  const { supabase, uid } = await db();
  const companyId = await fixtureCompany(supabase, uid);
  const jobId = await newestJob(companyId, null);

  try {
    await page.goto(`/companies/${companyId}`);
    await expect(page.getByTestId("partial-report")).toHaveCount(0);
    await expect(page.locator(".status.partial")).toHaveCount(0);
  } finally {
    await supabase.from("enrichment_jobs").delete().eq("id", jobId);
  }
});
