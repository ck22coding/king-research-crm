"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// The migration's "authenticated update" policy on facts is `using (true)` —
// any signed-in user can approve/reject, so no can_enrich check here.
export async function setFactStatus(factId: string, status: "approved" | "rejected") {
  const supabase = await createClient();
  await supabase.from("facts").update({ status }).eq("id", factId);
  revalidatePath("/(app)/companies/[id]", "page");
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

  await supabase.from("enrichment_jobs").insert({ company_id: companyId, requested_by: user.id });
  revalidatePath("/(app)/companies/[id]", "page");
}
