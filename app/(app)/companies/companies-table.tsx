"use client";

import { useState } from "react";
import { addCompany } from "./actions";
import { Avatar, CompanyStatusPill, fmtDate } from "@/lib/format";
import type { CompanyStatus } from "@/lib/supabase/database.types";

export type CompanyRow = {
  id: string;
  name: string;
  domain: string;
  ownership: string | null;
  status: CompanyStatus;
  updated_at: string;
};

// Ports crm-ui/index.html's matches(): plain substring match over the
// fields the row shows.
function matches(row: CompanyRow, q: string) {
  if (!q) return true;
  const text = `${row.name} ${row.domain} ${row.ownership ?? ""}`.toLowerCase();
  return text.includes(q.toLowerCase());
}

// Owns the toolbar's filter input + "+ New" form + the table itself: all
// three need to share the live filter/add state, so they live in one small
// client component fed by the server-fetched `companies` prop — no re-fetch.
export default function CompaniesTable({
  companies,
  latestJobByCompany = {},
  latestEnrichByCompany = {},
}: {
  companies: CompanyRow[];
  latestJobByCompany?: Record<string, { status: string; error: string | null }>;
  latestEnrichByCompany?: Record<string, { status: string; error: string | null }>;
}) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const rows = companies.filter((c) => matches(c, q));

  async function handleAdd(formData: FormData) {
    await addCompany(formData);
    setAdding(false);
  }

  return (
    <>
      <div className="toolbar">
        <span className="title">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2.5" y="1.5" width="8" height="13" rx="1" />
            <path d="M10.5 5.5h3v9h-3" />
          </svg>
          Companies
        </span>
        <span className="pill">{companies.length} records</span>
        <span className="spacer"></span>
        <label className="filter-input">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2 3.5h12M4.5 8h7M6.8 12.5h2.4" />
          </svg>
          <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>
          + New
        </button>
      </div>

      {adding && (
        <form action={handleAdd} className="add-form">
          <input name="name" placeholder="Company name" required autoFocus />
          <input name="domain" placeholder="Domain (e.g. acme.com)" required />
          <button type="submit" className="btn primary">
            Add
          </button>
          <button type="button" className="btn" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="rec">Company</th>
              <th>Domain</th>
              <th>Ownership</th>
              <th>Status</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} data-href={`/companies/${c.id}`}>
                <td className="rec">
                  <span className="rec-chip">
                    <Avatar name={c.name} id={c.id} />
                    {c.name}
                  </span>
                </td>
                <td>
                  <button
                    className="link-chip"
                    data-url={`https://${c.domain}`}
                    data-tip={`Open ${c.domain} in reading pane`}
                  >
                    {c.domain}
                  </button>
                </td>
                <td>{c.ownership}</td>
                <td>
                  <CompanyStatusPill
                    status={c.status}
                    job={latestJobByCompany[c.id]}
                    enrichJob={latestEnrichByCompany[c.id]}
                  />
                </td>
                <td>{fmtDate(c.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="empty" style={{ margin: 24 }}>
            No companies match &ldquo;{q}&rdquo;.
          </div>
        )}
      </div>
    </>
  );
}
