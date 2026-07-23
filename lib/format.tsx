// Ports crm-ui/index.html's small render helpers (statusPill, avatar, fmtDate)
// as components — the prototype's string-template functions become JSX.
import type { ReactNode } from "react";
import type { CompanyStatus } from "./supabase/database.types";

// "failed" and "partial" are pill-only states derived from the latest
// enrichment job, not companies.status values — the runner restores the
// company's own status on failure, and the job row carries the detail.
type PillStatus = CompanyStatus | "failed" | "partial";

export const STATUS_LABEL: Record<PillStatus, string> = {
  ready: "Ready",
  in_progress: "In progress",
  queued: "Queued",
  failed: "Failed",
  partial: "Partial",
};

// Partial reports (topic-graph enrichment, runner spec §10): when one topic
// node dies, the runner finishes the job 'done' with the surviving sections'
// facts written, and records what was lost as a note in enrichment_jobs.error.
// Without this the company reads a plain green "Ready" and a report with a
// hole in it is indistinguishable from a complete one.
//
// The runner writes: `partial: <sections> failed; the rest of the report completed`
// Parsing is deliberately forgiving — if that wording ever drifts, we fall
// back to showing the raw note rather than silently swallowing it.
export function parsePartial(job?: { status: string; error: string | null } | null): {
  sections: string[];
  note: string;
} | null {
  if (job?.status !== "done" || !job.error) return null;
  const note = job.error.trim();
  if (!/^partial\b/i.test(note)) return null;
  const listed = note.match(/^partial:\s*(.+?)\s+failed\b/i);
  return { sections: listed ? listed[1].split(/,\s*/).filter(Boolean) : [], note };
}

// Spinner state (Task 7): in_progress-looking pill whenever the company is
// mid-brief OR has a queued/running enrichment_jobs row, even if the
// company row itself hasn't flipped to in_progress yet.
export function effectiveStatus(status: CompanyStatus, hasActiveJob: boolean): CompanyStatus {
  return hasActiveJob || status === "in_progress" ? "in_progress" : status;
}

export function StatusPill({ status, title }: { status: PillStatus; title?: string }) {
  return (
    <span className={`status ${status}`} title={title}>
      <span className="dot"></span>
      {STATUS_LABEL[status]}
    </span>
  );
}

// The one derivation of "what state is this company's brief in", given its
// LATEST enrichment job: failed → loud red; queued/running → spinner (a fresh
// run supersedes an older partial); done-but-partial → amber; otherwise the
// company's own status. The record page's rail reads this too, so failure
// surfacing can't drift between the two views.
export function deriveBriefStatus(
  status: CompanyStatus,
  job?: { status: string; error: string | null } | null
): PillStatus {
  if (job?.status === "failed") return "failed";
  const active = job?.status === "queued" || job?.status === "running";
  if (active) return "in_progress";
  if (parsePartial(job)) return "partial";
  return effectiveStatus(status, false);
}

// Pill for a company given its LATEST enrichment job.
export function CompanyStatusPill({
  status,
  job,
}: {
  status: CompanyStatus;
  job?: { status: string; error: string | null } | null;
}) {
  const pill = deriveBriefStatus(status, job);
  if (pill === "failed") {
    // `||` (not ??): an empty-string error must still show the pill's fallback.
    return <StatusPill status="failed" title={job?.error || "unknown error"} />;
  }
  if (pill === "partial") {
    return <StatusPill status="partial" title={parsePartial(job)!.note} />;
  }
  return <StatusPill status={pill} />;
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
