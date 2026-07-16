"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// People paste full URLs ("https://www.overjet.com/") but the runner only
// accepts bare domains ("overjet.com") — normalize here so bad input can
// never reach the job queue and fail minutes later.
function normalizeDomain(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
}

// created_by comes from the server-side session, never from the client —
// the insert RLS policy requires created_by = auth.uid().
export async function addCompany(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const domain = normalizeDomain(String(formData.get("domain") ?? ""));
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
