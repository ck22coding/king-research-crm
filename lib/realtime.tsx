"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Mounted once per page (companies list / company record — Task 7). Opens
// realtime subscriptions on companies/enrichment_jobs/facts and calls
// router.refresh() on any change. That re-runs the page's server component,
// which refetches and re-renders with the existing markup (status pills,
// Task 6's suggested-fact Approve/Reject rows) — no client-side state
// duplication, and NOT a page reload (no full navigation, no lost scroll).
//
// ponytail: one router.refresh() per event, no debounce/coalescing — fine
// at this app's scale (a handful of companies, one runner). Add a debounce
// if a burst of writes ever makes this feel jumpy.
export default function RealtimeRefresh({ companyId }: { companyId?: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let authSub: { unsubscribe: () => void } | undefined;

    async function setup() {
      // @supabase/ssr's browser client (session lives in cookies) doesn't
      // hand the signed-in session to the realtime socket automatically —
      // without this, RLS on postgres_changes evaluates the connection as
      // anon and every change comes back "401 Unauthorized". Set it
      // explicitly before subscribing.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      supabase.realtime.setAuth(session?.access_token);

      // Long-lived tabs: when the session token refreshes (hourly), hand the
      // new JWT to the realtime socket too, or change events silently stop.
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, freshSession) => {
        if (freshSession) supabase.realtime.setAuth(freshSession.access_token);
      });
      authSub = subscription;

      const refresh = () => router.refresh();

      channel = supabase.channel(companyId ? `company:${companyId}` : "companies-list");
      channel.on(
        "postgres_changes",
        companyId
          ? { event: "*", schema: "public", table: "companies", filter: `id=eq.${companyId}` }
          : { event: "*", schema: "public", table: "companies" },
        refresh,
      );
      channel.on(
        "postgres_changes",
        companyId
          ? { event: "*", schema: "public", table: "enrichment_jobs", filter: `company_id=eq.${companyId}` }
          : { event: "*", schema: "public", table: "enrichment_jobs" },
        refresh,
      );
      // New/changed facts only matter scoped to an open company record.
      if (companyId) {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "facts", filter: `company_id=eq.${companyId}` },
          refresh,
        );
      }
      channel.subscribe();
    }

    setup();

    return () => {
      cancelled = true;
      authSub?.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [companyId, router]);

  return null;
}
