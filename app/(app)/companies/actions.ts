"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// People paste full URLs ("https://www.overjet.com/", "acme.com:8080/x") but
// the runner only accepts bare domains ("overjet.com"). URL.hostname strips
// scheme, path, AND port, and punycodes IDN to the ASCII form the runner's
// validator accepts. Web-form path only — the runner still validates as the
// backstop for any other writer.
function normalizeDomain(raw: string) {
  const trimmed = raw.trim().toLowerCase();
  try {
    const host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
  }
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
