import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// Unauthenticated by design (runner has no session yet); the pairing code IS
// the credential: single-use, hashed at rest, 10-minute expiry, minted only
// by a signed-in browser. Service role never leaves this server handler.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const raw = typeof body?.code === "string" ? body.code : "";
  const code = raw.trim().toUpperCase().replace(/[^A-Z2-9]/g, "");
  if (code.length !== 8) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Atomic single-use claim: mark used only if still unused and unexpired.
  const { data: rows, error } = await admin
    .from("runner_pairing_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", createHash("sha256").update(code).digest("hex"))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = rows?.[0];
  if (!row) return NextResponse.json({ error: "Code invalid, already used, or expired" }, { status: 401 });

  const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(row.user_id);
  if (userErr || !userRes.user?.email) {
    return NextResponse.json({ error: "User not found" }, { status: 500 });
  }

  // generateLink creates the token WITHOUT sending an email — the hosted
  // SMTP 2-emails/hour cap is not involved.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userRes.user.email,
  });
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  return NextResponse.json({ token_hash: link.properties.hashed_token });
}
