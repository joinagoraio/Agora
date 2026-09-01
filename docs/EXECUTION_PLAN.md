# Agora — Execution Plan

**Status:** Canonical execution plan (agreed development programme)  
**Version:** 2 — 2026-08-31  
**Companion:** [`PRODUCT_BRIEF.md`](./PRODUCT_BRIEF.md)  
**Operating loop:** [`GROK_FIRST_RUNBOOK.md`](./GROK_FIRST_RUNBOOK.md)  
**Domain vocabulary:** [`design/00-domain-dictionary.md`](./design/00-domain-dictionary.md)

**Supersedes:** Execution Plan v1 (2026-07, Phases 0–10 Grok-first). That programme delivered **product foundations**. This plan is the remaining programme to make the product **fully usable**. Do not reopen v1 work packages as if they were unfinished schema tasks.

**Nature:** Sequencing, work packages, architecture locks, and phase-exit gates for software delivery of the Product Brief plus two agreed extras (configurable agents; process/document templates). Display IA: [`IA_NAVIGATION.md`](./IA_NAVIGATION.md).

**Out of scope for this document:** Changing the Product Brief’s product definition; PoC session logistics; corpus acquisition; on-site support; ops/contractual sign-off.

---

## 1. Purpose

This plan is what engineering follows until the Product Brief is met as **working software**, not as tables and shells.

It answers:

- what architecture we locked after reviewing foundations vs F1–F36 and the Flevoland letter;
- in what order work must happen;
- what each work package must ship to count as **done** (usable, not schema-only);
- how agents and templates sit on the existing stack;
- what is explicitly deferred (delivery/ops, not product).

It assumes **enhance Agora**, not rebuild: Spaces → Workspaces stay as **storage**. Users see Authority → Programme ([`IA_NAVIGATION.md`](./IA_NAVIGATION.md)). Programme semantics, the compiler, measures, analysis reports, versions, and export remain. **Playbooks cease to be a user-facing product.** Agents are how F32/F33 and the WhatsApp agent requirement are delivered. Templates are how F11 and the WhatsApp template requirement are delivered.

---

## 2. Scope of this programme

### 2.1 In scope (software)

- Full Product Brief capabilities F1–F36 that are not yet **usable** (honest baseline in §5).
- Flevoland letter functional areas 1–9, implemented as product behaviour (not a separate Flevoland fork).
- **Configurable agents** (WhatsApp / work-order extra): first-class, versioned, reusable specialists inside a space; bound and runnable on a programme workspace.
- **Process/document templates** (WhatsApp / work-order extra): first-class, reusable programme contracts — structure, required fields, per-section instructions, quality/output rules, source–analysis–measure relationships.
- Engineering tests that lock contracts and write paths (unit/integration for new logic). i18n EN+NL on new UI.
- RLS and tenant isolation for every new table.

### 2.2 Out of scope (not this plan)

- Half-day PoC facilitation, KORZ on-site presence, live defect firefighting.
- Importing official Flevoland PDFs, OCR campaigns on scanned corpora.
- Stakeholder house-style Word templates that require a provincial `.dotx` we do not have.
- WCAG 2.1 AA audit campaign, performance campaign, residency/no-train contractual sign-off.
- Gazette publication, legal enactment, training on customer content.
- Full OT/CRDT concurrent editing (Phase 6b only if locks fail after F24 ships).
- A pre-built catalog of every commercial vendor. **Any LLM provider** is met by a pluggable API gateway (see D11), not by shipping N hardcoded SDKs on day one.

### 2.3 Depth: “fully” means usable

A work package is **not done** if it only adds SQL, Zod, or an unused helper.

**Done** means an authorised user can complete the user goal in the workbench (or Space admin UI) without workarounds, placeholders, or “paste JSON / paste markdown” as the happy path.

Schema, actions, UI, compiler/run wiring, `generation_runs`, and tests for new logic ship **in the same slice**.

---

## 3. Locked architecture decisions

These are agreed. Do not reopen them in a work package without updating this document.

