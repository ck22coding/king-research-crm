"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// The migration's "authenticated update" policy on facts is `using (true)` —
// any signed-in user can approve/reject, so no can_enrich check here.
// `from` pins the transition to the state the button was RENDERED against:
// a stale Reject (drawn while the fact was suggested, clicked after a
// colleague approved it) must be a no-op, not a silent un-approval. Server
// actions are directly callable, so don't trust the caller.
// Runtime transition allowlist. `from` is caller-supplied and TypeScript
// unions don't exist at runtime — a hand-crafted call must not move a fact
// out of 'rejected' or invent transitions the UI never offers.
const LEGAL_TRANSITIONS: Record<string, string[]> = {
  suggested: ["approved", "rejected"],
  approved: ["rejected"],
};

export async function setFactStatus(
  factId: string,
  status: "approved" | "rejected",
  from: "suggested" | "approved",
) {
  if (!LEGAL_TRANSITIONS[from]?.includes(status)) return;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facts")
    .update({ status })
    .eq("id", factId)
    .eq("status", from)
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
