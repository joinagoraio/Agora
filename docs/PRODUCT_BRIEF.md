# Agora — Product Brief

**Status:** Canonical product definition  
**Audience:** Product, engineering, and partners  
**Scope:** What Agora is and must become as a mature product  
**Out of scope for this document:** Execution plans, roadmaps, phasing, and implementation tactics

This brief is the concluded target definition for Agora. Execution planning is separate and comes later.

---

## 1. Purpose of this document

This document records the full product scope for Agora as an environmental-programme production platform. It absorbs the functional intent of provincial environmental-programme authoring under the Environment and Planning Act, and the product conclusions reached for Agora’s architecture and capabilities.

It is not a pilot checklist, not a proof-of-concept brief, and not a delivery plan.

---

## 2. Product definition

**Agora** is a secure, multi-tenant platform for provincial and municipal governments to research, analyse, draft, review, and publish **environmental programmes** under the **Environment and Planning Act**.

Programmes are grounded in an **environmental vision**, constrained by an **environmental effects report**, structured according to a provincial (or municipal) **programme handbook**, and informed by **existing policy** and **quality rules**.

Agora is not a generic chatbot. It is a **policy production system**:

**corpus → analysis → structured drafting → provenance → human review → export / publish**

### Primary outcome

A complete, coherent, source-traceable environmental programme (or a defined programme part) that:

- meets the intent of the Environment and Planning Act;
- follows the authority’s programme method and quality rules;
- remains explicitly aligned with the environmental vision;
- accounts for the environmental effects report, including explicit deviations;
- is auditable in sources, generation history, and human approval.

---

## 3. Positioning

| Agora is | Agora is not |
|----------|--------------|
| A policy research and programme authoring workbench | A free-form chatbot with documents attached |
| Vision-led and effects-report-aware | A copy-paste rewriter of existing policy |
| Source-traceable by design | A black-box text generator |
| Collaborative with human approval gates | An autonomous legal decision-maker |
| Multi-tenant and government-security oriented | A public CMS or gazette publisher (a permissioned **published snapshot** of a frozen programme is in scope; enactment is not) |

Human control and redaction remain mandatory. Agora supports and accelerates professional judgement; it does not replace it.

---

## 4. Primary users

| Role | Responsibility in Agora |
|------|-------------------------|
| Policy officer / programme author | Analyse sources, draft sections and measures, revise with AI assistance |
| Senior policy lead | Coherence with vision and provincial interests; readiness for sign-off |
| Legal / Environment and Planning Act specialist | Measure typology, statutory framing, conflict review |
| Environmental effects specialist | Effects alignment and documented deviations |
| Reviewer / colleague | Comments, suggestions, tracked review |
| Space administrator | Members, permissions, classification, retention |
| Playbook administrator | Versioned instruction packs, templates, evaluation rules |

---

## 5. Information architecture

Display IA (names, journeys, publish): [`IA_NAVIGATION.md`](./IA_NAVIGATION.md). Storage stays Spaces → Workspaces.

### 5.1 Conclusion on structure

**Two layers only.** Storage names stay Space → Workspace. Users see **Authority** → **Programme**.

| Layer | Display | Meaning | Owns |
|-------|---------|---------|------|
| **Space** | Authority (chrome: the proper name) | Province, municipality, or department — the security and library boundary | Shared documents, members, templates, specialists |
| **Workspace** (`kind = environmental_programme`) | Programme | One environmental programme, or a defined programme part | Bindings, outline, measures, analysis, drafts, review, freeze, export, publish snapshot |

One authority → many programmes (siblings). One programme → **one official programme** (many chapters internally; Word/PDF/audit are packages of that same programme). The environmental vision (e.g. Vision 2050) is an authority **document**, not a programme; programmes bind it.

A third level (programme → workstream) is only warranted when multiple parallel teams must draft separately and merge. Folders inside programmes are not the model.

### 5.2 What must change semantically

Workspaces are not blank research folders and not a Knowledge tab strip (files / inherited / evidence / notes). Mature Agora requires **typed programme workspaces** with:

- bound privileged documents (vision, effects report, handbook, existing policy);
- programme template and specialists;
- measures registry and outline;
- approval, freeze, export, and an optional **published** snapshot.

Research (`kind = research`) is legacy storage only — not a peer create-path. Explore via Ask on authority documents, or start a programme.

### 5.3 Rejected alternatives