| ID | Decision | Rationale |
|----|----------|-----------|
| **D1** | Enhance, do not rebuild. Spaces → Workspaces remain **in storage**. Display IA is Authority → Programme ([`IA_NAVIGATION.md`](./IA_NAVIGATION.md)). | Existing ingest, RAG, citations, tenancy, and workbench are the stack. |
| **D2** | **Agents subsume playbooks as the product.** Playbook rows may remain as storage behind an agent version for one transition; no playbook admin UI; no new seed-playbook buttons. | WhatsApp extra + F32/F33. Two admin surfaces would split the same behaviour. |
| **D3** | **Templates are the programme contract**, not a heading list. They own structure, required/optional, per-node instructions and fields, quality/output rules, and how sources/analysis/goals/measures relate. | WhatsApp extra + F11 + F16 placement. |
| **D4** | A programme workspace **binds one template + N agents** plus privileged document bindings (F3). | Authors select/run; they do not assemble prompts. |
| **D5** | **One compiler, one run log.** Every agent run uses `compileSystemPrompt`. Safety/citation core stays code-owned and always appended. Every run writes `generation_runs` (agent version, sources, instructions, output, citations). | F18–F21, F35. Prevents prompt forks in routes. |
| **D6** | Compiler `kind` (stage) is the workflow part an agent owns: `analysis`, `vision`, `measures`, `oer`, `qc`, `draft`, `chat`. | Maps letter areas 1–3, 6–7 and workbench sections. |
| **D7** | Authors never edit the system prompt. They may add **per-run instructions** (F33), logged on the run. Admins edit **agent versions**. | Brief F32 vs letter item 9. |
| **D8** | **Compose from artefacts.** Analysis, chapters, measures, and export are produced from template + bindings + agent output. Scratch textareas are not the source of truth. | Closes F12/F16/F27 gaps. |
| **D9** | **No schema-only merges.** Unused helpers (`ensureMeasureGraphNode`, `snapshotArtefact`, `acquireSectionLock` as they exist today) are wired or removed in the slice that owns them. | Stops foundation drift. |
| **D10** | **Write paths are complete.** When F17/F25 exist, generate / human edit / approve also snapshot and use real workflow states. | Collab and export depend on this. |
| **D11** | Agents are **not** locked to OpenAI. Each agent version selects an LLM **via API**: provider (or compatible endpoint), credentials, and model/version. Different agents in one workspace may use different providers. Implementation is a **pluggable LLM gateway** (OpenAI-compatible base URL + key + model, plus adapters for APIs that are not OpenAI-shaped). Adding a new provider is configuration and/or a small adapter — not a rewrite of agents or the compiler. Phase C must prove this with **at least two providers** on two agents in the same workspace. | WhatsApp: “selection of the respective LLM provider” and “the version of the relevant LLM.” |
| **D12** | Concurrent edit MVP is **section locks that cannot be stolen** + stale warnings. CRDT is optional later. | Brief F24 + prior plan Phase 6 note. |
| **D13** | Local-only development against local Supabase. Do not relink or migrate production cloud as part of this programme. | Existing operating constraint. |
| **D14** | **Display IA lock.** Two layers (Authority, Programme). Programme open = workbench. No research folder create-path. No Knowledge cluster as home. Names: Documents, Ask, Help. | 2026-08-31 IA discussion; [`IA_NAVIGATION.md`](./IA_NAVIGATION.md). |
| **D15** | **Publish is a frozen snapshot**, not gazette. Sister programmes cite only published versions. Default share is permissioned or link+code. | Brief §3 / §5.4; not a public CMS. |

---

## 4. Delivery principles

1. **Vertical slices, not layers.** Contract + persistence + actions + UI + run wiring + tests in one WP (or a tight consecutive pair).  
2. **Templates before agents that write; agents before analysis/authoring jobs.** Placement needs nodes; jobs need agents.  
3. **Provenance on every new write path from day one of that path.**  
4. **No silent rewrite of citation/safety core.** Changes to `playbook-compiler` safety blocks require an explicit note in the WP.  
5. **Migrate forward only.** New numbered SQL under `scripts/`; no destructive production resets.  
6. **i18n EN+NL** on every new user-visible string.  
7. **RLS on every new table** (member SELECT, writer mutate, admin-only where required).  
8. **Do not ship a workaround as the happy path** (heuristic paste-box, JSON import, export textarea, seed-another-playbook). Those may remain as test oracles or escape hatches, not as the product.

---

## 5. Honest baseline (2026-08-31)

Foundations from v1 exist and must be **reused**, not rebuilt.

