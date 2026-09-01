# Agora — Pre-Development Confidence Plan

**Status:** Validation programme (run before full Execution Plan delivery)  
**Companions:** [`PRODUCT_BRIEF.md`](./PRODUCT_BRIEF.md), [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md), [`AI_COST_ESTIMATE.md`](./AI_COST_ESTIMATE.md)  
**Purpose:** Raise confidence in product definition, sequencing, model roster, and AI cost estimates **before** committing to full development  

---

## 0. Honesty constraint (read first)

**“Fully high confidence, no doubts” is not achievable** for a multi-month greenfield-on-brownfield build. Irreducible uncertainty always remains:

- Unknown PDF/OCR quality of real provincial corpora  
- Unknown Composer success rate on Agora’s hardest paths until measured  
- Unknown stakeholder interpretation of “good enough” measure quality  
- Unknown merge/integration tax in this specific repo  
- Price/pool billing mechanics can change  

This plan maximises **evidence-based confidence**. Target exit state:

| Area | Target confidence | “No doubts”? |
|------|-------------------|--------------|
| Product Brief fitness | High | No — stakeholders can still change mind |
| Execution sequencing | High | No — discoveries will reorder packages |
| Model roster | High (empirically calibrated) | No — models drift |
| AI cost estimate | High within a **±25% band** | No — not a fixed quote |

If the requirement is literally zero doubt, the only honest answer is: **do not start; the condition cannot be met.**  
If the requirement is **high confidence with residual risks named and bounded**, this programme is the path.

---

## 1. What we are uncertain about (from discussion + docs)

| # | Uncertainty | Why it matters | Affects |
|---|-------------|----------------|---------|
| U1 | Composer 2.5 may fail on chat/RAG/draft/playbook paths | Roster and ~$ spend shift toward Sonnet | Cost, plan |
| U2 | Token burn per agent-hour is assumed (2.5M/0.25M) | Absolute $ could be 0.6×–1.6× | Cost |
| U3 | Work-package hour sizes are expert guesses | Total hours could be wrong even if mix is right | Cost, calendar |
| U4 | Section extraction quality on real policy PDFs | Blocks herleidbaarheid / F2 | Plan, Phase 1b |
| U5 | Structured generation quality vs human redactie effort | Core value prop of authoring | Brief fitness |
| U6 | Analysis/QC usefulness without domain expert scoring | Phase 5 may be over- or under-built | Brief, plan |
| U7 | Export (DOCX) fidelity for stakeholder handoff | Phase 7 risk | Plan, cost |
| U8 | Schema/RLS designs may need a second Opus pass | Opus $ and Phase 0–4 slip | Cost, plan |
| U9 | Concurrent-edit needs (locks vs CRDT) unknown | Phase 6 scope | Plan, cost |
| U10 | Privileged-binding + playbook model may be wrong abstraction | Foundation risk | Brief→plan |
| U11 | Brief may omit real provincial constraints (procurement, residency, process) | Late scope | Brief |
| U12 | Parallelism assumptions may not hold in practice | Calendar, not just $ | Plan |

---

## 2. Confidence programme overview

Run a **time-boxed Validation Sprint** (recommended **10 working days**, max 15) **before** Phase 0 of the Execution Plan is treated as started.

```text
V0  Freeze questions & success metrics (1 day)
V1  Stakeholder / brief ratification (2–3 days, can overlap)
V2  Corpus & technical probes (3–5 days)
V3  Model calibration spikes (4–5 days, parallel with V2)
V4  Cost recalibration (1 day, after V3)
V5  Plan surgery & go/no-go (1–2 days)
```

**Budget for validation (AI only, separate from build estimate):** expect **~$400–$900** (mostly Composer + some Sonnet/Opus for spikes). This is cheap insurance on a ~$6.5k build estimate.

---

## 3. Workstreams in detail

### V0 — Freeze questions and metrics (Day 1)

**Owner:** Grok 4.5 + human  
**Output:** A scored scorecard (section 5) with empty evidence columns.

Define pass/fail for each uncertainty U1–U12. Example:

- U1 pass: Composer completes spike S1 and S2 with ≤1 Sonnet escalation and reviewable PR quality  
- U2 pass: Measured token burn within 0.7×–1.3× of assumption on ≥3 sessions  
- U5 pass: Domain reviewer rates ≥3/5 on “useful first draft” for generated measures sample  

**Exit:** Scorecard approved; no coding of product features yet.

---

### V1 — Brief ratification (Days 1–3, parallel)

**Goal:** High confidence the Product Brief is the right product — not just internally consistent.

