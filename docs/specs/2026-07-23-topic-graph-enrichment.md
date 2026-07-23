# Spec: Topic-Graph Enrichment (the "diamond" rebuild)

- **Status:** Design / proposed. Not yet built. Pairs with the cloud/cost work.
- **Date:** 2026-07-23
- **Owner:** Carter
- **Related:** `2026-07-22-per-user-runners.md`, `BUILD.md`, the `company-preview` skill repo, cloud-migration analysis (chat 2026-07-23).

## 1. Summary

Restructure the enrichment step from **one long agentic call that researches all six sections in a single context** into a **directed graph** (the "diamond"): a cheap scout, then six independent per-topic research nodes fanned out in parallel, then a deterministic code merge, an adversarial verify gate on risky facts, and a synthesis stage. This bounds cost, lets each topic run on the cheapest model that holds quality, contains failures (one bad topic no longer sinks the whole job), and streams work instead of blocking on one big barrier.

**Phase 0 (soft caps) is already shipped** as a stopgap inside today's single-call design — see Appendix A. This spec is Phase 1, the structural version.

## 2. Why (the problem with today's pipeline)

Today `runJob()` builds one `/company-preview name=… domain=…` prompt and spawns a single `claude -p` with `WebSearch,WebFetch`, a 20-minute wall-clock, and **no per-topic cap and no turn cap**. Inside that one call the skill does identity → newsroom discovery → all six sections → group/dedup → score → emit. That is the classic monolithic-agent anti-pattern:

- **Context overload.** All six topics' web fetches accumulate in one context; later sections reason over a cluttered window.
- **Sequential inside the call.** Financials waits behind leadership behind news, even though they're independent.
- **Cascading failure.** The output is one schema-gated JSON array. If the model stumbles on one section and the array fails the gate, **all six sections are lost** — the whole job fails.
- **Unbounded cost.** No fetch/turn cap; one stuck run can burn the full 20 minutes. On a subscription that just eats quota; on the cloud's pay-per-token billing it's a real money leak.

Multi-topic research is a textbook fan-out. The decomposition already exists on paper — six per-section reference files and a per-section pass in `SKILL.md` step 6 — so this is mostly *promoting* that section loop from inside-one-context to six-isolated-nodes, not a redesign.

## 3. Rollout

| Phase | What | State |
|---|---|---|
| **0 — Soft caps** | Per-section web-fetch budgets written into `SKILL.md` (advisory, single-call). Immediate cost trim, zero architecture change. | **Shipped** (Appendix A) |
| **1 — Diamond** | This spec: scout → fan-out → code merge → verify gate → synthesis. Hard caps, per-topic models, resilience. | Proposed; build with the cloud switch |

Phases stack — soft caps keep working until the diamond replaces the single call.

## 4. Target topology

```
                          ┌─► leadership   (Haiku, ≤4 fetch) ─┐
                          ├─► news         (Haiku, ≤6 fetch) ─┤
 scout ──► [type router   ├─► growth       (Haiku, ≤4 fetch) ─┤   [CODE EDGE:        [VERIFY GATE:       [SYNTHESIS:
 (identity + newsroom     ├─► M&A/partners (Sonnet, ≤6 fetch)─┼─► flatten + dedupe ─► skeptic on risky ─► rank (Haiku)   ──► DB facts +
  + public/private) ]     ├─► financials   (Sonnet, ≤8 fetch)─┤    by group_key &     facts only         + tldr + narrative   PDF (web,
                          └─► risk_flags   (Sonnet, ≤5 fetch)─┘    source overlap]     (keep / drop)      (Sonnet/Opus)]       unchanged)]
                                    (fan-out: parallel)         (zero tokens)         (targeted)         (synthesize)
```

The **router is not a separate agent** — it's the scout's `company_type` field consumed by a code branch that hands each topic node the right playbook flag (public filings vs. `private-company-playbook.md`).

## 5. Nodes & contracts

Every node has a bounded JSON input and a schema-validated output. Fact shape stays exactly as `references/output-schema.json` defines it.

### 5.1 Scout (cheap, once)
- **In:** `{ name, domain, newsroom_url?, known_urls? }`
- **Does:** identity check (refuse on mismatch — same rule as `SKILL.md` step 2), newsroom discovery, and a public/private classification.
- **Out:**
  ```json
  {
    "identity_ok": true,
    "canonical_name": "…",
    "domain": "…",
    "newsroom_url": "… or null",
    "company_type": "public | private",
    "context_brief": "1–2 sentences: what the company is/does + any cross-cutting signal",
    "stop_reason": null
  }
  ```