| Area | What exists | What “foundation” hides |
|------|-------------|-------------------------|
| Tenancy | Space / workspace, `kind`, RBAC, RLS harden `043`–`046` | — |
| Corpus | Roles `036`, bindings metadata, section extraction on ingest | Bulk inventory / supersede UX thin |
| Compiler | `compileSystemPrompt` for chat / draft / measures; safety tests | No `analysis` / `vision` / `oer` / `qc` kinds |
| Playbooks | Tables `037` + `047` config; seed button | No admin; seed duplicates; latest-only; authors see UUID |
| Templates | `programme_templates` + outline nodes; TipTap outline editor | Generic 6-section seed; `purpose` only; no fields/quality/output |
| Measures | Registry + generate-from-RAG + approve gate (citations / OER justification) | No field editor; `outline_node_id` unused; two workflow states used |
| Chapters | `chapterDocuments` map; stub + generic draft regen | Draft job ignores template constraints and registry |
| Analysis | `analysis_reports` + heuristic token-overlap | Paste UI; no corpus job; no compare |
| Graph | `policy_graph_*` tables; orphan `ensureMeasureGraphNode` | No edges, UI, or approval gate |
| QC | `report_type` enum includes `quality` / `coverage` / `conflicts` | No job, no UI |
| Effects (F8) | Fields + effects panel | No OER-driven analysis agent |
| Runs | `generation_runs` on draft / measures / heuristic analysis | Analysis run lacks source set |
| Versions / locks | Tables + unused helpers; lock upsert **steals** | Not on write path |
| Comments | Evidence-board items only | Not on chapters/measures; no resolve |
| Export | Job row + markdown→DOCX + print-HTML + textarea source | Not composed; classification is a note; no citation-graph JSON |
| Workbench | `/workspaces/[id]/programme?section=` | Tabs over incomplete products |

**Do not mark F6–F10, F12/F14/F16/F17, F24–F26, F27, or F32 as done.** The July conformance audit overstated “foundation” as product-complete.

---

## 6. Domain objects (this programme)

Update [`design/00-domain-dictionary.md`](./design/00-domain-dictionary.md) in Phase A to match.

| Term | Meaning |
|------|---------|
| **Template** | Space-owned, reusable programme contract: outline tree, required/optional, per-node instructions and input fields, writing/quality rules, source–analysis–goal–measure relation rules, desired output form |
| **Outline node** | Chapter/section in a template (tree via `parent_id`) |
| **Agent** | Space-owned, versioned specialist: name, role/position, stage, instructions/method, source set, output contract/format, quality criteria, provider, model |
| **Agent version** | Immutable published revision (changelog; rollback = new version copying an old body) |
| **Programme bindings** | Privileged doc IDs + `templateId` + bound agent IDs (per stage or list) + `chapterDocuments` |
| **Playbook** | Legacy storage only during transition; not shown to authors or admins as a product |
| **Analysis report** | Saved findings with citations, agent/run linkage, re-runnable, comparable |
| **Measure** | Registry row (typology + SMART + citations + effects + `outline_node_id` + workflow) |
| **Generation run** | Immutable audit including `agent_version_id`, source set, unused sources, instructions |
| **Artefact version** | Snapshot of section/measure/document/agent used for compare/restore |

---

## 7. Phase map

```text
A  Domain spine          → types, migrations, compiler kinds (only with B started)
B  Templates             → library, bind, chapter constraints, placement hook
C  Agents                → admin, versions, bind, run (measures first, then second stage)
D  Analysis & QC         → F6, F7, F9, F10 as agent jobs + report UI
E  Authoring             → F12–F17, F14 pipelines, F16 merge, F13 editor
F  Collaboration         → F25 write path, F24 locks, F26 review
G  Export                → F27 compose + JSON graph + classification + audit freeze
```

**Do not start D until B and C are usable.**  
**Do not start E’s whole-programme compose until single-chapter structured draft + `outline_node_id` work.**  
**Do not start G compose until E writes chapters and measures into the template.**  
**F25 snapshots (F.1) may start as soon as E mutates artefacts; they are required before G freeze.**

Playbook admin (former cluster 5) is **Phase C**, not a later polish.

---

## 8. Work packages

Each WP lists: deliverable, primary paths, F-ids / letter mapping, depends on, **exit (usable)**.

Guidance model (authority / programme / jobs / coach): [docs/GUIDANCE_MODEL.md](GUIDANCE_MODEL.md). Display IA: [docs/IA_NAVIGATION.md](IA_NAVIGATION.md). Slices G.S0–G.S2 shipped in this codebase (`scripts/053_guidance_jobs.sql`, `scripts/054_guidance_mode.sql`, coach rail). Help AI is G.S3 (`HELP_AI_ENABLED`, `/api/help`) and must stay off the draft compiler. Do not rewrite F-ids for this work.

---

### Phase A — Domain spine

**Goal:** One vocabulary and persistence for templates (expanded) and agents, plus compiler stages. Land **with B.1**, not as an idle schema PR.