- Flattening to workspaces only (loses shared organisational corpus and inheritance)
- One undifferentiated space with no programme boundary (breaks provenance, permissions, versioning)
- Replacing the model with a pure document CMS tree (too weak for multi-document analysis and generation runs)
- Research folder as a sibling of programme that opens the same screen
- Knowledge cluster (Files, Inherited, Evidence, Notes) as the programme home
- Treat download (PDF/Word) as the only final state, with no frozen/published snapshot
- Agora as gazette or official publication channel

### 5.4 Publish and cross-programme citation

Approved → Frozen → **Published** (shareable snapshot, default permissioned or link+code). Official gazette enactment is out of product. A programme may quote another programme only from that other’s **published** frozen version, bound as existing policy.

---

## 6. Domain model

### 6.1 Tenancy

- **Space** — organisation; jurisdiction; mission; programme timeframe conventions; inherited shared corpus; membership and RBAC
- **Programme workspace** — one programme or programme part; lifecycle from setup through approval and export
- **Roles** — owner, editor, reviewer, viewer (extensible); audited access changes

### 6.2 Corpus

Every source document has:

- File and extracted full text (PDF, Word, text, Markdown)
- Page and section map
- **Document role** (required): Environmental vision | Environmental effects report | Programme handbook | Existing policy | Housing programme | Quality and style rules | Other
- Bibliographic and governance metadata: title, adopting body, adoption date, publication channel, validity period, domain/team, language, classification
- Status: active | superseded | archived

Archived and superseded documents are excluded from generation unless explicitly included for a run.

Section index: chapter, section, and paragraph identifiers where extractable or manually annotated.

External ingest: official government publication search/import and approved connectors (e.g. cloud drives), under the same role and classification model.

### 6.3 Policy graph

First-class entities and relationships:

- Ambition (from the environmental vision)
- Provincial interest (or municipal equivalent)
- Challenge / spatial task
- Goal
- Measure
- Implementation action

Relationships include: contributes to, implements, conflicts with, duplicates, supersedes, and effects (positive / negative / neutral / unknown) relative to the environmental effects report.

Coverage matrix: every required provincial interest mapped to goals and measures.

### 6.4 Programme artefact

- Programme outline (template-driven chapter and section tree)
- Programme sections (structure constraints plus narrative where allowed)
- Measures registry (structured fields plus narrative)
- Generation runs (inputs, playbook version, model parameters, source set, outputs, citations)
- Versions of every editable artefact
- Comments and review threads anchored to section or measure
- Export packages (Word, PDF, Markdown, structured machine export of registry and citation graph)

### 6.5 Playbooks

Versioned instruction packs that define:

- system safety and citation constraints;
- domain rules for vision-led reasoning;
- programme structure and writing style;
- measure typology and SMART (or equivalent) rules;
- effects-report handling;
- quality lint rules.

Playbooks are bound to workspace type. They are diffable and rollbackable. End users do not edit raw system prompts; administrators manage playbooks.

---

## 7. Capability pillars

The product is organised into five pillars. Together they are the complete mature scope.

1. **Knowledge and context** — what enters the system and how privileged frameworks are bound  
2. **Analysis and intelligence** — what the system concludes from the corpus  
3. **Programme authoring** — what is produced as structured programme content  
4. **Traceability and trust** — why outputs are believable and auditable  
5. **Collaboration and platform** — how teams work, approve, export, and secure data  

Usability and AI control are embedded across these pillars, especially in playbooks, run instructions, transparency, and reliability controls.

---

## 8. Functional requirements

### 8.1 Knowledge and context

**F1. Corpus management**  
Upload, import, classify, role-tag, archive, restore, and supersede documents. Support bulk import from a controlled policy inventory. Deduplicate by content hash and bibliographic metadata.

**F2. Section-aware indexing**  
Every ingested document yields searchable pages and, where possible, chapter/section/paragraph anchors used in citations and unused-source reporting.

**F3. Leading-framework binding**  
Each programme workspace declares privileged inputs:

- leading environmental vision document(s);
- binding environmental effects report;
- binding programme handbook sections;
- binding quality and style rules;
- optional housing programme and other mandatory inputs.

Generation and analysis always treat these as privileged context, distinct from supporting policy.

**F4. Context control**  
Authors include or exclude documents, notes, and evidence for a given run. The UI shows the exact active source set. That set is stored immutably with the run.

**F5. Space and workspace steering**  
Mission, summary, jurisdiction, programme timeframe, and additional AI context are injected as organisational scope. They never substitute for cited source text.

---

### 8.2 Analysis and intelligence

**F6. Existing-policy analysis**  
Produce structured, saved reports that:

- map policy fragments to vision ambitions and provincial interests;
- classify each fragment as adopt, adapt, drop, or missing;
- detect duplicates and near-duplicates;
- detect contradictions at claim level, with citations on both sides;
- list gaps relative to vision focus and required provincial interests.

