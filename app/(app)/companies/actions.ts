"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// created_by comes from the server-side session, never from the client —
// the insert RLS policy requires created_by = auth.uid().
export async function addCompany(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  if (!name || !domain) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // status omitted — the companies.status column defaults to 'queued'.
  await supabase.from("companies").insert({ name, domain, created_by: user.id });
  revalidatePath("/companies");
}
