// Ports crm-ui/index.html's small render helpers (statusPill, avatar, fmtDate)
// as components — the prototype's string-template functions become JSX.
import type { ReactNode } from "react";
import type { CompanyStatus } from "./supabase/database.types";

export const STATUS_LABEL: Record<CompanyStatus, string> = {
  ready: "Ready",
  in_progress: "In progress",
  queued: "Queued",
};

// Spinner state (Task 7): in_progress-looking pill whenever the company is
// mid-brief OR has a queued/running enrichment_jobs row, even if the
// company row itself hasn't flipped to in_progress yet.
export function effectiveStatus(status: CompanyStatus, hasActiveJob: boolean): CompanyStatus {
  return hasActiveJob || status === "in_progress" ? "in_progress" : status;
}

export function StatusPill({ status }: { status: CompanyStatus }) {
  return (
    <span className={`status ${status}`}>
      <span className="dot"></span>
      {STATUS_LABEL[status]}
    </span>
  );
}

const AVATAR_HUES = [
  "linear-gradient(135deg,#2a78d6,#7fb0e8)",
  "linear-gradient(135deg,#4a3aa7,#8f83d9)",
  "linear-gradient(135deg,#1a8f68,#5cc39e)",
  "linear-gradient(135deg,#c46a1b,#e8a35c)",
];

function avatarBg(id: string) {
  const sum = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_HUES[sum % AVATAR_HUES.length];
}

export function Avatar({ name, id }: { name: string; id: string }) {
  return (
    <span className="avatar" style={{ background: avatarBg(id) }}>
      {name[0]}
    </span>
  );
}

export function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Ported 1:1 from crm-ui/index.html's money()/isDated() — used by the
// markets pages' KPI cards and bar chart.
export function money(v: number) {
  return "$" + (v >= 100 ? Math.round(v) : v.toFixed(1)) + "B";
}

export function isDated(year: number) {
  return new Date().getFullYear() - year >= 3;
}

// Shared atoms of the two record pages (companies/[id], markets/[id]) —
// previously defined verbatim in both. Structural SrcLike covers the DB's
// SourceRow (nullable title/year) and markets-data's MarketSource (optional).
export type SrcLike = { publisher: string; title?: string | null; url: string; year?: number | null };

export function Attr({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="attr">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function SrcChip({ source }: { source: SrcLike }) {
  const tip = `${source.title || "Source"} — ${source.publisher}${source.year ? `, ${source.year}` : ""}`;
  return (
    <button className="src" data-url={source.url} data-tip={tip}>
      <span className="src-dot">{source.publisher[0]}</span>
      {source.publisher}
    </button>
  );
}

export function EmptyState({ what }: { what: string }) {
  return (
    <div className="empty">
      Nothing found — &ldquo;{what}&rdquo; was checked and came back empty. That&rsquo;s a valid
      result, not an error.
    </div>
  );
}
