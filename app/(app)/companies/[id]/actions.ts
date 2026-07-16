"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// The migration's "authenticated update" policy on facts is `using (true)` —
// any signed-in user can approve/reject, so no can_enrich check here. The
// .in("status", [...]) scopes this action to the transitions the UI offers:
// suggested→approved/rejected, and approved→rejected (un-accept/"Remove").
// Server actions are directly callable, so don't trust the caller.
export async function setFactStatus(factId: string, status: "approved" | "rejected") {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facts")
    .update({ status })
    .eq("id", factId)
    .in("status", ["suggested", "approved"])
    .select("company_id")
    .single();
  if (error || !data) return; // realtime refresh keeps stale UI honest
  revalidatePath(`/companies/${data.company_id}`);
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
  // jobs); harmless at this scale — the runner processes one job at a time.
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