| ID | Work package | Deliverable | Paths (indicative) | Maps to | Depends | Exit |
|----|--------------|-------------|--------------------|---------|---------|------|
| A.1 | Domain types + dictionary | TypeScript + Zod for expanded template nodes, agent, agent version, bindings (`templateId`, per-stage or list of agent ids). Update domain dictionary. | `lib/programme/domain.ts`, `lib/programme/structured-artefacts.ts`, `docs/design/00-domain-dictionary.md` | D2–D4, F11, F32 | — | Types parse fixtures; dictionary matches code |
| A.2 | Migrations + RLS | `programme_templates` / outline node columns for instructions, fields JSON, quality/output metadata. `agents`, `agent_versions`. Bindings metadata shape. `generation_runs.agent_version_id`. RLS: space members read; space admin write agents/templates. | `scripts/048_*.sql` (next free number) | D2, D3, F21, F29 | A.1 | Applied locally; writer/admin split; no playbook UI dependency |
| A.3 | Compiler stages | Extend `PromptKind` with `analysis`, `vision`, `oer`, `qc`. Keep safety last. Default instruction payloads per kind in code (overridden by agent body). | `lib/chat/playbook-compiler.ts`, tests | D5, D6, F35 | A.1 | Unit tests: empty/hostile agent body still contains safety markers |

**Parallelism:** A.1 then A.2 ‖ A.3; **B.1 starts in the same delivery** as A.2.

**Phase A exit:** Types, SQL, compiler kinds exist **and** B.1 is in progress or merged. No merge of A.2 alone.

---

### Phase B — Templates (fully usable)

**Goal:** Space template library and programme bind; chapters obey node instructions; measures can attach to nodes.

| ID | Work package | Deliverable | Paths (indicative) | Maps to | Depends | Exit |
|----|--------------|-------------|--------------------|---------|---------|------|
| B.1 | Template persistence + actions | CRUD template; clone; list by space; sync outline tree including new fields (instructions, field specs, quality, output form, relation hints). | `lib/actions/outline.ts`, `lib/actions/template.ts` (new if cleaner) | F11 | A.1–A.2 | API/actions cover create/clone/update/delete node without losing ids |
| B.2 | Template library UI | Space-level list, create, clone, edit tree, required/optional, per-node instructions and fields. Not buried only on a workspace. | Space settings or `/spaces/[id]/templates`, i18n | F11, WhatsApp templates | B.1 | Admin can create and clone a template without SQL |
| B.3 | Bind + select (no duplicate seed) | Workspace binds **existing** template. “Create default if none” is idempotent. Remove generic 6-section-only happy path; ship a **handbook-shaped seed** (real chapter set + per-section instruction slots). Copy can be refined later; structure must be provincial-programme-like. | `lib/actions/outline.ts`, programme setup | F11, F36, letter 4 | B.1 | Setup shows template **name**; second click does not create a second default |
| B.4 | Chapter constraints | Chapter open/regen passes node title, purpose, instructions, required flag, and linked measures into `compileSystemPrompt` (`kind: draft`). Privileged bindings injected as privileged context (already in chat context — extend draft). | `programme-chapter-editor.tsx`, `lib/actions/document.ts` | F12, F3, F5 | B.3 | Regenerating a chapter is visibly constrained by that node, not a generic workspace draft |
| B.5 | Placement hook | Upsert/generate measure sets `outline_node_id` when a node is in context. Chapter compose can list measures for the node. | `lib/actions/measures.ts`, chapter editor | F16 (start) | B.3 | A measure created for “Housing” is stored on that node id |

**Phase B exit:** Author selects/clones a template, edits structure and per-section instructions, opens a chapter that uses those instructions, and sees measures attachable to a node. Required sections are required in the UI.

---

### Phase C — Agents (fully usable)

**Goal:** Configurable, versioned agents; authors run them; playbook product surface retired.

