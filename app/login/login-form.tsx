"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm({ linkError }: { linkError: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (signInError) {
      const invite = /signup|not allowed/i.test(signInError.message);
      setError(
        invite
          ? "This CRM is invite-only — ask Carter for an invite."
          : signInError.message,
      );
      setStatus("error");
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <main>
        <p>Check your email for a sign-in link.</p>
      </main>
    );
  }

  return (
    <main>
      {linkError && (
        <p role="alert">
          Sign-in link didn’t work: {linkError}. Enter your email to get a new one.
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send magic link"}
        </button>
        {status === "error" && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}
