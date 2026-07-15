"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  // scope: "local" — sign out this session only. Default "global" revokes
  // the user's refresh token everywhere, which would log the runner out of
  // every other open tab/session (and, under parallel Playwright workers
  // sharing one runner storageState, breaks every other in-flight test).
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
