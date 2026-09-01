# Agora — AI Development Cost Estimate

**Status:** Planning estimate (not a quote)  
**Companion:** [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md), [`PRODUCT_BRIEF.md`](./PRODUCT_BRIEF.md)  
**Scope:** Cursor / agent **AI token costs only** for building the full Product Brief via the Execution Plan  
**Excluded:** Human time, Cursor seat/subscription fees, production OpenAI (app runtime RAG/chat/draft), hosting, third-party SaaS, security-review tool fees if billed separately

**Confidence:** Medium–low on absolute dollars; higher on **relative** spend by model (Sonnet + Opus dominate cost; Composer dominates hours).

---

## 1. Method

1. Size each Execution Plan work package in **agent-hours** (focused agent work, including tool loops — not wall-clock calendar).  
2. Assign hours to the **primary** model and fractional **support** hours (migrations, UI follow-on, escalation).  
3. Convert agent-hours → tokens using an assumed burn rate.  
4. Apply published per-million-token prices.  
5. Apply a **rework/integration contingency**.

### Token burn per agent-hour (assumption)

| Scenario | Input | Output | When it fits |
|----------|------:|-------:|--------------|
| Efficient | 1.5M | 0.15M | Tight specs, high cache hit, little exploration |
| **Base (recommended)** | **2.5M** | **0.25M** | Typical agentic coding with file reads + tool loops |
| Heavy | 4.0M | 0.40M | Chat/RAG refactors, repeated failures, large context |

Input:output ratio ≈ **10:1** (input-heavy agents).

### Prices used (USD / million tokens)

| Model | Input | Output |
|-------|------:|-------:|
| Composer 2.5 | $0.50 | $2.50 |
| Kimi K2.7 Code | $0.95 | $4.00 |
| Grok 4.5 | $2.00 | $6.00 |
| Sonnet 5 | $3.00 | $15.00 |
| Opus 5 | $5.00 | $25.00 |

Cache-read discounts (Composer/Grok) are **not** assumed in the numbers below — real Cursor-pool cost may land **~15–35% lower** on those two models if cache hits are strong.

### Contingency

| Case | Multiplier | Meaning |
|------|----------:|---------|
| Optimistic | ×1.10 | Clean merges, few escalations |
| **Base** | **×1.25** | Normal integration tax |
| Pessimistic | ×1.50 | Schema churn, chat-route thrash, DOCX/QC redo |

---

## 2. Effort by model (base hours, before contingency)

Derived by sizing ~70 work packages (S/M/L/XL) plus phase orchestration and security follow-up.

| Model | Agent-hours | Share of hours | Role |
|-------|------------:|---------------:|------|
| Composer 2.5 | 393 | 49% | Default implementation |
| Sonnet 5 | 206 | 26% | Hard pipelines + escalations |
| Opus 5 | 76 | 9% | Schema / RLS / tenancy design |
| Kimi K2.7 Code | 66 | 8% | SQL, exporters, mechanical tests |
| Grok 4.5 | 60 | 8% | Orchestration, IA, conformance, seed content |
| **Total** | **~801** | **100%** | |

**With ×1.25 contingency:** ~**1,000 agent-hours** total.

### Implied calendar (not AI cost, for context only)

| Parallelism | Rough wall time at ~6 focused agent-hours/day capacity |
|-------------|--------------------------------------------------------|
| 1 agent stream | ~7–9 months |
| 2 parallel streams (where plan allows) | ~4–6 months |
| 3 streams peak (Phases 5‖6‖7) | ~3.5–5 months |

Human review/merge is usually the bottleneck, not raw agent hours.

---

## 3. Cost by model

### 3.1 Recommended planning number

**Base token burn × 25% contingency**

| Model | Hours (w/ contingency) | Est. AI cost | Share of $ |
|-------|----------------------:|-------------:|-----------:|
| Composer 2.5 | 491 | **$920** | 14% |
| Kimi K2.7 Code | 82 | **$280** | 4% |
| Grok 4.5 | 75 | **$490** | 8% |
| Sonnet 5 | 258 | **$2,900** | 46% |
| Opus 5 | 94 | **$1,770** | 28% |
| **Total** | **~1,000** | **~$6,400** | **100%** |

