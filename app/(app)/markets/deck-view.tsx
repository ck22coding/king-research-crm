// Static market-assessment deck (PPTX → PDF, served from /public). Mirrors
// the company record's PDF view — same `.pdf-frame` iframe + Download button —
// but markets share one assessment deck rather than a per-record generated
// report, so it lives on the Markets tab behind ?view=deck (same query-view
// pattern the company page uses for ?view=source) instead of per market.
const DECK = "/market-assessment.pdf";

export default function DeckView() {
  return (
    <>
      <div className="toolbar">
        <span className="crumbs">
          <button data-href="/markets">Markets</button> <span>/</span>{" "}
          <span style={{ color: "var(--ink)" }}>Assessment deck</span>
        </span>
        <span className="spacer"></span>
        <a className="btn primary" href={DECK} download="Market Assessment.pdf">
          Download deck
        </a>
      </div>
      <iframe className="pdf-frame" src={DECK} title="Market assessment deck" />
    </>
  );
}
