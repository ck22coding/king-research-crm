import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Programmatic sign-in for Playwright only. Locked to RUNNER_EMAIL — anyone
// with the anon key and the real password could already do this directly
// against Supabase's REST API, so this isn't a privilege escalation, just a
// shortcut around hand-crafting @supabase/ssr's cookie wire format.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = body?.email;
  const password = body?.password;

  if (email !== process.env.RUNNER_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
