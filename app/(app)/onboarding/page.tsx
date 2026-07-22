// Static onboarding page — copy-paste one-liners for setting up the local
// research runner. Not part of the primary sidebar nav; linked from
// `.sidebar-foot` (see app/(app)/layout.tsx). Basic styling only, reusing
// prototype `.card`/`.chip` classes — polish deferred per BUILD.md Phase 5.

import PairCard from "./pair-card";

export default function OnboardingPage() {
  return (
    <>
      <div className="toolbar">
        <span className="crumbs">
          <span style={{ color: "var(--ink)" }}>Onboarding</span>
        </span>
      </div>
      <div className="scroll">
        <div className="rec-head">
          <div>
            <h1>Set up the runner</h1>
            <div className="sub">
              <span>Research runs on your own machine — install the CLI, then the plugin.</span>
            </div>
          </div>
        </div>
        <div className="rec-body">
          <div className="content" style={{ paddingLeft: 24, maxWidth: 640 }}>
            <div className="card">
              <h3>1. Install Claude Code CLI</h3>
              <div className="chips" style={{ marginBottom: 8 }}>
                <span className="chip">
                  <code>npm install -g @anthropic-ai/claude-code</code>
                </span>
              </div>
              <div className="chips" style={{ marginBottom: 8 }}>
                <span className="chip">
                  <code>claude login</code>
                </span>
              </div>
              <p>Research runs with YOUR Claude subscription.</p>
            </div>

            <div className="card">
              <h3>2. Install the research plugin</h3>
              <div className="chips" style={{ marginBottom: 8 }}>
                <span className="chip">
                  <code>claude plugin marketplace add ck22coding/king-research</code>
                </span>
              </div>
              <div className="chips">
                <span className="chip">
                  <code>claude plugin install company-preview@king-research</code>
                </span>
              </div>
            </div>

            <div className="card">
              <h3>3. Start the runner</h3>
              <div className="chips" style={{ marginBottom: 8 }}>
                <span className="chip">
                  <code>npx king-research-runner</code>
                </span>
              </div>
              <p>Leave it running; it checks for your jobs every few seconds.</p>
            </div>

            <PairCard />
          </div>
        </div>
      </div>
    </>
  );
}
