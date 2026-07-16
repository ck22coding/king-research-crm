import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Magic-link landing: Supabase redirects here after the user clicks the
// emailed link. Handles both forms GoTrue uses: ?code= (PKCE) and
// ?token_hash=&type= (OTP verify).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let errorMessage: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    errorMessage = error?.message ?? null;
  } else {
    errorMessage = "Invalid sign-in link.";
  }

  if (errorMessage) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorMessage)}`,
    );
  }
  return NextResponse.redirect(`${origin}/companies`);
}
