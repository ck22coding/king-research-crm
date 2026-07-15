import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar, StatusPill, STATUS_LABEL, fmtDate } from "@/lib/format";
import { setFactStatus } from "./actions";
import type { FactSection, FactStatus } from "@/lib/supabase/database.types";

// Ports crm-ui/index.html's companyPage()/sectionCard()/itemRow()/srcChip()
// 1:1 as server-rendered markup. Reading-pane clicks are wired up by
// ShellEvents' document-level click delegation (app/(app)/shell-events.tsx)
// — the `.src` buttons below just need the right `data-url`, no per-chip
// client code.

// Canon slugs (supabase/migrations/20260715120000_initial_schema.sql) mapped
// to the approved display titles, in the fixed 8-section order. `whatIfEmpty`
// mirrors the prototype's per-section emptyState() copy.
const SECTIONS: { slug: FactSection; title: string; whatIfEmpty: string }[] = [
  { slug: "leadership", title: "Leadership & people", whatIfEmpty: "senior management changes" },
  { slug: "news", title: "News & announcements", whatIfEmpty: "recent company news" },
  { slug: "money", title: "Money", whatIfEmpty: "financial performance, funding & M&A" },
  { slug: "growth_signals", title: "Growth signals", whatIfEmpty: "hiring, contracts & customer wins" },
  { slug: "regulatory", title: "Regulatory", whatIfEmpty: "FDA / CMS / reimbursement news" },
  { slug: "risk_flags", title: "Risk flags", whatIfEmpty: "risk flags" },
  { slug: "segmentation", title: "Segmentation", whatIfEmpty: "how the business breaks down" },
  { slug: "market_sizing", title: "Market sizing", whatIfEmpty: "best-effort SAM estimates" },
];

type SourceRow = { publisher: string; title: string | null; url: string; year: number | null };
type FactRow = {
  id: string;
  section: FactSection;
  text: string;
  fact_date: string | null;
  status: FactStatus;
  sources: SourceRow[];
};

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: company }, { data: facts }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("facts")
      .select("id, section, text, fact_date, status, sources(publisher, title, url, year)")
      .eq("company_id", id)
      .neq("status", "rejected")
      .order("created_at"),
  ]);

  if (!company) notFound();

  const bySection = new Map<FactSection, FactRow[]>();
  for (const fact of (facts ?? []) as unknown as FactRow[]) {
    const list = bySection.get(fact.section) ?? [];
    list.push(fact);
    bySection.set(fact.section, list);
  }

  return (
    <>
      <div className="toolbar">
        <span className="crumbs">
          <button data-href="/companies">Companies</button> <span>/</span>{" "}
          <span style={{ color: "var(--ink)" }}>{company.name}</span>
        </span>
        <span className="spacer"></span>
        <StatusPill status={company.status} />
      </div>
      <div className="scroll">
        <div className="rec-head">
          <Avatar name={company.name} id={company.id} />
          <div>
            <h1>{company.name}</h1>
            <div className="sub">
              <button
                className="link-chip"
                data-url={`https://${company.domain}`}
                data-tip="Open in reading pane"
              >
                {company.domain} ↗
              </button>
              <span>·</span>
              <span>{company.hq}</span>
            </div>
          </div>
        </div>
        <div className="rec-body">
          <div className="rail">
            <h4>Record details</h4>
            <Attr k="Domain" v={company.domain} />
            <Attr k="Ownership" v={company.ownership} />
            <Attr k="Headquarters" v={company.hq} />
            <Attr k="Brief status" v={STATUS_LABEL[company.status]} />
            <Attr k="Last updated" v={fmtDate(company.updated_at)} />
          </div>
          <div className="content">
            <div className="card">
              <h3>TL;DR</h3>
              <div className="tldr">{company.tldr}</div>
            </div>
            {SECTIONS.map((section) => (
              <SectionCard
                key={section.slug}
                title={section.title}
                items={bySection.get(section.slug) ?? []}
                whatIfEmpty={section.whatIfEmpty}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Attr({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="attr">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function SectionCard({
  title,
  items,
  whatIfEmpty,
}: {
  title: string;
  items: FactRow[];
  whatIfEmpty: string;
}) {
  return (
    <div className="card">
      <h3>
        {title} <span className="count">{items.length || ""}</span>
      </h3>
      {items.length ? (
        items.map((item) => <ItemRow key={item.id} item={item} />)
      ) : (
        <EmptyState what={whatIfEmpty} />
      )}
    </div>
  );
}

function ItemRow({ item }: { item: FactRow }) {
  const suggested = item.status === "suggested";
  return (
    <div className={suggested ? "item suggested" : "item"}>
      <div className="row">
        <div className="txt">{item.text}</div>
        {item.fact_date && <div className="date">{fmtDate(item.fact_date)}</div>}
      </div>
      {item.sources.length > 0 && (
        <div className="srcs">
          {item.sources.map((source, i) => (
            <SrcChip key={i} source={source} />
          ))}
        </div>
      )}
      {suggested && <FactActions factId={item.id} />}
    </div>
  );
}

// Suggested facts only — approve/reject calls the setFactStatus server
// action directly (bind works in Server Components, no client JS needed).
function FactActions({ factId }: { factId: string }) {
  return (
    <div className="fact-actions">
      <span className="suggested-badge">Suggested</span>
      <form>
        <button type="submit" className="btn approve" formAction={setFactStatus.bind(null, factId, "approved")}>
          Approve
        </button>
      </form>
      <form>
        <button type="submit" className="btn reject" formAction={setFactStatus.bind(null, factId, "rejected")}>
          Reject
        </button>
      </form>
    </div>
  );
}

function SrcChip({ source }: { source: SourceRow }) {
  const tip = `${source.title || "Source"} — ${source.publisher}${source.year ? `, ${source.year}` : ""}`;
  return (
    <button className="src" data-url={source.url} data-tip={tip}>
      <span className="src-dot">{source.publisher[0]}</span>
      {source.publisher}
    </button>
  );
}

function EmptyState({ what }: { what: string }) {
  return (
    <div className="empty">
      Nothing found — &ldquo;{what}&rdquo; was checked and came back empty. That&rsquo;s a valid
      result, not an error.
    </div>
  );
}