| Activity | Who | Evidence |
|----------|-----|----------|
| Walk Product Brief with SUDL product owner | Human + Grok | Written sign-off or delta list |
| Map Brief F1–F36 → must / should / later for first release | Human | MoSCoW table (does not change Brief; creates **release slice**) |
| Confirm Spaces→Workspaces + programme typing | Human | Explicit accept |
| Confirm out-of-scope (CRDT, gazette publish, legal guarantee) | Human | Explicit accept |
| Optional: 1h domain expert interview (effects report + measures typology) | Human | Notes folded into seed playbook assumptions |

**Exit:** Either Brief unchanged with signatures, or Brief amended **before** build. Execution Plan not rewritten until V5.

**Confidence gained:** U10 (partial), U11.

---

### V2 — Corpus and technical probes (Days 2–6)

**Goal:** Kill or bound document/pipeline unknowns with real (or realistic) inputs.

| Spike | Model | What to do | Pass criteria |
|-------|--------|------------|---------------|
| S-PDF | Composer → Sonnet if needed | Ingest 3–5 representative policy PDFs (vision-like, programme-like, effects-like); measure page text quality, heading detection | ≥80% pages usable text; document gap list for scans |
| S-SEC | Composer + Kimi 2.7 | Prototype `document_sections` extraction on those PDFs | Citations can resolve to section for ≥1 doc end-to-end |
| S-ROLE | Opus (design only, ≤2h) + Composer | Draft role enum + binding metadata shape against real doc set; dry-run RLS notes | Opus design reviewed; no migration to production yet |
| S-BIND | Composer | Fake programme workspace bindings in a branch; prove context builder can mark privileged vs supporting | Unit test green on fixture workspace |

**Exit:** Written probe report: what works, what needs manual annotation, what blocks F2/F3.

**Confidence gained:** U4, U8 (partial), U10 (partial).

---

### V3 — Model calibration spikes (Days 3–8, parallel with V2)

**Goal:** Replace roster faith with measured success rates and burn rates. **This is the highest-leverage confidence work.**

Run the same spikes with **Composer first**; escalate only per Execution Plan ladder. Log for every session: model, input/output tokens (or Cursor usage $), wall time, success/fail, escalation reason.

| Spike ID | Task (mirrors hardest future work) | Primary | Escalate | Pass |
|----------|------------------------------------|---------|----------|------|
| S1 | Extract playbook compiler skeleton from current hardcoded chat + draft prompts; keep citation/safety core | Composer | Sonnet | Compiles; prompt-guard tests pass; behaviour parity on 5 golden questions |
| S2 | Add privileged-context injection to `lib/chat/context.ts` + one draft path | Composer | Sonnet | Tests + manual check privileged docs always present |
| S3 | Tiny `generation_runs` table + wire **one** chat completion to log a run | Composer + Kimi SQL | Sonnet | Row written with source set snapshot |
| S4 | Generate 5 candidate measures from a fixture vision excerpt under a seed instruction pack | Sonnet (quality bar) + Composer UI optional | Opus only if schema needed | Domain rater ≥3/5; citations present |
| S5 | One analysis mini-job: adopt/adapt/missing on 2 short policy snippets vs vision snippet | Sonnet | — | Structured JSON findings with citations |
| S6 | DOCX export of a 3-section Markdown fixture | Composer | Sonnet | Opens in Word; headings preserved |
| S7 | Cost meter: repeat S1 or S2 three times; record tokens/$ | Grok (analysis of logs) | — | Burn rate table filled |

**Rules:**

- Do **not** implement the full product during spikes — branch/throwaway or clearly flagged spike PRs.  
- Cap Opus to **design-only** in V2/V3 unless a spike is blocked on schema.  
- If Composer fails S1 or S2, **roster changes before build** (promote Sonnet for those paths; update cost estimate).

**Confidence gained:** U1, U2, U5 (partial), U6 (partial), U7 (partial).

---

### V4 — Cost recalibration (Day 8–9)

**Owner:** Grok 4.5  
**Inputs:** Spike logs from V3; probe report from V2.

Recalculate [`AI_COST_ESTIMATE.md`](./AI_COST_ESTIMATE.md):

1. Replace assumed burn with **measured** median input/output per agent-hour (or per spike, scaled).  
2. Replace Composer success assumption with **observed escalation rate** (e.g. Composer fail rate 30% → more Sonnet hours).  
3. Adjust package hours for Phase 1b/7 if PDF/DOCX probes were worse/better than assumed.  
4. Publish new recommended total and **±25% band**.  
5. Set a **kill criterion**: if recalibrated total > agreed ceiling, cut release slice (from V1 MoSCoW) before build.

