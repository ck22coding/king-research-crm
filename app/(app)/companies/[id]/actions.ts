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
