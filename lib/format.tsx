// Ports crm-ui/index.html's small render helpers (statusPill, avatar, fmtDate)
// as components — the prototype's string-template functions become JSX.
import type { CompanyStatus } from "./supabase/database.types";

const STATUS_LABEL: Record<CompanyStatus, string> = {
  ready: "Ready",
  in_progress: "In progress",
  queued: "Queued",
};

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
