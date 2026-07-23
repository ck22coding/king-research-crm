import { createClient } from "@/lib/supabase/server";
import CompaniesTable from "./companies-table";
import RealtimeRefresh from "@/lib/realtime";

// Server component: authenticated-read RLS covers this fetch for any
// signed-in user (supabase/migrations/20260715120000_initial_schema.sql).
export default async function CompaniesPage() {
  const supabase = await createClient();
  const [{ data: companies }, { data: jobs }, { data: { user } }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, domain, ownership, status, updated_at")
      .order("updated_at", { ascending: false }),
    // Each company's status pill keys off its LATEST job: queued/running →
    // spinner, failed → loud red pill with the error. Fetched newest-first,
    // reduced to first-per-company below. The explicit limit matches
    // PostgREST's max_rows (which would silently cap us anyway); newest-first
    // ordering means truncation only ever drops OLD rows, which the
    // latest-per-company reduction never needed.
    supabase
      .from("enrichment_jobs")
      .select("company_id, status, error, requested_by")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.auth.getUser(),
  ]);

  const latestJobByCompany: Record<string, { status: string; error: string | null }> = {};
  for (const j of jobs ?? []) {
    latestJobByCompany[j.company_id] ??= j;
  }

  // Loud "your runner isn't connected" banner: only when the signed-in user
  // has a job actually waiting on it, and their heartbeat is missing/stale.
  const { data: hb } = user
    ? await supabase.from("runner_heartbeats").select("last_seen_at").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const myPending = (jobs ?? []).some(
    (j) => j.requested_by === user?.id && (j.status === "queued" || j.status === "running"),
  );
  const runnerOffline =
    myPending && (!hb || Date.now() - new Date(hb.last_seen_at).getTime() > 120_000);

  return (
    <>
      {runnerOffline && (
        <div className="empty" data-testid="runner-offline">
          Your runner isn&rsquo;t connected — jobs will wait until it is.{" "}
          <a href="/onboarding">Set it up →</a>
        </div>
      )}
      <RealtimeRefresh />
      <CompaniesTable companies={companies ?? []} latestJobByCompany={latestJobByCompany} />
    </>
  );
}