| ID | Work package | Deliverable | Paths (indicative) | Maps to | Depends | Exit |
|----|--------------|-------------|--------------------|---------|---------|------|
| C.1 | Agent persistence + versions | Create agent; publish version (never mutate published body); list versions; rollback = new version. Fields: name, role, stage, instructions, source set (roles + ids), output contract, quality rules, **LLM provider / endpoint / credentials ref / model version**. | `lib/actions/agent.ts`, SQL from A.2 | F32, WhatsApp agents | A.2 | Two versions exist in tests; latest is default; pin-to-version supported on binding |
| C.2 | Agent admin UI | Space admin: list, create, edit-as-new-version, changelog, rollback. No raw “system prompt” label; structured fields. LLM: choose provider or custom API endpoint, model/version. | Space agents UI, i18n | F32, D7, D11 | C.1 | Admin publishes v2; next run uses v2 without deploy |
| C.3 | Workspace bind | Bind N agents (per-stage slots preferred: analysis, vision, measures, oer, qc, draft, chat). Setup lists **names/roles**. Seed defaults **if none** (idempotent): analysis, measures, vision, oer, qc — distinct instructions and stages. | `lib/programme/domain.ts`, setup tab | F36, WhatsApp “multiple agents same case” | C.1, B.3 | Same workspace shows ≥2 agents with different roles |
| C.4 | Run path (measures) | Measure generation uses the **measures-stage agent**: its source set (not all RAG by default), instructions, **gateway completion** (provider + model), output contract. F33 extras optional. `generation_runs` stores `agent_version_id`, provider, model, sources. | `lib/actions/measures.ts` | F12, F4, F21, F33 | C.3, B.5, C.7 | Changing agent sources/provider/model changes the run; unused sources computed against **that** set |
| C.5 | Retire playbook UX | Remove seed-playbook button and playbook UUID summary. Migrate existing `playbookId` binding to an agent if present, or ignore. `listPlaybooks` unused by UI. | workbench, `lib/actions/playbook.ts` | D2 | C.3 | No user-facing playbook control remains |
| C.6 | Author run UX | Stage UI: which agent, which sources, optional F33 box, run. Preview of source set (titles), not the compiled system prompt. | workbench sections | F4, F23, F33 | C.4 | Author can switch agent or see why a source is excluded |
| C.7 | Pluggable LLM gateway | Shared client used by all agent runs: `complete({ provider, endpoint, model, messages, json? })`. Ship (1) OpenAI-compatible adapter (covers OpenAI and any compatible API), (2) at least one non-OpenAI adapter **or** a second configured compatible endpoint. Secrets via env/space settings, not in agent body. Failures surface as run errors. | `lib/llm/*`, wire C.4 and draft/chat/analysis when those stages run | D11, WhatsApp provider | C.1 | Same workspace: agent A runs provider/endpoint X, agent B runs Y; both persist `generation_runs.model` + provider |

**Phase C exit:** In one programme workspace, at least two agents with different roles, instructions, source sets, and **LLM providers/endpoints** can be configured and **run**. Safety core still applies. Playbook is not a product surface.

**PoC-shaped acceptance (software only):** demonstrable multiple agents in the same workspace — required here, not deferred to delivery.

---

### Phase D — Analysis and QC (cluster 1)

**Goal:** Saved, re-runnable, comparable analysis and QC as **agent jobs** on the real corpus.

| ID | Work package | Deliverable | Paths (indicative) | Maps to | Depends | Exit |
|----|--------------|-------------|--------------------|---------|---------|------|
| D.1 | Report artefact UI + F10 contract | List reports; open findings (disposition, anchors, citations); re-run same agent+source snapshot; compare two runs (diff findings). Every analysis/QC run stores source set, agent version, citations. | `lib/actions/analysis.ts`, Analysis tab | F10, F21, letter 1 | C.3 | Heuristic paste-box is not the primary UI |
| D.2 | Existing-policy agent job | Bound vision + `existing_policy` (+ sections). Findings: adopt/adapt/drop/missing; map to vision ambitions and provincial interests; near-duplicates; claim-level contradictions with citations on both sides; gaps vs vision focus and required interests. | analysis action, compiler `analysis` | F6, letter 1 | D.1, C.4 pattern, F2 sections | Officer can read a saved report produced from **documents**, not pasted fragments |
| D.3 | Vision / policy graph | Materialize nodes (ambition, interest, challenge, goal, measure) and edges. Coverage report (`coverage`). Approval **blocks** measures with no contribution path. Wire or delete `ensureMeasureGraphNode`. Read-only graph or matrix UI. | `policy_graph_*`, approve path | F7, letter 2 | D.2, measures registry | A measure with empty vision path cannot be approved |
| D.4 | OER agent job | Per-measure (and optional section) effect direction vs bound effects report; deviation flag; findings report `effects`. Effects panel remains the human edit surface. | compiler `oer`, effects + analysis | F8, letter 7 | C.3, F3 bindings | Deviations appear as report findings **and** on the measure; unjustified deviation still blocks approve |
| D.5 | QC suite agent | First-class: inconsistency (prose vs registry); overlap/duplication; missing topics vs template + vision; conflict register; provincial-interest coverage; style/compliance vs quality-rules docs. Findings with citations. | compiler `qc`, Quality / Analysis UI | F9, letter 6 | B.2, D.3 | QC produces an actionable list an author can work through — not chat |
| D.6 | Heuristic | Keep `heuristicPolicyDisposition` as a **test oracle** only; remove from happy-path UI or hide behind a dev control. | `structured-artefacts.ts`, workbench | — | D.2 | Authors do not run token-overlap as “analysis” |

**Phase D exit:** Baseline analysis (setup step) creates a saved existing-policy report from bound docs. Coverage + conflicts exist as artefacts. QC list exists. Graph gate is live. F10 compare works for at least existing-policy reports.

**Async (F34):** If D.2/D.5 exceed interactive time, add job progress/cancel/retry **in this phase** for those jobs (do not wait for a generic job platform WP).

---

### Phase E — Authoring completeness (cluster 2)

**Goal:** Structured generation into the template; humans edit; four-state review.

