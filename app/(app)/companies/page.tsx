import { createClient } from "@/lib/supabase/server";
import CompaniesTable from "./companies-table";
import RealtimeRefresh from "@/lib/realtime";

// Server component: authenticated-read RLS covers this fetch for any
// signed-in user (supabase/migrations/20260715120000_initial_schema.sql).
export default async function CompaniesPage() {
  const supabase = await createClient();
  const [{ data: companies }, { data: jobs }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, domain, ownership, status, updated_at")
      .order("updated_at", { ascending: false }),
    // Each company's status pill keys off its LATEST job: queued/running →
    // spinner, failed → loud red pill with the error. Fetched newest-first,
    // reduced to first-per-company below.
    supabase
      .from("enrichment_jobs")
      .select("company_id, status, error")
      .order("created_at", { ascending: false }),
  ]);

  const latestJob = new Map<string, { status: string; error: string | null }>();
  for (const j of jobs ?? []) {
    if (!latestJob.has(j.company_id)) latestJob.set(j.company_id, j);
  }
  const activeJobCompanyIds = [...latestJob.entries()]
    .filter(([, j]) => j.status === "queued" || j.status === "running")
    .map(([id]) => id);
  const failedJobErrors = Object.fromEntries(
    [...latestJob.entries()]
      .filter(([, j]) => j.status === "failed")
      .map(([id, j]) => [id, j.error ?? "unknown error"]),
  );

  return (
    <>
      <RealtimeRefresh />
      <CompaniesTable
        companies={companies ?? []}
        activeJobCompanyIds={activeJobCompanyIds}
        failedJobErrors={failedJobErrors}
      />
    </>
  );
}
