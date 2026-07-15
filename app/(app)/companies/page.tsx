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
    // Which companies have a spinner-worthy job right now (Task 7).
    supabase.from("enrichment_jobs").select("company_id").in("status", ["queued", "running"]),
  ]);

  const activeJobCompanyIds = [...new Set((jobs ?? []).map((j) => j.company_id))];

  return (
    <>
      <RealtimeRefresh />
      <CompaniesTable companies={companies ?? []} activeJobCompanyIds={activeJobCompanyIds} />
    </>
  );
}