| ID | Work package | Deliverable | Paths (indicative) | Maps to | Depends | Exit |
|----|--------------|-------------|--------------------|---------|---------|------|
| E.1 | Measure editor | Full field editor: typology, SMART, vision/interest links, citations, narrative, outline node. Validation visible. JSON import is escape hatch only. | measures tab | F13, letter 3 | C.4, B.5 | Human can redact a generated measure without SQL/JSON |
| E.2 | Conversion pipelines | Named agent runs: (1) selected policy prose → candidate measures; (2) vision → ambition/goal **skeleton** (graph + optional outline nodes); (3) fragment import **merges** with dual provenance, does not blind-insert. | measures / outline actions | F14, letter 3 | E.1, D.3 | Vision skeleton is a product action, not a static seed |
| E.3 | Typology lint | Automated lint (playbook/agent rules + deterministic checks) + human checklist. Vague aspirations labelled `measure` fail complete/approve. | `structured-artefacts.ts`, UI | F15, letter 3 | E.1 | Approve blocked on typology failures |
| E.4 | Merge / anti-dupe | Place content on correct nodes; detect duplicate measures across chapters; propose merge with both citation sets. Chapter fill from registry + draft agent. | F16 engine + chapter editor | F16, letter 4 | B.4, B.5, E.1 | Same measure cannot silently appear in two chapters without a merge decision |
| E.5 | Structured chapter job | Draft agent + template node + privileged docs + node measures. Replaces generic `generateWorkspaceDocumentDraft` as the programme path (generic draft may remain for research workspaces). | document + chapter editor | F12, letter 4 | B.4, C.3 | One chapter regen is programme-structured |
| E.6 | Workflow states | Use `generated → in_review → revised → approved` on measures **and** chapter documents (or equivalent artefact status). Review tab: request-changes vs approve. Configurable “distinct reviewer” setting. | measures, review tab, documents | F17, letter 8 | E.1 | Author cannot jump generated → approved if policy requires review |
| E.7 | Whole-programme compose | Orchestrate required template nodes: draft agent per node, progress, cancel, retry (F34). | export/generation job infra | F12, F34 | E.5, F34 jobs | Author can start “fill programme” and watch per-chapter progress |

**Phase E exit:** Template → skeleton → measures (edit, lint, place) → fill a chapter from registry → review states. All structured generations write runs. Approval blocked without provenance, typology, and (if F7 live) vision path.

---

### Phase F — Collaboration (cluster 3)

**Goal:** Safe shared authoring and formal review on programme artefacts.

| ID | Work package | Deliverable | Paths (indicative) | Maps to | Depends | Exit |
|----|--------------|-------------|--------------------|---------|---------|------|
| F.1 | Version write path | Call `snapshotArtefact` on chapter save, measure mutate, approve, agent run (output snapshot). Reason required on approve/restore. | `lib/actions/collaboration.ts` + callers | F25, F17 | E.1, E.6 | Rows exist after normal authoring; `listArtefactVersions` is not empty in use |
| F.2 | Version UI | History, compare two snapshots, restore, show reason. Measures + chapters first; agents already have versions in C. | workbench | F25 | F.1 | Author can restore a previous chapter/measure |
| F.3 | Locks | Fix acquire: **refuse** if another member holds unexpired lock. Acquire on chapter open; block save without lock; release on leave/expiry; show holder. | `collaboration.ts`, chapter editor | F24, letter 8 | E.5 | Two sessions cannot silent last-write-wins on one chapter |
| F.4 | Presence (optional in-phase) | “Also open” warning if a second editor views the same `section_key`. No CRDT. | chapter editor | F24 | F.3 | Warning visible; not a blocker for F.5 |
| F.5 | Anchored comments | Comments on outline node / measure / document span; resolve/reopen. | new comments model or extend `workspace_comments` | F26, letter 8 | E.6 | Reviewer comments on a measure, not only evidence cards |
| F.6 | Review assignments | Assign reviewer; request-changes vs approve; honour distinct-reviewer policy. | review tab | F26, F17 | F.5, E.6 | Reviewer can request changes; self-approve blocked when configured |

**Phase F exit:** Restore approved-previous section/measure; reviewer request-changes; lock prevents overwrite; comments live on programme artefacts.

**Phase 6b (not scheduled):** OT/CRDT only if F.3–F.4 fail real two-author use. Record a decision here before designing it.

---

### Phase G — Export quality (cluster 4)

**Goal:** Stakeholder handoff from a **composed, classifiable, auditable** package.

