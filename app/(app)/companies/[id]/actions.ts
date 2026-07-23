"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REPORT_SECTIONS } from "@/lib/pdf/report";

// Same filtered set the page and pdf route gate on — a legacy-slug fact
// (History-only, never in the PDF) must not wedge Generate into a silent
// no-op while the button renders enabled (codex). company_summary is the
// TL;DR card, never a fact section.
const REPORT_SECTION_SLUGS = REPORT_SECTIONS.map((s) => s.slug).filter(
  (s): s is Exclude<(typeof REPORT_SECTIONS)[number]["slug"], "company_summary"> => s !== "company_summary",
);

// The migration's "authenticated update" policy on facts is `using (true)` —
// any signed-in user can curate, so no can_enrich check here.
// `from` pins the transition to the state the button was RENDERED against:
// a stale Remove (drawn while included, clicked after a colleague already
// removed it) must be a no-op. Server actions are directly callable, so
// don't trust the caller.
// Runtime transition allowlist. `from` is caller-supplied and TypeScript
// unions don't exist at runtime — a hand-crafted call must not invent
// transitions the UI never offers. Post-pivot (§E) the two states are
// symmetric: Remove from report, and Restore for walking a removal back.
const LEGAL_TRANSITIONS: Record<string, string[]> = {
  included: ["removed"],
  removed: ["included"],
};

export async function setFactStatus(
  factId: string,
  status: "included" | "removed",
  from: "included" | "removed",
) {
  if (!LEGAL_TRANSITIONS[from]?.includes(status)) return;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facts")
    // Any explicit curation (Remove/Deny/Restore) counts as a review — it
    // stamps reviewed_at so the fact stops gating the PDF (see approveFact).
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", factId)
    .eq("status", from)
    .select("company_id")
    .single();
  if (error || !data) return; // realtime refresh keeps stale UI honest
  revalidatePath(`/companies/${data.company_id}`);
}

// The review gate's two halves. Facts land from the runner with reviewed_at
// null ("suggested"), and the PDF route refuses to generate while any exist.
// Approve keeps the fact included and stamps it reviewed; Deny removes it.
// Both are pinned to the suggested state (`reviewed_at is null`) — a stale
// Deny drawn before a colleague approved must be a no-op, not silently
// remove an approved fact (same rationale as setFactStatus's `from` pin).
export async function approveFact(factId: string) {
  await reviewFact(factId, "included");
}

export async function denyFact(factId: string) {
  await reviewFact(factId, "removed");
}

async function reviewFact(factId: string, status: "included" | "removed") {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facts")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", factId)
    .eq("status", "included")
    .is("reviewed_at", null)
    .select("company_id")
    .single();
  if (error || !data) return;
  revalidatePath(`/companies/${data.company_id}`);
}

// Queues a prose build: a kind='generate' job the local runner picks up and
// answers with ranking + synthesis only (no research). Only meaningful once
// every suggested source is reviewed — the prose must come from approved
// sources — so it refuses while any suggestion is pending, and the same
// active-job guard as enrichCompany applies (DB unique index backstops both).
export async function generateReport(companyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const [{ data: active }, { data: pending }] = await Promise.all([
    supabase
      .from("enrichment_jobs")
      .select("id")
      .eq("company_id", companyId)
      .in("status", ["queued", "running"])
      .limit(1),
    supabase
      .from("facts")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "included")
      .in("section", REPORT_SECTION_SLUGS)
      .is("reviewed_at", null)
      .limit(1),
  ]);
  if (active?.length || pending?.length) return;

  await supabase
    .from("enrichment_jobs")
    .insert({ company_id: companyId, requested_by: user.id, kind: "generate" });
  revalidatePath(`/companies/${companyId}`);
}

// Queues an enrichment run (Task 8). status defaults to 'queued' per the
// table default; requested_by comes from the server-side session, never the
// client — the insert RLS policy requires requested_by = auth.uid(). No
// client-side status flip here: Task 7's realtime subscription (lib/realtime.tsx)
// already reflects the new row as a spinner pill everywhere it's open.
export async function enrichCompany(companyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // ponytail: check-then-insert race is possible (no unique index on active
  // jobs); harmless — the runner serializes jobs per company (in-process
  // lock), so a duplicate just runs later and dedups to zero new facts.
  const { data: active } = await supabase
    .from("enrichment_jobs")
    .select("id")
    .eq("company_id", companyId)
    .in("status", ["queued", "running"])
    .limit(1);
  if (active?.length) return;

  await supabase.from("enrichment_jobs").insert({ company_id: companyId, requested_by: user.id });
  revalidatePath(`/companies/${companyId}`);
}