- **Fail-closed:** `identity_ok:false` with a `stop_reason` short-circuits the whole job to the existing STOP output (`facts:[]`, mismatch tldr). No topic nodes run.
- **Model:** Haiku. **Budget:** ~2 fetches.

### 5.2 Topic node ×6 (fan-out, parallel)
- **In:** `{ canonical_name, domain, newsroom_url, company_type, known_urls, section, fetch_budget, context_brief }`
- **Does:** ONLY that one section — newsroom sorting for it + its external pass (`references/<section>.md`, plus the private playbook when `company_type=private`) + sourcing + `fact_date` + importance + stats. It does **not** re-run identity/discovery (scout did) and does **not** do cross-section grouping (the merge edge does).
- **Out:** `{ section, facts: [ <output-schema fact> … ], notes }`
- **Model / budget:** per §6.
- **Isolation:** its own child `claude -p` process and its own timeout (see §10).

### 5.3 Merge edge — pure code, zero tokens (§7)
### 5.4 Verify gate — targeted skeptic (§8)
### 5.5 Synthesis
- **rank** (existing Sonnet pass, downgradable to Haiku) reorders each section by importance.
- **tldr** moves here: because no single node sees all six sections anymore, the `tldr` is generated post-merge by a small node over the merged facts + `context_brief`, following `references/tldr-contract.md`.
- **narrative** = the existing `generate` job (reviewed facts → prose), unchanged.

## 6. Per-topic model + fetch-cap table (the money table)

| Node | Model | Fetch cap | Rationale |
|---|---|---|---|
| scout | Haiku | ~2 | identity + newsroom, mechanical |
| leadership | Haiku | ~4 | extraction, narrow 6-mo window |
| news | Haiku | ~6 | recency, running list but bounded |
| growth_signals | Haiku | ~4 | job/expansion signals, mechanical |
| acquisitions_partnerships | Sonnet | ~6 | judgment: what's material M&A |
| financials | Sonnet | ~8 | deepest: filings + funding press, estimate labeling |
| risk_flags | Sonnet | ~5 | judgment: lawsuits, layoffs, warning letters |
| verify (skeptic) | Haiku | ~1–2 per flagged fact | does the source support the claim? |
| rank | Haiku | 0 (no web) | cheap triage |
| tldr + narrative | Sonnet (Opus optional) | 0 (no web) | high-judgment merge step |

The Haiku/Sonnet split is a **tunable knob**, not a law — promote a topic to Sonnet if quality drops, demote if Haiku holds. Reserve Opus for the final narrative only, and only for high-value companies.

## 7. Edges are code, not tokens

The merge is deterministic JavaScript in the runner — **no model call**:
1. Flatten all six topic nodes' `facts[]`.
2. Dedupe across sections by `group_key`, with **source-URL overlap** as a secondary key (independently-run sections can slug the same story differently — URL overlap catches it).
3. Drop facts whose only sources are in `known_urls` (the existing incremental-enrichment rule).
4. Attach the scout's `newsroom_url`.
5. Hand the unified `facts[]` to the verify gate, then insert.

This is the same `group_key` dedup `SKILL.md` step 7 already describes — moved out of the model's head and into free, reliable code. (This resolves the "de-dup has to move to a merge step" concern from the cloud analysis: it's a feature, not a cost.)

## 8. Verification gate (targeted, not 3-vote)

Our facts are already source-cited (2–3 links each), so blanket multi-vote verification is overkill. Run **one skeptic** (Haiku) **only on risky facts**:

- single-source facts,
- private-company financial/valuation estimates,
- rumor-labeled facts,
- facts whose `fact_date` sits near the edge of the section window.

**Skeptic contract:** in `{ fact, sources[] }` → out `{ keep: bool, reason, downgrade?: bool }`. It fetches the cited source(s) and checks: does the source actually support the claim, and is the date in window? Fails → drop, or downgrade (flag for human). This **feeds** the existing human review gate (`facts.reviewed_at`), it does not replace it — automated pre-filter, human confirms.

## 9. Pipelines over barriers

Stream each topic through its own chain: `research(topic) → verify(topic's risky facts) → topic facts ready`. Topics don't wait on each other. The **only barrier** is the final merge+rank, which genuinely needs all six sections (cross-section dedup + per-section ordering + tldr). This matches the rule "a barrier is correct only when a stage needs cross-item aggregation."