| ID | Work package | Deliverable | Paths (indicative) | Maps to | Depends | Exit |
|----|--------------|-------------|--------------------|---------|---------|------|
| G.1 | Compose | Build canonical markdown/JSON from template + chapter documents + measures + citations. Textarea is override only. | `lib/actions/export.ts`, new `lib/export/compose-programme.ts` | F27, D8, letter 4+8 | E.4, E.5 | Export without typing narrative still contains outline + measures |
| G.2 | Registry + citation graph JSON | Full measures + citation graph (doc/section/page/span/quote). Dedicated `format: json`. | export actions | F27, F18, F19 | G.1 | Machine file matches registry |
| G.3 | Word from compose | Outline → Heading styles; measures appendix; citations as footnotes. Reuse OOXML builder; extend as needed. Space `.docx` theme later if a file exists — not a gate. | `markdown-to-docx.ts` | F27, letter 8 | G.1 | Word file matches workbench structure |
| G.4 | Print artefact | Print-HTML from compose; store as job result. Filename/UX honest (Print / PDF). Server `.pdf` optional later. | `markdown-to-print-html.ts` | F27 | G.1 | Print preview is the programme, not the scratch pad |
| G.5 | Classification | Enforce `classification_max` on **composed** payload (redact or refuse). UI picker. Mark document. Do not complete a leaking job. | export.ts, UI | F27, F29, letter 8 | G.1 | Confidential body cannot leave via export |
| G.6 | Audit freeze | Manifest + hashes + runs + artefact versions + export bytes. Keyed to approved/frozen version when F.1/E.6 exist. | `buildAuditPackageJson` | F21, F25, Phase 7.6 | F.1, G.1 | Re-running the package for a freeze is reproducible |
| G.7 | Stakeholder gate | Soft “export draft” allowed; **stakeholder download** requires freeze/approval policy (configurable). | export + review | F17, F27 | E.6, G.6 | Draft vs handoff is explicit |
| G.8 | Publish snapshot | Frozen version becomes **Published**: reading-room page (permissioned and/or link+code). Optional public listing. Other programmes bind that snapshot as existing policy. Not gazette. | export + new publish routes | F27, D15, IA §7–8 | G.6, G.7 | A published programme can be opened read-only without workbench chrome; a second programme can cite it |

**Phase G exit:** DOCX / print / MD / JSON of the composed programme; confidential cannot leak; audit package tied to a freeze; publish snapshot is a distinct state from download.

---

### Phase H — Display IA (usable chrome)

**Goal:** The UI matches [`IA_NAVIGATION.md`](./IA_NAVIGATION.md) without changing storage.

| ID | Work package | Deliverable | Paths (indicative) | Maps to | Depends | Exit |
|----|--------------|-------------|--------------------|---------|---------|------|
| H.1 | Authority / programme chrome | Display names; dashboard **My programmes**; authority page lists programmes only; create programme (not folder); programme home = workbench Overview; file manager only via Documents `?files=1`. | dashboard, space list, workbench, i18n EN+NL | D14, G1 | — | New user never sees research folder as a peer or Knowledge as programme home |
| H.2 | Documents list on programme | One Documents stage: files + inherited origin badge + role. Notes on Overview. No Evidence tab. | workbench corpus, notes | D14, G1.6 | H.1 | Files and inherited are one list |
| H.3 | Publish UI | After G.8: Publish control, reading room, bind published sister programme. | export / publish | D15 | G.8 | Author can publish freeze and cite another published programme |

---

## 9. Requirement traceability

### 9.1 Product Brief F-ids

| F-ids | Phase that makes them **usable** | Notes |
|-------|----------------------------------|--------|
| F1–F5 | Baseline + B.4 / C.4 (privileged + per-run source set) | Ingest exists; agent source set completes F4 |
| F6, F10 | D.1–D.2 | |
| F7 | D.3 | |
| F8 | D.4 (job) + existing panel | |
| F9 | D.5 | |
| F11 | B | Expanded template |
| F12 | E.5, E.7 | C.4 is measure grain only |
| F13, F15 | E.1, E.3 | |
| F14 | E.2 | |
| F16 | B.5 then E.4 | |
| F17 | E.6 | |
| F18–F21 | D5 + every new run path | Chat already strong |
| F22–F23 | C.6 + existing evidence | Pin evidence into agent source set if missing |
| F24–F26 | F | |
| F27 | G | |
| F28 | Baseline + optional share polish | Not a phase gate |
| F29 | Baseline + G.5 | Product flags exist; ops sign-off out of scope |
| F30 | Continuous i18n | |
| F31, F36 | B.3, C.3, D.1 | Guided setup becomes real when analysis is real |
| F32–F33 | C | Agents + F33 boxes |
| F34 | D.6-adjacent jobs + E.7 | When first long job needs it |
| F35 | A.3, C, existing assessor/evals | Strict mode on agent config |

### 9.2 Flevoland letter (nine areas)

