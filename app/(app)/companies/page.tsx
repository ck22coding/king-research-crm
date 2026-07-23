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
      .select("company_id, status, error, kind")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.auth.getUser(),
  ]);

  type JobRow = { status: string; error: string | null };
  const latestJobByCompany: Record<string, JobRow> = {};
  // Partial is a property of the RESEARCH run, so it reads off the latest
  // kind='enrich' job, not the latest job overall — the normal flow puts a
  // clean kind='generate' job after the enrich, and reading partial off that
  // would silently clear the warning (same reason as the record page).
  const latestEnrichByCompany: Record<string, JobRow> = {};
  for (const j of jobs ?? []) {
    latestJobByCompany[j.company_id] ??= j;
    if (j.kind === "enrich") latestEnrichByCompany[j.company_id] ??= j;
  }

  // Loud "your runner isn't connected" banner: only when the signed-in user
  // has a job actually waiting on it, and their heartbeat is missing/stale.
  // Pending check is its own filtered query — the 1000-row pill window above
  // can drop an old queued job once other users pile newer jobs on top.
  const [{ data: hb }, { count: myPendingCount }] = user
    ? await Promise.all([
        supabase.from("runner_heartbeats").select("last_seen_at").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("enrichment_jobs")
          .select("id", { count: "exact", head: true })
          .eq("requested_by", user.id)
          .in("status", ["queued", "running"]),
      ])
    : [{ data: null }, { count: 0 }];
  const myPending = (myPendingCount ?? 0) > 0;
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
      <CompaniesTable
        companies={companies ?? []}
        latestJobByCompany={latestJobByCompany}
        latestEnrichByCompany={latestEnrichByCompany}
      />
    </>
  );
}
