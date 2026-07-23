import { request } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const STORAGE_STATE_PATH = "tests/.auth/runner.json";

// Seeded companies the suite mutates (supabase/seed.sql). A crashed run can
// skip a spec's finally-cleanup and leave an active job / stuck status that
// fails the next run's preconditions, so reset exactly these two — never
// other companies, whose jobs may be real work in flight.
const BASELINE = [
  { id: "c0000000-0000-4000-8000-000000000001", status: "ready" }, // Waystar
  { id: "c0000000-0000-4000-8000-000000000003", status: "queued" }, // Availity
];

// The suite expects its queued jobs to STAY queued — stop any local runner
// daemon (node index.mjs) before running tests, or it will claim them and
// start real paid research runs.
async function resetSeededCompanies() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.RUNNER_EMAIL!,
    password: process.env.RUNNER_PASSWORD!,
  });
  if (error) throw error;

  for (const { id, status } of BASELINE) {
    // No delete policy on enrichment_jobs — mark strays done, like the specs do.
    await supabase
      .from("enrichment_jobs")
      .update({ status: "done" })
      .eq("company_id", id)
      .in("status", ["queued", "running"]);
    await supabase.from("companies").update({ status }).eq("id", id);
  }
}

// Signs in as the single runner account (can_enrich=true) and saves the
// resulting Supabase cookies for every Playwright test to reuse.
export default async function globalSetup() {
  process.loadEnvFile("/Users/carterking/Projects/dad/.env");

  const email = process.env.RUNNER_EMAIL;
  const password = process.env.RUNNER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "RUNNER_EMAIL/RUNNER_PASSWORD missing from /Users/carterking/Projects/dad/.env",
    );
  }

  await resetSeededCompanies();

  // Same PW_PORT override as playwright.config.ts — keep in sync.
  const context = await request.newContext({
    baseURL: `http://localhost:${process.env.PW_PORT ?? "3000"}`,
  });
  const response = await context.post("/api/test-auth", { data: { email, password } });
  if (!response.ok()) {
    throw new Error(`/api/test-auth failed: ${response.status()} ${await response.text()}`);
  }

  fs.mkdirSync("tests/.auth", { recursive: true });
  await context.storageState({ path: STORAGE_STATE_PATH });
  await context.dispose();
}