| Letter | Phase |
|--------|--------|
| 1 Existing-policy analysis | D |
| 2 Vision-led | D.3, B.4 privileged vision |
| 3 Measures | C.4, E |
| 4 Structure | B, E.4–E.5 |
| 5 Traceability | All run paths; G.2 |
| 6 QC | D.5 |
| 7 OER | D.4 |
| 8 Collaborate / export / security | F, G, existing RLS |
| 9 Usability / instructions / reliability | C.6, F33, F35, F31 |

### 9.3 WhatsApp extras

| Extra | Phase |
|-------|--------|
| Multiple configurable agents (name, role, instructions, sources, workflow part, output, quality, **any LLM provider via API**, model version); stored, modified, reused | C (incl. C.7) |
| Templates (structure, mandatory fields, per-section instructions, quality, source–analysis–measure relations, output form); clone/reuse | B |

---

## 10. Cross-cutting engineering

| Concern | Rule |
|---------|------|
| Compiler | `lib/chat/playbook-compiler.ts` is the only assembler. New kinds add safety markers + tests. |
| LLM | `lib/llm` gateway is the only completion path for agent runs. `model-tiers.ts` defaults may remain as fallbacks; agent version overrides provider + model. |
| Runs | `lib/actions/generation-run.ts` gains `agent_version_id`; unused sources vs **agent** source set. |
| i18n | `lib/i18n/messages/en.ts` + `nl.ts` in the same WP as UI. |
| RLS | Follow `043` writer/admin split. Security review on agents, templates, export compose. |
| Tests | New Zod/compiler/reducers: unit tests in-WP. Do not organise the programme around Playwright Flevoland campaigns. |
| Extension map | Update [`design/00-extension-points.md`](./design/00-extension-points.md) in A/C when paths change. |
| Local DB | New scripts numbered after current local max (`048+`). Never push these to cloud as part of this plan. |

---

## 11. Phase-exit gate (every phase)

Before starting the next phase:

- [ ] Each WP in the phase meets its **Exit** column (usable).  
- [ ] No new unused table or helper.  
- [ ] `generation_runs` written for every new generation path.  
- [ ] Safety/citation core unchanged or explicitly noted.  
- [ ] RLS reasoning recorded if schema changed.  
- [ ] EN+NL for new UI.  
- [ ] Unit/integration tests for new logic green.  
- [ ] F-ids in §9 for that phase are demonstrable in the workbench.

---

## 12. Forbidden shortcuts

- Shipping analysis as the two-textarea heuristic.  
- Shipping export as a markdown scratch pad.  
- Shipping “agents” as extra playbook seed buttons or instruction textareas only.  
- Shipping templates as the generic six-section seed without per-section instructions/fields.  
- Acquire-lock upsert that steals another user’s lock.  
- Approve that jumps `generated → approved` after E.6 exists.  
- Whole-programme compose before structured single-chapter + placement.  
- Hardcoding OpenAI as the only callable backend after Phase C.  
- CRDT as a side quest during A–C.  
- Schema PR with “UI in a follow-up.”

---

## 13. What v1 already did (do not redo)

Reuse: document roles, bindings, section extraction, compiler (chat/draft/measures), measures registry + generate job, effects panel, `generation_runs`, outline editor, chapter stub map, DOCX/print renderers, compliance settings, groundedness assessor, golden eval hooks, workbench IA.

**Rework in place** (do not add a parallel system): playbook seed UX → agents (C.5); analysis tab (D); export tab (G); review tab (E.6/F.6); lock helper (F.3); snapshot helper (F.1).

---

## 14. Immediate next step

After this document is **agreed**:

1. **H.1** display IA chrome may ship in parallel with A–C (does not change storage).  
2. Start **A.1 + A.2 + B.1** as the first domain delivery (domain + template persistence).  
3. Then **B.2–B.5** until Phase B exit.  
4. Then **Phase C** (agents).  
5. Do not open D–G until B and C exit. **G.8 / H.3 publish** follows G freeze.

Update [`GROK_FIRST_RUNBOOK.md`](./GROK_FIRST_RUNBOOK.md) “Next work package” to **A.1** when implementation starts.

---

## 15. Document control

| Field | Value |
|-------|--------|
| Title | Agora — Execution Plan |
| Version | 2 |
| Date | 2026-08-31 |
| Nature | Canonical software execution programme |
| Replaces | Execution Plan v1 (Phases 0–10 foundations) |
| Product definition | [`PRODUCT_BRIEF.md`](./PRODUCT_BRIEF.md) only |
| Agreement | Architecture locks D1–D15 (§3). Change requires a dated revision of this file. Display IA: [`IA_NAVIGATION.md`](./IA_NAVIGATION.md). |
