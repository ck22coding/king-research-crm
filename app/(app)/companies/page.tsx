import { createClient } from "@/lib/supabase/server";
import CompaniesTable from "./companies-table";

// Server component: authenticated-read RLS covers this fetch for any
// signed-in user (supabase/migrations/20260715120000_initial_schema.sql).
export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, domain, ownership, status, updated_at")
    .order("updated_at", { ascending: false });

  return <CompaniesTable companies={companies ?? []} />;
}