## 10. Failure containment

Each topic node is an isolated child process with its own timeout. If one fails or times out, the merge proceeds with the other five and the job completes as a **partial** (record which sections failed, e.g. a `partial_sections` note on the job / company). Contrast today: one bad section can fail the whole schema-gated JSON and lose everything. A partial report beats a failed job.

## 11. Where it runs (tooling reality)

The production runner is a **standalone Node daemon** that shells out to `claude -p`. Graph engineering here means rebuilding this diamond in **vanilla Node** — fan out six child `claude -p` processes, dedupe in JS, spawn skeptic calls, synthesize — **not** calling any interactive "Workflow" orchestration tool (that's a Claude Code harness feature, not available to a deployed daemon). The runner already has the building blocks: a worker pool (`RUNNER_CONCURRENCY`) and child-process spawning.

**Cloud alignment (Agent SDK / cost work):** each node is a separate bounded call, which is ideal for
- the **Batch API** (−50% in/out) — enrichment is async, so route the topic calls through it, and
- **prompt caching** — cache the scout output + skill files as the shared prefix across the six topic calls (0.1× on cache hits).

Self-hosted Agent SDK runs the *same* skill files per topic, so local and cloud stay in parity (see §12).

## 12. Skill change + one source of truth

The skill needs one new input so the runner can drive it per-topic:

- **`sections`** (optional, comma-separated). When set, the skill researches only those sections and **skips** the identity check and newsroom discovery (the scout supplies `canonical_name` + `newsroom_url` + `company_type` as inputs). When unset, behavior is unchanged (full six-section run) — so today's single-call path and the soft caps keep working.

Because **both** the local `claude -p` runner and the cloud Agent SDK call the *same* skill with `sections=`, there is **one source of truth** for the research logic. Pin the plugin version so a user on an old local plugin and the cloud-on-latest don't drift. The only genuinely new code is the runner-side orchestration (scout → fan → merge → verify → synth), shared by both deploy targets.

## 13. Cost estimate (rough, per enrich job)

| | Today (monolith) | Diamond | Diamond + Batch |
|---|---|---|---|
| Shape | 1 uncapped Sonnet/Opus call | scout + 6 capped nodes + skeptic + rank/synth | same, −50% |
| Typical | ~$2–6 (Sonnet), long tail higher | ~$1.7–3.5 | ~$0.9–1.8 |
| Worst case | unbounded (20-min runaway) | bounded by per-topic caps | bounded |

Net: roughly **40–60% cheaper, and — more importantly — bounded and resilient.** Numbers are order-of-magnitude; verify against real runs and current pricing.

## 14. Deliberately NOT building (keep it lazy)

- **3-vote adversarial verification on every fact** — overkill; facts are already source-cited. Targeted single skeptic instead (§8).
- **Loop-until-dry on every topic** — adds cost. If wanted, apply per-topic to financials only, never globally.
- **A separate router agent** — the scout's `company_type` + a code branch is enough (§4).
- **Self-drafting orchestration** — the runner is a fixed daemon; the graph is hand-written Node, not model-generated.

## 15. Open questions / risks

- **Cross-section context loss.** A signal found in `news` won't inform `financials` when they run blind. Mitigation: the scout's `context_brief` is passed to every topic node; expand it if quality dips. Tunable.
- **group_key collisions** across independently-run sections — handled by source-URL overlap as a secondary dedup key (§7); watch for misses.
- **Skeptic false-drops** — the human review gate (`facts.reviewed_at`) is the backstop; prefer "downgrade for review" over hard drop when unsure.
- **Partial-report UX** — decide how the web surfaces "financials failed, other five succeeded" (ties to the loud-failures requirement).

## Appendix A — Phase 0 soft caps (already applied to `SKILL.md`)

Added under `SKILL.md` step 6 (per-section external pass). Advisory budgets inside the current single call; no architecture change:

| Section | Web-fetch budget | Notes |
|---|---|---|
| `leadership` | ~4 | narrow 6-month window |
| `news` | ~6 | running list, but recency-bounded |
| `growth_signals` | ~4 | narrow 3-month window |
| `risk_flags` | ~5 | |
| `acquisitions_partnerships` | ~6 | |
| `financials` | ~8 | deepest: filings + funding press |

> This edit lives in the separate `company-preview` skill repo and must be committed/synced there (it is not part of the web repo). It was applied to the working copy on 2026-07-23.
