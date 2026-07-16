import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar, StatusPill, STATUS_LABEL, effectiveStatus, fmtDate, Attr, SrcChip, EmptyState } from "@/lib/format";
import { setFactStatus, enrichCompany } from "./actions";
import RealtimeRefresh from "@/lib/realtime";
import type { FactSection, FactStatus } from "@/lib/supabase/database.types";

// Ports crm-ui/index.html's companyPage()/sectionCard()/itemRow()/srcChip()
// 1:1 as server-rendered markup. Reading-pane clicks are wired up by
// ShellEvents' document-level click delegation (app/(app)/shell-events.tsx)
// — the `.src` buttons below just need the right `data-url`, no per-chip
// client code.

// Canon slugs (supabase/migrations/20260715120000_initial_schema.sql) mapped
// to the approved display titles, in the fixed 8-section order. `whatIfEmpty`
// mirrors the prototype's per-section emptyState() copy.
// Display order (2026-07-16 redesign): timely signal first (news, growth,
// money extend the TL;DR's trajectory/M&A sentences), then context
// (leadership), then the read-on gate (risk flags), then diligence detail.
const SECTIONS: { slug: FactSection; title: string; whatIfEmpty: string }[] = [
  { slug: "news", title: "News & announcements", whatIfEmpty: "recent company news" },
  { slug: "growth_signals", title: "Growth signals", whatIfEmpty: "hiring, contracts & customer wins" },
  { slug: "money", title: "Money", whatIfEmpty: "financial performance, funding & M&A" },
  { slug: "leadership", title: "Leadership & people", whatIfEmpty: "senior management changes" },
  { slug: "risk_flags", title: "Risk flags", whatIfEmpty: "risk flags" },
  { slug: "regulatory", title: "Regulatory", whatIfEmpty: "FDA / CMS / reimbursement news" },
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

  const [{ data: company }, { data: facts }, { data: jobs }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("facts")
      .select("id, section, text, fact_date, status, sources(publisher, title, url, year)")
      .eq("company_id", id)
      .neq("status", "rejected")
      .order("created_at"),
    // Spinner-worthy job for this company right now (Task 7).
    supabase.from("enrichment_jobs").select("id").eq("company_id", id).in("status", ["queued", "running"]),
  ]);

  if (!company) notFound();

  const status = effectiveStatus(company.status, (jobs ?? []).length > 0);

  const bySection = new Map<FactSection, FactRow[]>();
  for (const fact of (facts ?? []) as unknown as FactRow[]) {
    const list = bySection.get(fact.section) ?? [];
    list.push(fact);
    bySection.set(fact.section, list);
  }

  return (
    <>
      <RealtimeRefresh companyId={company.id} />
      <div className="toolbar">
        <span className="crumbs">
          <button data-href="/companies">Companies</button> <span>/</span>{" "}
          <span style={{ color: "var(--ink)" }}>{company.name}</span>
        </span>
        <span className="spacer"></span>
        <form>
          <button type="submit" className="btn primary" formAction={enrichCompany.bind(null, company.id)}>
            Enrich
          </button>
        </form>
        <StatusPill status={status} />
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
            <Attr k="Brief status" v={STATUS_LABEL[status]} />
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
      {item.status === "approved" && <RemoveAction factId={item.id} />}
    </div>
  );
}

// Approved facts only — walks an approval back. Reuses setFactStatus's
// approved→rejected transition; rejected facts are excluded from this page's
// query, so this is effectively "remove."
function RemoveAction({ factId }: { factId: string }) {
  return (
    <div className="fact-actions">
      <form>
        <button type="submit" className="btn reject" formAction={setFactStatus.bind(null, factId, "rejected")}>
          Remove
        </button>
      </form>
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
