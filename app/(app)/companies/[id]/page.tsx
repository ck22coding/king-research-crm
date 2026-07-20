import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar, CompanyStatusPill, STATUS_LABEL, effectiveStatus, fmtDate, Attr, SrcChip, EmptyState } from "@/lib/format";
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

// PDF pivot (BUILD.md §E): the record page gets a view switcher. PDF report
// is the default; Source is today's fact list, unchanged below. History
// (all facts ever found, ignoring freshness windows/removed state) isn't
// built yet — it's a stub tab only, out of scope for this task.
type View = "pdf" | "source" | "history";

function parseView(raw: string | undefined): View {
  if (raw === "source" || raw === "history") return raw;
  return "pdf";
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view: viewParam } = await searchParams;
  const view = parseView(viewParam);
  const supabase = await createClient();

  const [{ data: company }, { data: facts }, { data: jobs }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("facts")
      .select("id, section, text, fact_date, status, sources(publisher, title, url, year)")
      .eq("company_id", id)
      .neq("status", "rejected")
      .order("created_at"),
    // Latest job (any status): drives the pill — spinner while active, red
    // Failed with the error on hover, matching the companies list.
    supabase
      .from("enrichment_jobs")
      .select("status, error")
      .eq("company_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (!company) notFound();

  const latestJob = (jobs ?? [])[0] ?? null;
  // Same derivation CompanyStatusPill uses — this copy feeds the rail Attr.
  const briefStatus =
    latestJob?.status === "failed"
      ? ("failed" as const)
      : effectiveStatus(company.status, latestJob?.status === "queued" || latestJob?.status === "running");

  const bySection = new Map<FactSection, FactRow[]>();
  for (const fact of (facts ?? []) as unknown as FactRow[]) {
    const list = bySection.get(fact.section) ?? [];
    list.push(fact);
    bySection.set(fact.section, list);
  }

  // The runner only sets tldr on a company's first successful enrichment
  // (see runner/ "on success: ... save newsroom_url and tldr") — a company
  // added but never enriched has tldr null, which is the signal both the
  // Download button and the PDF view key off of.
  const hasBeenEnriched = Boolean(company.tldr);

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
          {/* Not yet enriched: Enrich is the primary (black) action. Once
              enriched it's still fully clickable (re-runs to pull fresher
              info) but drops to secondary gray so Download reads as primary. */}
          <button
            type="submit"
            className={hasBeenEnriched ? "btn" : "btn primary"}
            formAction={enrichCompany.bind(null, company.id)}
          >
            Enrich
          </button>
        </form>
        {hasBeenEnriched ? (
          <a className="btn primary" href={`/companies/${company.id}/pdf`} download={`${company.name}.pdf`}>
            Download PDF
          </a>
        ) : (
          // Genuinely disabled (native `disabled` — not just styled to look
          // it): there's no report to download until the company has been
          // enriched at least once.
          <button type="button" className="btn" disabled aria-disabled="true" title="Enrich this company first">
            Download PDF
          </button>
        )}
        <CompanyStatusPill status={company.status} job={latestJob} />
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
        <ViewTabs companyId={company.id} view={view} />
        <div className="rec-body">
          <div className="rail">
            <h4>Record details</h4>
            <Attr k="Domain" v={company.domain} />
            <Attr k="Ownership" v={company.ownership} />
            <Attr k="Headquarters" v={company.hq} />
            <Attr k="Brief status" v={STATUS_LABEL[briefStatus]} />
            <Attr k="Last updated" v={fmtDate(company.updated_at)} />
          </div>
          <div className="content">
            {view === "pdf" && <PdfReportPane companyId={company.id} hasBeenEnriched={hasBeenEnriched} />}
            {view === "history" && (
              <div className="empty">
                History isn&rsquo;t built yet — it will show every fact ever found for this
                company, ignoring freshness windows and removed state.
              </div>
            )}
            {view === "source" && (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// PDF report / Source / History switcher. Plain server-rendered buttons on
// the shared data-href contract (ShellEvents' click delegation) — same
// pattern as the crumbs/nav-item, no client component needed for a nav.
function ViewTabs({ companyId, view }: { companyId: string; view: View }) {
  return (
    <div className="tag-row">
      <button className={`tag ${view === "pdf" ? "on" : ""}`} data-href={`/companies/${companyId}`}>
        PDF report
      </button>
      <button className={`tag ${view === "source" ? "on" : ""}`} data-href={`/companies/${companyId}?view=source`}>
        Source
      </button>
      {/* Stub — no data-href, so it's inert rather than a dead link. */}
      <span className="tag" style={{ opacity: 0.5, cursor: "not-allowed" }} title="Coming soon">
        History
      </span>
    </div>
  );
}

function PdfReportPane({ companyId, hasBeenEnriched }: { companyId: string; hasBeenEnriched: boolean }) {
  if (!hasBeenEnriched) {
    return <div className="empty">No PDF yet — click Enrich to generate this company&rsquo;s report.</div>;
  }
  return <iframe className="pdf-frame" src={`/companies/${companyId}/pdf`} title="PDF report" />;
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
      {item.status === "approved" && (
        // Walks an approval back. Rejected facts are excluded from this
        // page's query, so this is effectively "remove."
        <div className="fact-actions">
          <FactStatusButton factId={item.id} to="rejected" from="approved" label="Remove" />
        </div>
      )}
    </div>
  );
}

// One form-per-button, shared by every fact transition. `from` pins the
// transition to the state this button was rendered against (see actions.ts).
function FactStatusButton({
  factId,
  to,
  from,
  label,
}: {
  factId: string;
  to: "approved" | "rejected";
  from: "suggested" | "approved";
  label: string;
}) {
  return (
    <form>
      <button
        type="submit"
        className={`btn ${to === "approved" ? "approve" : "reject"}`}
        formAction={setFactStatus.bind(null, factId, to, from)}
      >
        {label}
      </button>
    </form>
  );
}

// Suggested facts only — approve/reject calls the setFactStatus server
// action directly (bind works in Server Components, no client JS needed).
function FactActions({ factId }: { factId: string }) {
  return (
    <div className="fact-actions">
      <span className="suggested-badge">Suggested</span>
      <FactStatusButton factId={factId} to="approved" from="suggested" label="Approve" />
      <FactStatusButton factId={factId} to="rejected" from="suggested" label="Reject" />
    </div>
  );
}