**F7. Vision-led reasoning**  
Build and maintain the policy graph linking ambitions, provincial interests, challenges, goals, and measures. Flag or block measures that cannot cite a contribution path to the vision.

**F8. Environmental effects report linkage**  
For each measure (and optionally each section):

- expected effect direction versus the effects-report baseline: positive, negative, neutral, or unknown;
- explicit deviation flag when a measure worsens or diverges from the effects report;
- mandatory human justification when deviation is true.

**F9. Quality control suite**  
First-class product capability (not chat-only), including:

- inconsistency scan across programme text and registry;
- overlap and duplication between measures and sections;
- missing topics versus handbook outline and vision focus;
- cross-document conflict register;
- provincial-interest coverage completeness;
- style and compliance checks against quality rules (length, tone, structure, terminology).

**F10. Analysis artefacts**  
All analysis outputs are saved objects with citations, re-runnable, and comparable across runs (diff of findings).

---

### 8.3 Programme authoring

**F11. Programme templates**  
Configurable outlines matching the authority’s environmental-programme structure. Templates define required sections, optional sections, and section purposes.

**F12. Structured generation**  
Generate or regenerate:

- a whole programme draft;
- a single chapter or section;
- a single measure or measure set.

Every run uses a selected playbook, source set, and outline constraints.

**F13. Measure authoring**  
Measures are structured objects with:

- title, identifier, status;
- type: ambition, goal, measure, or implementation;
- SMART or equivalent fields: specific action, owner/role, geography, timeline, indicator, success criterion;
- contribution links to vision, interests, and challenges;
- effects-report linkage fields;
- source citations (mandatory for generated claims);
- narrative explanation.

AI may propose; humans edit fields and prose. Validation gates block “complete” or “approved” status until required fields and citations exist.

**F14. Conversion pipelines**  
Supported transforms:

- policy prose → candidate measures;
- vision text → ambition and goal skeleton;
- existing programme fragments → merged candidates with de-duplication.

**F15. Environment and Planning Act alignment**  
Playbook-enforced rules for measure formulation: concrete, implementable, correctly typed — not vague aspirations labelled as measures. Automated lint plus human checklist.

**F16. Merge and anti-duplication**  
When filling chapters, the system places content in the correct outline nodes, prevents duplicate measures across chapters, and proposes merges with provenance of both sources.

**F17. Human redaction workflow**  
Mandatory states: generated → in review → revised → approved. Diff against previous version. AI may suggest edits; approval is human-only.

---

### 8.4 Traceability and trust

**F18. Citation standard**  
Every generated factual or normative claim that depends on a source carries:

- document id and title;
- chapter/section/paragraph, or page plus text span;
- quote or precise paraphrase flag;
- link to open the source viewer with highlight.

**F19. Per-measure provenance**  
Measure detail lists all supporting sources. Incomplete provenance blocks approval.

**F20. Unused sources report**  
For any generation or analysis run: corpus documents not retrieved or used, with optional suggestions for documents that should have been used based on role and outline.

**F21. Generation audit log**  
Immutable record of who, when, playbook version, model, parameters, source set, input instructions, output snapshot, and citation set.

**F22. Evidence board**  
Saved findings and Q&A with confidence and citations, includable in later generation runs.

**F23. Answer transparency**  
The UI distinguishes quoted source text, AI inference, workspace metadata, and human notes. No silent blending.

---

### 8.5 Collaboration and platform

**F24. Shared authoring**  
Concurrent editing with presence, conflict handling, and section locks where required. No silent last-write-wins.

**F25. Version history**  
Full version tree for programme documents, sections, measures, and playbooks. Restore, compare, and annotate why a version was created.

**F26. Comments and review**  
Anchored comments; resolve and reopen; review assignments; request-changes versus approve.

**F27. Export**  

- Microsoft Word (.docx) matching programme structure  
- PDF (print-ready)  
- Markdown  
- Structured machine export of the measures registry and citation graph (JSON)  
- Classification-aware export rules (confidential material blocked or redacted per policy)

**F28. Sharing**  
Workspace invites; time-limited share links with role; shared conversation and evidence views where permitted.

**F29. Security and compliance**  

- Authentication, RBAC, and row-level isolation between tenants  
- Classification: public, internal, confidential  
- Encryption in transit and at rest  
- CSRF protection, rate limits, prompt-injection guards  
- Audit logs for access, export, generation, and permission changes  
- Data residency options suitable for government use  
- Retention, deletion, and legal-hold policies  
- No training on customer content by default (contractual and technical controls)

