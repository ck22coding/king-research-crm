import { notFound } from "next/navigation";
import { Avatar, StatusPill, STATUS_LABEL, fmtDate, money, isDated, Attr, SrcChip, EmptyState } from "@/lib/format";
import { markets, primaryTam, collectSources, type MarketFact, type MarketSource } from "@/lib/markets-data";

// Ports crm-ui/index.html's marketPage()/collectSources() 1:1 as
// server-rendered markup. Reading-pane clicks (source chips, the crumbs
// link, the sources list) are wired up by ShellEvents' document-level click
// delegation (app/(app)/shell-events.tsx) — same data-url/data-href
// contract Task 3 built for the companies pages.

const CAT = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];
const CAT_INK = ["#fff", "#17171c", "#17171c", "#fff", "#fff", "#fff"];
const MATURITY_STAGES = ["emerging", "growth", "mature", "consolidating"] as const;

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = markets.find((x) => x.id === id);
  if (!m) notFound();

  const tam = primaryTam(m);
  const maxTam = Math.max(...m.tam_estimates.map((e) => e.value_usd_b));
  const samPct = m.sam ? Math.round((m.sam.value_usd_b / tam.value_usd_b) * 100) : null;
  const collected = collectSources(m);

  return (
    <>
      <div className="toolbar">
        <span className="crumbs">
          <button data-href="/markets">Markets</button> <span>/</span>{" "}
          <span style={{ color: "var(--ink)" }}>{m.name}</span>
        </span>
        <span className="spacer"></span>
        <StatusPill status={m.status} />
      </div>
      <div className="scroll">
        <div className="rec-head">
          <Avatar name={m.name} id={m.id} />
          <div>
            <h1>{m.name}</h1>
            <div className="sub">
              {m.tags.map((t) => (
                <span key={t} className="pill">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="rec-body">
          <div className="rail">
            <h4>Record details</h4>
            <Attr k="Industry tags" v={m.tags.join(", ")} />
            <Attr k="Maturity" v={<span style={{ textTransform: "capitalize" }}>{m.dynamics.maturity}</span>} />
            <Attr
              k="Primary TAM"
              v={
                <>
                  {money(tam.value_usd_b)}{" "}
                  <span style={{ color: "var(--ink-3)" }}>
                    ({tam.publisher}, {tam.year})
                  </span>
                </>
              }
            />
            <Attr k="Growth" v={`${m.cagr.rate}% CAGR ${m.cagr.window}`} />
            <Attr k="Assessment status" v={STATUS_LABEL[m.status]} />
            <Attr k="Last updated" v={fmtDate(m.updated_at)} />
            <Attr k="Sources cited" v={String(collected.length)} />
          </div>
          <div className="content">
            {m.coverage_note && <div className="note">⚠ {m.coverage_note}</div>}

            <div className="kpis">
              <div className="card kpi">
                <div className="k">TAM</div>
                <div className="v">{money(tam.value_usd_b)}</div>
                <div className="sub">
                  per {tam.publisher}, {tam.year}
                  {isDated(tam.year) && <span className="dated">Dated</span>}
                </div>
                <SrcRow sources={[tam]} />
              </div>
              <div className="card kpi">
                <div className="k">Growth rate</div>
                <div className="v">
                  <span className="up">▲</span>
                  {m.cagr.rate}%
                </div>
                <div className="sub">
                  CAGR {m.cagr.window} per {m.cagr.publisher}
                </div>
                <SrcRow sources={[{ publisher: m.cagr.publisher, url: m.cagr.url, title: "CAGR source" }]} />
              </div>
              <div className="card kpi">
                <div className="k">SAM</div>
                {m.sam ? (
                  <>
                    <div className="v">{money(m.sam.value_usd_b)}</div>
                    <div className="sub">{m.sam.basis}</div>
                    <div className="meter" data-tip={`SAM is ~${samPct}% of the primary TAM estimate`}>
                      <i style={{ width: `${samPct}%` }}></i>
                    </div>
                    <div className="sub" style={{ margin: 0 }}>
                      ~{samPct}% of primary TAM
                    </div>
                    <SrcRow sources={[m.sam]} />
                  </>
                ) : (
                  <div className="sub" style={{ marginTop: 6 }}>
                    Not computed — SAM is only produced when the request comes from a specific
                    company&rsquo;s viewpoint.
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <h3>Market definition &amp; scope</h3>
              <div className="cols">
                <div>
                  <h5>Includes</h5>
                  <div>{m.definition.includes}</div>
                </div>
                <div>
                  <h5>Excludes</h5>
                  <div>{m.definition.excludes}</div>
                </div>
              </div>
            </div>

            <div className="card">
              <h3>
                Market size — estimates side by side <span className="count">{m.tam_estimates.length}</span>
              </h3>
              <div className="barchart">
                {m.tam_estimates.map((e, i) => (
                  <div className="barrow" key={i}>
                    <div className="lbl">
                      <b>{e.publisher}</b> · {e.year}
                      {isDated(e.year) && <span className="dated">Dated</span>}
                    </div>
                    <div className="track" data-tip={`${money(e.value_usd_b)} — ${e.publisher}, ${e.year}`}>
                      <i className="fill" style={{ width: `${Math.round((e.value_usd_b / maxTam) * 100)}%` }}></i>
                    </div>
                    <span className="val">{money(e.value_usd_b)}</span>
                    <SrcChip source={e} />
                  </div>
                ))}
              </div>
              <div className="axis-note">Sources disagree on scope; each estimate is cited rather than averaged.</div>
            </div>

            <div className="card">
              <h3>Growth</h3>
              <div className="cols">
                <div>
                  <h5>Drivers</h5>
                  {m.drivers.length ? (
                    m.drivers.map((it, i) => <ItemRow key={i} item={it} />)
                  ) : (
                    <EmptyState what="growth drivers" />
                  )}
                </div>
                <div>
                  <h5>Restraints</h5>
                  {m.restraints.length ? (
                    m.restraints.map((it, i) => <ItemRow key={i} item={it} />)
                  ) : (
                    <EmptyState what="restraints" />
                  )}
                </div>
              </div>
            </div>

            <div className="card">
              <h3>Segmentation</h3>
              {m.segmentation.map((dim, di) => (
                <div className="seg-dim" key={di}>
                  <div className="seg-head">
                    <span className="dim">{dim.dimension}</span>
                    <SrcChip source={{ ...dim.source, title: dim.dimension }} />
                  </div>
                  <div className="stack">
                    {dim.segments.map((s, i) => (
                      <i
                        key={i}
                        style={{ width: `${s.share}%`, background: CAT[i], color: CAT_INK[i] }}
                        data-tip={`${s.label} — ${s.share}%`}
                      >
                        {s.share >= 14 ? `${s.share}%` : ""}
                      </i>
                    ))}
                  </div>
                  <div className="legend">
                    {dim.segments.map((s, i) => (
                      <span key={i}>
                        <span className="sw" style={{ background: CAT[i] }}></span>
                        {s.label} <b>{s.share}%</b>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <h3>Competitive landscape</h3>
              <div className="land">
                <ChipGroup label="Leaders" items={m.players.leaders} />
                <ChipGroup label="Challengers" items={m.players.challengers} />
                <ChipGroup label="Recent entrants" items={m.players.entrants} />
              </div>
              <h5>Recent M&amp;A &amp; funding</h5>
              {m.deals.length ? m.deals.map((d, i) => <ItemRow key={i} item={d} />) : <EmptyState what="recent deals" />}
            </div>

            <div className="card">
              <h3>Market dynamics</h3>
              <h5>Maturity stage</h5>
              <div className="steps">
                {MATURITY_STAGES.map((s) => (
                  <div
                    key={s}
                    className={`step ${s === m.dynamics.maturity ? "on" : ""}`}
                    style={{ textTransform: "capitalize" }}
                  >
                    {s}
                  </div>
                ))}
              </div>
              <div className="cols" style={{ marginTop: 12 }}>
                <div>
                  <h5>Pricing &amp; business models</h5>
                  <div className="chips">
                    {m.dynamics.pricing.map((p, i) => (
                      <span key={i} className="chip">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h5>Adoption / penetration</h5>
                  <ItemRow item={{ text: m.dynamics.adoption.text, sources: [m.dynamics.adoption.source] }} />
                </div>
              </div>
            </div>

            <SectionCard title="Regulatory snapshot" items={m.regulatory} whatIfEmpty="regulation shaping this market" />

            <div className="card">
              <h3>
                Sources <span className="count">{collected.length}</span>
              </h3>
              <ol className="sources">
                {collected.map((s, i) => (
                  <li key={i}>
                    <span className="t">{s.publisher}</span> — {s.title || "source"}
                    {s.year ? ` (${s.year})` : ""}
                    <button className="link-chip" data-url={s.url} data-tip="Open in reading pane">
                      open ↗
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ChipGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <h5>{label}</h5>
      <div className="chips">
        {items.map((p) => (
          <span key={p} className="chip">
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionCard({ title, items, whatIfEmpty }: { title: string; items: MarketFact[]; whatIfEmpty: string }) {
  return (
    <div className="card">
      <h3>
        {title} <span className="count">{items.length || ""}</span>
      </h3>
      {items.length ? items.map((item, i) => <ItemRow key={i} item={item} />) : <EmptyState what={whatIfEmpty} />}
    </div>
  );
}

function ItemRow({ item }: { item: MarketFact }) {
  return (
    <div className="item">
      <div className="row">
        <div className="txt">{item.text}</div>
        {item.date && <div className="date">{fmtDate(item.date)}</div>}
      </div>
      {item.sources.length > 0 && (
        <div className="srcs">
          {item.sources.map((source, i) => (
            <SrcChip key={i} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}

function SrcRow({ sources }: { sources: MarketSource[] }) {
  if (!sources.length) return null;
  return (
    <div className="srcs">
      {sources.map((s, i) => (
        <SrcChip key={i} source={s} />
      ))}
    </div>
  );
}

