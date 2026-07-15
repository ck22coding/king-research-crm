import { createClient } from "@/lib/supabase/server";
import { MARKETS_COUNT } from "@/lib/markets";
import { signOut } from "./actions";
import ShellEvents from "./shell-events";

// The real app shell (crm-ui/index.html's <div class="app"> ported 1:1):
// aside.sidebar + main.main, plus the reading-pane markup (hidden by
// default). ShellEvents (client component) wires up the click-delegation
// and pane behavior — this file stays a Server Component so the nav counts
// can be plain awaited queries.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { count: companiesCount } = await supabase
    .from("companies")
    .select("*", { count: "exact", head: true });

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="ws">
          <div className="ws-logo">K</div> King Research
        </div>

        <div className="nav-label">Records</div>
        <button className="nav-item" data-href="/companies">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2.5" y="1.5" width="8" height="13" rx="1" />
            <path d="M10.5 5.5h3v9h-3M5 4.5h1M7.5 4.5h1M5 7h1M7.5 7h1M5 9.5h1M7.5 9.5h1M5.5 14v-2h2v2" />
          </svg>
          Companies <span className="count">{companiesCount ?? ""}</span>
        </button>
        <button className="nav-item" data-href="/markets">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8.6 1.9L14 7.3a1.4 1.4 0 010 2L9.3 14a1.4 1.4 0 01-2 0L1.9 8.6A1.3 1.3 0 011.5 7.6V3a1.5 1.5 0 011.5-1.5h4.6c.37 0 .73.15 1 .4z" />
            <circle cx="5.2" cy="5.2" r="1" fill="currentColor" stroke="none" />
          </svg>
          Markets <span className="count">{MARKETS_COUNT}</span>
        </button>

        <div className="sidebar-foot">
          <form action={signOut}>
            <button type="submit" className="btn" style={{ width: "100%", marginBottom: 8 }}>
              Sign out
            </button>
          </form>
          <button className="link-chip" data-href="/onboarding" style={{ background: "none" }}>
            Set up the runner →
          </button>
        </div>
      </aside>

      <main className="main">{children}</main>

      <div className="bp-handle" id="bpHandle" hidden></div>
      <aside className="browser" id="browser" hidden>
        <div className="bp-head">
          <div className="bp-url">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="8" cy="8" r="6.2" />
              <path d="M2 8h12M8 1.8c-3.5 3.5-3.5 8.9 0 12.4M8 1.8c3.5 3.5 3.5 8.9 0 12.4" />
            </svg>
            <input id="bpUrl" spellCheck={false} />
          </div>
          <button className="ic" id="bpExt" title="Open in new tab">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6.5 3H3.7A1.2 1.2 0 002.5 4.2v8.1a1.2 1.2 0 001.2 1.2h8.1a1.2 1.2 0 001.2-1.2V9.5M9.5 2.5H13.5V6.5M13.2 2.8L7.5 8.5" />
            </svg>
          </button>
          <button className="ic" id="bpClose" title="Close (Esc)">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className="bp-hint">
          Reading pane — <b>some sites block embedding</b> and load blank; use ↗ to open those in a full tab.
        </div>
        <iframe id="bpFrame" title="Source reader"></iframe>
      </aside>

      <ShellEvents />
    </div>
  );
}
