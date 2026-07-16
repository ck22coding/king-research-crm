"use client";

import { useState } from "react";
import { Avatar, StatusPill, fmtDate, money } from "@/lib/format";
import { primaryTam, type Market } from "@/lib/markets-data";

// Ports crm-ui/index.html's matches(): plain substring match over the
// fields the row shows.
function matches(m: Market, q: string) {
  if (!q) return true;
  const text = `${m.name} ${m.tags.join(" ")}`.toLowerCase();
  return text.includes(q.toLowerCase());
}

// Owns the toolbar's filter input + tag-row + the table itself, mirroring
// CompaniesTable's client-side filter (Task 4) — row nav (data-href) and
// TAM source tooltip are plain markup, no per-row state needed.
export default function MarketsTable({ markets }: { markets: Market[] }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const allTags = [...new Set(markets.flatMap((m) => m.tags))];
  const rows = markets.filter((m) => matches(m, q)).filter((m) => !tag || m.tags.includes(tag));

  function showToast() {
    setToast("Records get created by the research skills — coming with the Supabase backend.");
    setTimeout(() => setToast(null), 3200);
  }

  return (
    <>
      <div className="toolbar">
        <span className="title">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8.6 1.9L14 7.3a1.4 1.4 0 010 2L9.3 14a1.4 1.4 0 01-2 0L1.9 8.6A1.3 1.3 0 011.5 7.6V3a1.5 1.5 0 011.5-1.5h4.6c.37 0 .73.15 1 .4z" />
          </svg>
          Markets
        </span>
        <span className="pill">{markets.length} records</span>
        <span className="spacer"></span>
        <label className="filter-input">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2 3.5h12M4.5 8h7M6.8 12.5h2.4" />
          </svg>
          <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button className="btn primary" onClick={showToast}>
          + New
        </button>
      </div>

      <div className="tag-row">
        {allTags.map((t) => (
          <button
            key={t}
            className={`tag ${tag === t ? "on" : ""}`}
            onClick={() => setTag((current) => (current === t ? null : t))}
          >
            {t}
          </button>
        ))}
        {tag && (
          <button className="tag" onClick={() => setTag(null)}>
            Clear ✕
          </button>
        )}
      </div>

      <div className="scroll" style={{ marginTop: 10 }}>
        <table>
          <thead>
            <tr>
              <th className="rec">Market</th>
              <th>Industry tags</th>
              <th className="num">TAM</th>
              <th className="num">CAGR</th>
              <th>Maturity</th>
              <th>Status</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const tam = primaryTam(m);
              return (
                <tr key={m.id} data-href={`/markets/${m.id}`}>
                  <td className="rec">
                    <span className="rec-chip">
                      <Avatar name={m.name} id={m.id} />
                      {m.name}
                    </span>
                  </td>
                  <td>
                    {m.tags.map((t) => (
                      <span key={t} className="pill">
                        {t}
                      </span>
                    ))}
                  </td>
                  <td className="num" data-tip={`${tam.publisher}, ${tam.year}`}>
                    {money(tam.value_usd_b)}
                  </td>
                  <td className="num">{m.cagr.rate}%</td>
                  <td style={{ textTransform: "capitalize" }}>{m.dynamics.maturity}</td>
                  <td>
                    <StatusPill status={m.status} />
                  </td>
                  <td>{fmtDate(m.updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="empty" style={{ margin: 24 }}>
            No markets match.
          </div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
