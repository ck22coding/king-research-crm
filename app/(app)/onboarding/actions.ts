"use server";

import { randomBytes, createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";

// 8 chars from a 32-symbol alphabet (no 0/O/1/I) = 40 bits of entropy —
// plenty for a single-use code that expires in 10 minutes.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function createPairingCode(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[bytes[i] % 32];

  const { error } = await supabase.from("runner_pairing_codes").insert({
    user_id: user.id,
    code_hash: createHash("sha256").update(code).digest("hex"),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