**F30. Internationalisation**  
Full UI and generation language support, starting with English and Dutch, with language as an explicit run parameter.

---

### 8.6 Usability and AI control

**F31. Author workbench**  
One coherent workbench: corpus, analysis, outline, editor, measures registry, effects panel, provenance, and review — not disconnected tools.

**F32. Playbook management**  
Administrators create, edit, and version playbooks. Authors select a playbook; they do not edit raw system prompts.

**F33. Adjustable run instructions**  
Per-run author instructions layered on the playbook; logged and versioned.

**F34. Performance**  
Streaming for interactive work; asynchronous jobs for long generations with progress, cancel, and retry. Clear expectations for chat latency versus full-programme generation.

**F35. Reliability controls**  

- groundedness checks (claims without citations flagged);
- regeneration with stricter citation mode;
- deterministic evaluation suites against golden documents for playbook regression;
- review-needed markers on weak evidence.

**F36. Guided programme setup**  
Bind vision, effects report, handbook, and quality rules → import policy inventory → select template → run baseline analysis.

---

## 9. End-to-end product flow

The mature product supports this complete flow without workarounds:

1. **Setup** — Create Space → create programme workspace → bind privileged documents → import policy inventory → select template and playbook  
2. **Baseline analysis** — Existing-policy analysis, vision graph, coverage, conflicts, effects risks  
3. **Skeleton** — Outline plus ambition/goal skeleton from vision focus  
4. **Measure development** — Generate candidates → human edit → validate typology, SMART fields, provenance, and effects fields  
5. **Chapter composition** — Fill sections from registry and narrative generation → de-duplicate → style lint  
6. **Effects pass** — Full environmental effects report alignment; document deviations  
7. **Quality pass** — Automated suite plus human review assignments  
8. **Approve** — Role-gated approval; freeze version  
9. **Export / handoff** — Word, PDF, and structured export; retain audit package  
10. **Publish** (optional) — Frozen snapshot for reading-room / link+code; other programmes may cite this version only  

---

## 10. Non-functional requirements

| Area | Requirement |
|------|-------------|
| Availability | Production-grade availability suitable for government programme work |
| Scalability | Multi-tenant; large document corpora per workspace |
| Retrieval | Hierarchical: privileged documents always available; supporting documents via retrieval plus explicit include; section-level chunking |
| Models | Configurable model tiers for Q&A, long-form drafting, and quality control; quality gates per playbook |
| Observability | Per-tenant usage, cost, latency, failure rates, citation success rate |
| Accessibility | WCAG 2.1 AA for core authoring flows |
| Backup and recovery | Documented recovery objectives; tenant-level export for exit |

---

## 11. Success criteria

Agora meets this brief when a government programme team can, without shortcuts:

- produce an environmental programme draft that is structurally compliant, vision-led, effects-report-aware, and source-traceable to chapter or paragraph;
- obtain saved reports for adopt/adapt/missing, conflicts, and provincial-interest coverage;
- maintain a measures registry with typology and mandatory provenance;
- collaborate with versions, comments, and approval;
- export stakeholder-ready packages;
- operate under government-grade security and audit;
- steer behaviour through versioned playbooks rather than ad-hoc prompting or code changes.

---

## 12. Explicit out of scope

The following are not part of the Agora product:

- Replacing political decision-making
- Automatic legal enactment or official gazette publication without human approval
- Guaranteeing legal correctness without qualified human review
- Training foundation models on confidential customer corpora by default

---

## 13. Relationship to current foundations

Agora already has foundations that this brief builds on: multi-tenant Spaces and Workspaces, document ingest, retrieval-augmented chat with citations, AI drafting, evidence capture, notes and comments, and security controls.

This brief defines the **complete mature product**. Gaps relative to today — programme typing, privileged document roles, policy graph, structured analysis and quality suites, effects-report linkage, measures registry, versioning, export, and playbooks — are part of the target definition, not optional extras.

How and when those gaps are closed is an execution concern and is deliberately excluded from this document.

---

## 14. Document control

| Field | Value |
|-------|-------|
| Title | Agora — Product Brief |
| Nature | Canonical product definition |
| Language | English (all domain terms translated) |
| Companion docs | [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md) **v2** (software delivery; agents + templates), [`AI_COST_ESTIMATE.md`](./AI_COST_ESTIMATE.md), [`CONFIDENCE_PLAN.md`](./CONFIDENCE_PLAN.md), [`GROK_FIRST_RUNBOOK.md`](./GROK_FIRST_RUNBOOK.md) |