**Planning recommendation: budget ~$6,500 AI tokens** (round up), with a **management range $4,000–$12,000**.

### 3.2 Scenario range (all models combined)

| | Optimistic (×1.10) | Base (×1.25) | Pessimistic (×1.50) |
|--|-------------------:|-------------:|--------------------:|
| Efficient tokens | ~$3,400 | ~$3,800 | ~$4,600 |
| **Base tokens** | **~$5,600** | **~$6,400** | **~$7,600** |
| Heavy tokens | ~$8,900 | ~$10,200 | ~$12,200 |

### 3.3 Cost concentration (important)

Hours are Composer-heavy; **dollars are Sonnet- and Opus-heavy**:

- ~49% of hours → Composer → only ~14% of cost  
- ~26% of hours → Sonnet → ~46% of cost  
- ~9% of hours → Opus → ~28% of cost  

Saving money later = **reduce Sonnet escalations and Opus redesign loops**, not cutting Composer UI work.

---

## 4. Cost by phase (recommended ~$6,400 split)

Approximate allocation of the recommended total (same mix of models within each phase as the plan implies):

| Phase | Share | Est. AI $ |
|-------|------:|----------:|
| 0 Architecture lock | 3% | $190 |
| 1 Knowledge & context (+1b sections) | 14% | $890 |
| 2 Playbook engine | 8% | $510 |
| 3 Traceability | 8% | $510 |
| 4 Programme authoring | 18% | $1,140 |
| 5 Analysis & intelligence | 18% | $1,140 |
| 6 Collaboration / versioning | 7% | $450 |
| 7 Export | 7% | $450 |
| 8 Workbench & setup | 7% | $450 |
| 9 Reliability / compliance | 6% | $380 |
| 10 Production hardening | 4% | $250 |
| **Total** | **100%** | **~$6,400** |

Phases **4 + 5** alone are ~**36%** of AI spend (authoring + analysis).

---

## 5. What would move the number

| Driver | Direction | Magnitude |
|--------|-----------|-----------|
| Composer clears chat/draft/playbook without Sonnet | ↓ | −$800 to −$1,500 |
| Schema redesigned twice (extra Opus) | ↑ | +$400 to +$1,200 |
| Section indexing / DOCX quality thrash | ↑ | +$300 to +$1,000 |
| Strong prompt cache on Composer/Grok | ↓ | −15% to −35% on those models (~−$200 to −$500 total) |
| Scope cut (defer QC suite, CRDT, or full graph UI) | ↓ | −$800 to −$2,000 |
| Full OT/CRDT (Phase 6b) | ↑ | +$500 to +$2,000 (likely more Sonnet/Opus) |

---

## 6. Explicitly not included

- **Production inference** for end users (OpenAI chat/draft/analysis jobs in the live app) — often larger than build cost over a year; track separately  
- **Human** product/engineering time  
- **Cursor** team seats / usage-pool subscription mechanics (this estimate is API-rate equivalent for planning)  
- Re-running failed CI / speculative spikes outside the plan  

---

## 7. Bottom line

| Item | Value |
|------|--------|
| Base agent effort | ~800 hours |
| With contingency | ~1,000 hours |
| **Recommended AI build budget** | **~$6,500** |
| Plausible range | **~$4,000 – $12,000** |
| Cost drivers | Sonnet pipelines + Opus schema (not Composer volume) |

This is an estimate to plan against, not a commitment. Re-forecast after Phase 1 using actual Cursor usage invoices — that single calibration will tighten the total more than refining package-hour guesses.

---

## 8. Document control

| Field | Value |
|-------|-------|
| Title | Agora — AI Development Cost Estimate |
| Nature | Planning estimate |
| Prices as of | User-provided Cursor model rates (conversation) |
| Language | English |