**Exit:** Updated cost doc with “Calibrated: &lt;date&gt;” and spike evidence links.

**Confidence gained:** U2, U3 (partial — hours still estimated but burn and mix calibrated).

---

### V5 — Plan surgery and go/no-go (Day 9–10)

**Owner:** Grok 4.5 + human decision maker  

| Decision | Options |
|----------|---------|
| Roster | Keep five-model plan **or** promote Sonnet on chat/draft/playbook paths |
| Sequencing | Keep critical path **or** pull async jobs / section indexing earlier |
| Scope slice | Full Brief **or** MoSCoW “must” only for first ship |
| Concurrent edit | Locks-only confirmed **or** schedule 6b |
| Go / no-go | Go to Phase 0 **or** extend validation **or** stop |

**Required go criteria (all must be true):**

1. Product Brief ratified (V1) or amended and re-ratified  
2. S1 and S2 passed (Composer or explicitly Sonnet-owned with cost update)  
3. S3 passed (audit path exists in miniature)  
4. S4 rated ≥3/5 by a human with domain judgement  
5. Cost recalibrated; budget approved for the ±25% band  
6. Residual risks U4–U12 have owners and mitigations  
7. Decision maker accepts irreducible uncertainty (section 0)

**Exit:** Stamped Execution Plan revision + Cost Estimate revision + Go memo.

**Confidence gained:** U9, U12 (decision-bounded); overall High within stated band.

---

## 4. Optional intensifiers (if still not “high enough”)

Use only if V0–V5 leave confidence below target:

| Intensifier | Extra time | What it buys |
|-------------|------------|--------------|
| Second domain rater on S4/S5 | +1–2 days | Higher U5/U6 confidence |
| Shadow traditional drafting: time a human vs Agora spike on same chapter slice | +2–3 days | Value prop evidence (not cost) |
| Tiny RLS adversarial test on bindings | +1 day | U8 security confidence |
| Pay for one Opus full design of measures+runs+playbooks in one doc, then implement only after review | +2 days | Fewer mid-build schema flips |
| Repeat S1/S2 with a different agent/operator | +1 day | Reduces “one lucky spike” bias |

These push toward **higher** confidence; they still do not create zero doubt.

---

## 5. Confidence scorecard (fill during validation)

Rate each 1–5 after evidence. **Go requires all ≥4**, or explicit waiver.

| ID | Topic | Pre | Post | Evidence link |
|----|-------|-----|------|---------------|
| U1 | Composer on hard paths | 2 |  | S1/S2 logs |
| U2 | Token burn rate | 2 |  | S7 meter |
| U3 | Package hour sizing | 2 |  | Recalibration notes |
| U4 | Section/PDF quality | 2 |  | S-PDF/S-SEC |
| U5 | Generation usefulness | 2 |  | S4 ratings |
| U6 | Analysis usefulness | 2 |  | S5 ratings |
| U7 | DOCX export | 2 |  | S6 artefact |
| U8 | Schema stability | 2 |  | S-ROLE + Opus review |
| U9 | Collab model | 3 |  | V1/V5 decision |
| U10 | Bindings/playbook abstraction | 3 |  | V1 + S-BIND |
| U11 | Brief completeness | 3 |  | V1 sign-off |
| U12 | Parallelism/calendar | 2 |  | V5 go memo |

Pre-scores reflect current honest state (discussion: not fully confident).

---

## 6. What “high confidence” will look like at exit

You will have:

- A **ratified** Product Brief (or a dated amendment)  
- An Execution Plan **patched** from spike evidence (roster/sequence/scope)  
- A Cost Estimate **calibrated** to measured burn and escalation rates, with a **±25%** band and budget approval  
- Spike artefacts proving the riskiest technical bets in miniature  
- A written list of **residual risks** that remain after validation  

You will **not** have:

- Certainty of final dollar spend  
- Certainty of calendar end date  
- Proof that every F-requirement will delight every stakeholder  
- Immunity to model or pricing changes  

---

## 7. Recommended immediate next actions (ordered)

1. Approve this validation programme and a **~$400–$900** AI validation budget.  
2. Run **V0** scorecard workshop (half day).  
3. Start **V1** Brief ratification and **V3-S1** in parallel (highest information density).  
4. Do not open Execution Plan Phase 0 as “in progress” until **V5 Go**.  

---

## 8. Document control

| Field | Value |
|-------|-------|
| Title | Agora — Pre-Development Confidence Plan |
| Nature | Validation programme before full build |
| Language | English |
| Success definition | High confidence with bounded residual risk — not zero doubt |
