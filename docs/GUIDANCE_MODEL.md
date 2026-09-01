# Agora — Guidance, orientation, and jobs

**Status:** Requirements (proposed)  
**Date:** 2026-08-31  
**Companion to:** [`PRODUCT_BRIEF.md`](./PRODUCT_BRIEF.md) (especially §4 users, §5 IA, F31, F36, §9 flow), [`IA_NAVIGATION.md`](./IA_NAVIGATION.md)  
**Architecture locks:** [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md) D1–D15 — this document does not reopen them  
**Vocabulary:** [`design/00-domain-dictionary.md`](./design/00-domain-dictionary.md)  
**Recommendation canvas:** guidance model (jobs × guided/expert)

This document is the full requirements map for walking public-sector users through Agora without forking the product into a second “simple” app.

It elaborates Product Brief **F31 (author workbench)** and **F36 (guided programme setup)**. It does not change what Agora produces, who may approve, or how analysis and drafting work.

---

## 1. Purpose

Agora is a sophisticated policy production system. Target users are provincial and municipal officers who are expert in the Environment and Planning Act and not expert in this tool.

Requirements in this document make the existing workbench **legible and sequential** for those users, while leaving every audit, citation, review, and export control in place.

---

## 2. Problem

| Observation | Effect |
|-------------|--------|
| Tenancy uses SaaS names (space, workspace, workbench) | Users cannot form a mental model of authority vs programme |
| Programme “Guided setup” is five done/not-done rows | Status is not teaching, not sequencing, not explaining *why* |
| Access roles are owner / admin / member / viewer | Everyone with write access sees administrator chrome (templates, agents, danger zone) |
| Product Brief already lists seven *jobs* | Those jobs are not represented in the UI |
| Policy AIs live in chat, analysis, and draft | There is no place to ask “what is this tab?” without contaminating policy threads |
| Tabs are parallel | The §9 production flow is implicit |

---

## 3. Goals

1. A new user can explain, in their own words, what an authority is, what a programme is, and what the current screen is for.
2. A user invited as author, reviewer, or administrator lands on work that matches that invitation — not on a generic admin surface.
3. Guided mode walks the production pipeline (Brief §9) as a coach **beside** the workbench. Expert mode is the same workbench with the coach dismissed.
4. Questions about *the tool* are answered by a product-help system that cannot draft, approve, or mutate programme artefacts.
5. Sophistication stays: citations, effects deviations, distinct-reviewer, generation audit, export classification rules.

---

## 4. Non-goals

These are rejected. Do not implement them under this programme.

| Rejected | Reason |
|----------|--------|
| A second “amateur” application or execute-only site | Duplicates the workbench; audit/review/effects still required; UIs drift |
| Amateur/pro as two layouts or two component trees | Same trap with a toggle; Guided/Expert is chrome and sequencing only |
| End-user workflow designer (Zapier-for-policy) | Templates + bound agents already *are* the designed workflow |
| Replacing Spaces → Workspaces | Locked (Execution Plan D1). Change **display names**, not the data model |
| Merging product help into workspace chat or draft agents | Contaminates policy artefacts with tool-talk |
| Auto-running the pipeline (analyse → generate → approve) with one click | Removes human gates the Brief requires |
| Replacing access RBAC with jobs | Jobs shape chrome; they must not grant permissions |
| Modal product tours that trap the user until Next is clicked | Forgotten by week two; hostile; not a coach |
| New tenancy layer (programme → workstream) | Out of Brief default model |

---

## 5. Locked decisions

| ID | Decision |
|----|----------|
| **L1** | One workbench. Guidance is superimposed (coach rail + help). |
| **L2** | Three independent layers: **access** (may they?), **job** (what are they here to do?), **guidance mode** (how much help?). |
| **L3** | Jobs in v1: **Administrator**, **Author**, **Reviewer**. Brief specialists (legal, effects, senior lead) use Author or Reviewer; do not add a fourth job yet. |
| **L4** | Guided vs Expert is a **per-user preference**, not a permission and not a second UI. |
| **L5** | Display language: authority / programme per [`IA_NAVIGATION.md`](./IA_NAVIGATION.md). Storage and API keep `spaces` / `workspaces`. |
| **L6** | Two AIs: policy AIs (existing stages) vs product Help (this document). Hard boundary. |
| **L7** | Coach works **without** Help AI. Scripted, state-derived next actions are the baseline. Help AI is an enhancement in the same rail. |
| **L8** | Pipeline progress is **derived from programme data**, not from user-ticked checkboxes. |
| **L9** | Soft sequence (coach “next”) vs hard gates (existing product rules). The coach never bypasses hard gates. |
| **L10** | Job never grants a capability the access role does not have. Viewer + Author job is still read-only. |

---

## 6. Terminology

### 6.1 Display vs storage

| Storage / code | Display (EN) | Display (NL, intent) | Meaning |
|----------------|--------------|----------------------|---------|
| Space | Authority (chrome: instance name) | Bevoegd gezag (chrome: de naam) | Province, municipality, or department. Shared documents, members, templates, specialists. |
| Workspace `kind = environmental_programme` | Programme | Programma | One environmental programme (or a defined part). The production unit. Opening it *is* the workbench. |
| Workspace `kind = research` | *(not a create-path)* | | Legacy storage. Not a peer of Programme. |
| Programme workbench | The programme | | Overview, documents, analysis, structure, chapters, measures, effects, provenance, review, export. |
| Policy chat | Ask | Vraag | Programme assistant. Not Help. |
| Product Help | Help | Hulp | How Agora works. Cannot draft. |
| Guided setup (checklist) | Programme configuration *(admin)* / Coach first steps *(author)* | | See G6.6. |
| Agent | Specialist | Specialist | Versioned instructions for one production stage. |
| Template | Programme template / outline | Programmamatrix | The handbook-shaped contract: chapters, instructions, required fields. |
| Bindings | Bound sources | Gekoppelde bronnen | Which vision, effects report, handbook, and policy documents constrain this programme. |
| Playbook | *(not user-facing — D2)* | | Legacy storage only. |

Copy must define the term on first sight (authority page, first programme open, coach). Do not rely on a separate help site.

### 6.2 Tab purpose (required one-liners)

These strings are product copy, not comments. They appear in the coach and as a subtitle or empty-state heading on the tab itself.

| Tab (keep id) | Display name (may keep) | Purpose (EN) |
|---------------|-------------------------|--------------|
| `overview` | Overview | Where this programme stands, next action, team notes. |
| `setup` | Configuration | Configure this programme: specialists, outline template, and review policy. |
| `corpus` | Documents | What this programme may use. Each file has a role. Origin (here vs authority) is a badge, not a tab. |
| `analysis` | Analysis | Saved reports of what to adopt, adapt, drop, or still write — with citations. Does not write the programme. |
| `outline` | Structure | Chapter tree the handbook requires. Skeleton of the document. |
| `editor` | Chapters | Write or regenerate a chapter. People edit; AI proposes. |
| `measures` | Measures | Register of concrete actions, not vague ambitions. Linked to the vision. |
| `effects` | Effects | Whether each measure helps, harms, or ignores the environmental effects report. Deviations need a written reason. |
| `provenance` | Provenance | Why a claim is believed: citations, generation history, unused documents. |
| `review` | Review | A colleague signs off or sends work back. You cannot approve your own work when distinct-reviewer is on. |
| `export` | Export | Word, PDF, and an audit pack. Handoff, not the working copy. |

Dutch strings are required at implementation (G12.1). English above is the source of intent.

---

## 7. Actors

### 7.1 Access (unchanged)

Existing space and workspace membership:

`owner` | `admin` | `member` | `viewer`

These answer **may this account create, edit, invite, or only read?** They remain the RBAC source of truth. This programme does not migrate to `tenant_admin` / `org_manager` / etc.

Settings, danger zone, template library, and agent admin stay behind `canAccessSettings` / equivalent (owner, admin).

### 7.2 Job (new)

Jobs answer **what should this person see first?**

| Job | Typical Brief user | Default home | Primary work |
|-----|--------------------|--------------|--------------|
| **Administrator** | Space administrator, playbook/template/agent administrator | Organisation | Members, inherited corpus, templates, specialists, compliance |
| **Author** | Policy officer, senior lead, legal or effects specialist *while drafting* | Programme, current pipeline stage | Bind sources (if permitted), analyse, structure, draft, effects, request review |
| **Reviewer** | Reviewer / colleague | Programme, Review | Queue of items to approve or request-changes |

A person may hold **Administrator** on the organisation and **Author** or **Reviewer** on a programme. Chrome follows the **current place**:

- Organisation routes → Administrator chrome if they have that job *and* access; otherwise a read-only organisation overview.
- Programme routes → workspace job (Author or Reviewer).
- Header switcher when the user holds more than one job in this organisation (G3.5).

### 7.3 Guidance mode (new)

| Mode | Coach rail | Navigation | Permissions |
|------|------------|------------|-------------|
| **Guided** | Open by default | Current stage emphasized; other stages reachable | Unchanged |
| **Expert** | Closed; Help control remains | Full tab strip for that job | Unchanged |

Default for a new profile: **Guided**. Stored per user (not per organisation).

### 7.4 Brief user mapping (v1)

| Brief role | Access (typical) | Job (typical) |
|------------|------------------|---------------|
| Policy officer / programme author | member | Author |
| Senior policy lead | member or admin | Author (Expert when they choose) |
| Legal / Environment and Planning Act specialist | member | Author or Reviewer per assignment |
| Environmental effects specialist | member | Author (Effects stage) or Reviewer |
| Reviewer / colleague | member | Reviewer |
| Space administrator | owner / admin | Administrator |
| Playbook administrator | admin | Administrator |

Do not add Legal, Effects, or Lead as jobs in this programme. Assignment to a chapter or measure already exists; the coach can say “this chapter is waiting for you” without a fourth job type.

### 7.5 Permission overlay (normative)

```
effective capability = access role permissions
chrome and default route = job + guidance mode
```

If access forbids an action the coach recommends, the coach states that and does not show a fake primary button. Example: Viewer + Author job → “You can read this programme. Ask an administrator for edit access to bind sources.”

---

## 8. Production pipeline

The coach’s sequence is Product Brief §9, named for users. Completion is **derived**.

| # | Stage id | User-facing name | Complete when (derived) |
|---|----------|------------------|-------------------------|
| 1 | `orient` | Organisation & programme | Programme workspace exists; user can open it |
| 2 | `bind` | Bound sources | At least one environmental vision **and** one existing-policy document bound. Handbook and effects report are recommended; coach lists them as missing, not blocking `bind` complete |
| 3 | `analyse` | Analysis | At least one analysis report with status succeeded for this programme |
| 4 | `structure` | Structure & measures | Template bound; outline has nodes; at least one measure row exists |
| 5 | `draft` | Chapters | At least one chapter artefact has non-empty body |
| 6 | `check` | Effects & quality | Every measure that is `in_review` or beyond has effects fields set; any deviation has justification; QC run exists **or** user has explicitly continued (soft). Hard gates for *approval* stay in review policy |
| 7 | `review` | Review | Required chapters and measures are approved under current review policy (including distinct-reviewer) |
| 8 | `export` | Export | At least one successful export job for this programme |

**Soft sequence:** Guided mode’s primary CTA is the first incomplete stage. Users may open any tab.

**Hard gates:** unchanged product rules (citation completeness, distinct-reviewer, classification on export, lock/presence). The coach explains them; it does not override them.

**Research folders:** stages 2–8 do not apply. Coach is a short orientation only (G6.9).

---

## 9. Coach

### 9.1 Presence

- Persistent rail on organisation and programme pages (and research folder: compact).
- Superimposed: workbench layout does not become a wizard canvas. The existing tabs and editors stay.
- Not a blocking modal after organisation first-run (organisation wizard may remain a dialog; see §11).
- Guided: rail open. Expert: rail closed; a Help control reopens it.
- Collapse/expand remembered per user.
- Viewport: rail on the side at desktop; bottom sheet on small viewports. Never a separate “guide app” route that replaces the workbench.

### 9.2 Contents (always)

1. **Where you are** — organisation vs programme vs tab, using display names.
2. **What this is for** — the one-liner from §6.2 (or organisation equivalent).
3. **Next action** — one concrete step, or “nothing required; you can work in Expert.”
4. **Pipeline** — eight stages, current complete/incomplete (programme only).
5. **Blockers** — why the next action is disabled, in plain language.
6. **Ask** — product Help (scripted suggestions if AI is unavailable).

### 9.3 Behaviour

- Next action navigates to the real screen and, where feasible, focuses the real control (bind vision, run analysis). It does not invent a shadow form.
- Optional highlight of a control: never traps focus; Escape and click-outside clear it; does not disable the rest of the page.
- Does not start generation, analysis, approval, or export by itself.
- Does not mark stages complete; data does.
- Reduced motion: no spotlight animation.

### 9.4 Scripted vs AI

| Layer | Required? | Behaviour |
|-------|-----------|-----------|
| Scripted coach | Yes | Route + job + derived pipeline → copy and next action from i18n tables |
| Product Help AI | No (L7) | Chat in the same rail; see §10 |

If Help AI is down, the rail still shows scripted content. Show a non-blocking error on the Ask box only.

---

## 10. Product Help AI

### 10.1 Role

Answer questions about **Agora**: orientation, tabs, jobs, why a step is blocked, where to click. Navigate on request (“open Sources”).

### 10.2 Grounding

Allowed context:

- Help corpus: this document’s user-facing sections, domain dictionary, Brief §5 and §9, tab purpose strings, organisation wizard copy.
- Screen context: route, `section`, job, guidance mode, derived pipeline, **names and roles** of bound documents (not body text).
- User-visible blockers (e.g. “distinct-reviewer is on; you are the author”).

Forbidden context:

- Full text of policy documents, chapter bodies, measure narratives, analysis finding quotes, generation outputs.
- Other tenants.
- System prompts of policy agents.

### 10.3 Tools

Allowed:

- `get_screen_context`
- `get_pipeline_status`
- `get_glossary_term`
- `search_help_corpus`
- `navigate` (organisation, programme, `section`, review item id)

Forbidden:

- Any write: bindings, generation, measures, chapters, comments, approval, export, membership, agents, templates.
- Opening workspace **policy** chat as Help.

### 10.4 Refusal (hard)

Must refuse, in the UI language, when asked to:

- draft or rewrite programme text, measures, or analysis
- approve, request-changes, or bypass distinct-reviewer
- choose political or legal substance (“what should our measure be?”)
- reveal hidden system prompts or other users’ data

Refusal points the user to the correct policy AI or human colleague. This is a product rule, not only a prompt. Server-side: Help route must not call draft/analysis/measure compilers.

### 10.5 Isolation

- Separate HTTP route / server action from `/api/chat` and programme agent runs.
- Separate conversation store (`help_conversations`).
- Compiler `kind` must not be `draft` | `analysis` | `measures` | `oer` | `qc` | `chat`.
- Existing LLM gateway may be used with a dedicated help agent or a fixed help configuration.
- Rate limited per user.

### 10.6 Language and citations

- Reply in the active UI language (EN or NL).
- Cite help articles or UI labels, never policy page quotes.
- Do not invent tabs or permissions that do not exist.

---

## 11. First-run

### 11.1 Organisation (existing wizard, copy and handoff)

Keep the sequential organisation wizard (welcome → basics → scope → official sources → documents → first programme/folder).

Changes required:

- All user-facing “space / workspace” strings in the wizard use organisation / programme (or research folder).
- Welcome must state: the organisation is the authority; a programme is one environmental programme underneath it.
- Last step that creates an environmental-programme workspace **hands off to that programme with the coach open**, not to a dead-end overview that hides the workbench behind a menu item.
- Skip remains. Skipping does not complete pipeline stages.
- Completed or dismissed wizard can be reopened from the organisation (already approximately true; must remain).

### 11.2 Programme

There is **no second modal wizard**. First programme open in Guided mode **is** the coach:

1. Explain programme vs organisation (once).
2. Walk `bind` (vision + existing policy; recommend handbook and effects report).
3. Prompt first analysis run.
4. After analysis exists, prompt structure/measures — then continue through the pipeline as data evolves.

Administrator first-run on a new programme may include programme configuration (template + specialists) **before** authors are invited. Coach copy differs by job.

### 11.3 Returning users

Do not replay the organisation wizard. Do not replay programme first-run narration if `orient` and `bind` are already complete. Coach remains available.

---

## 12. Surfaces

### 12.1 Default homes

| Job | Guided | Expert |
|-----|--------|--------|
| Author | Programme, first incomplete stage | Programme, last-used `section` or Structure |
| Reviewer | Review queue | Review queue |
| Administrator | Organisation (templates/agents/corpus as last-used admin tab) | Same |

### 12.2 Navigation visibility

Items not primary for the job go to a **More** menu or are omitted from the primary strip. They remain reachable via More, Help navigate, and deep links.

| Area | Author Guided | Author Expert | Reviewer | Administrator |
|------|---------------|---------------|----------|---------------|
| Organisation overview | Link in header | Link in header | Link in header | Home |
| Members, invitations, compliance, danger | Hidden | Hidden | Hidden | Primary |
| Templates, specialists (agents) | Hidden (coach: “set by administrator”) | Link in More if `canAccessSettings` | Hidden | Primary |
| Programme configuration (`setup`) | Not landing; More if they can bind | Available | Hidden unless they can configure | Available |
| Sources, analysis, structure, chapters, measures, effects | Current stage primary; others in strip | Full strip | Via item in queue (read) | Available, not home |
| Provenance | Strip | Strip | From item | Available |
| Review | After draft exists, or if assigned | Strip | Home | Available |
| Export | After review or when stage reached | Strip | If permitted | Available |
| Workspace chat (policy AI) | Available; labelled **Ask**, not Help | Same | Read/ask if permitted | Same |
| Research folder | Not a create-path | Same | — | Legacy rows only |

**Rule:** hiding is chrome. Deep links to `?section=editor` still open the editor (e.g. reviewer reading a chapter). Actions still respect access.

### 12.3 Programme landing

For `kind = environmental_programme`, opening the workspace **is** the programme (workbench at `/workspaces/{id}/programme`). Overview is home; Guided may jump to the first incomplete stage. Do not use documents-and-chat or “Analyse & draft” as a second product.

`kind = research` is not a create-path. Existing rows may keep `/workspaces/{id}` as a file manager until migrated.

### 12.4 Header

Always visible:

- Authority name (link)
- Programme name
- Job (if multiple, switcher)
- Guided / Expert control
- Help (opens coach rail, focuses Ask)

### 12.5 Empty and blocked states

Every primary tab has an empty state that repeats the purpose one-liner and the next action, so Expert mode without the rail is still oriented. Blocked actions state the hard gate in the same words the coach uses.

---

## 13. Functional requirements

IDs are **G-** to avoid collision with Brief F1–F36. Priority: **Must** for first usable slice, **Should** for complete guidance, **Later** if it can wait.

### 13.1 Terminology and IA — G1

| ID | Priority | Requirement | Acceptance |
|----|----------|-------------|------------|
| G1.1 | Must | User-facing EN/NL copy uses authority / programme per [`IA_NAVIGATION.md`](./IA_NAVIGATION.md). | No primary nav, wizard, or workbench title says Space, Workspace, or Programme workbench. Research folder is not a create-path. |
| G1.2 | Must | Tab purpose strings from §6.2 are shown on the tab (subtitle or empty state) and in the coach. | Spot-check all sections in both languages. |
| G1.3 | Must | Storage names, URLs, and `workspace.kind` unchanged. | Existing deep links and RLS still work. |
| G1.4 | Should | In-coach glossary for terms in §6.1. | Opening glossary from “bound documents” shows the definition. |
| G1.5 | Must | Programme kind: workspace route renders the programme directly (G12.3). | Author with a programme bookmark does not land on a documents-and-chat dump. |
| G1.6 | Must | Knowledge cluster (Files / Inherited / Evidence / Notes) is not the programme home. | Programme Documents is one list with role + origin. |

### 13.2 Access unchanged — G2

| ID | Priority | Requirement | Acceptance |
|----|----------|-------------|------------|
| G2.1 | Must | Access roles and RLS unchanged by jobs. | Viewer cannot bind, generate, or approve regardless of job. |
| G2.2 | Must | Coach never presents an action the access role cannot perform. | Viewer Author sees explanation, not a failing primary button. |
| G2.3 | Must | Template/agent/danger remain access-gated. | Member Author cannot open space danger zone via More. |

### 13.3 Jobs — G3

| ID | Priority | Requirement | Acceptance |
|----|----------|-------------|------------|
| G3.1 | Must | Jobs are Administrator, Author, Reviewer only. | Invite UI offers these (plus access role as today). |
| G3.2 | Must | Space membership can record Administrator vs not. Workspace membership records Author or Reviewer. | Inviting “review this programme” creates Reviewer job + member access by default. |
| G3.3 | Must | Default homes follow §12.1. | Reviewer login → review queue, not setup. Administrator → organisation, not editor. |
| G3.4 | Must | Multiple jobs: header switcher; chrome follows current place (§7.2). | Space admin who is also programme author sees admin home on organisation and author home on programme. |
| G3.5 | Must | Job changes are audited (who, when, from, to). | Audit log row exists. |
| G3.6 | Must | Last Administrator on an organisation cannot be removed or demoted until another exists. | UI error, no orphan org. |
| G3.7 | Must | Distinct-reviewer continues to use identity, not job. | Author with Reviewer job still cannot approve their own chapter when policy is on. |
| G3.8 | Should | Existing members backfilled: owner/admin → Administrator + Author on programme workspaces they already access; member → Author; users who only comment/review if detectable → Reviewer, else Author. | No one locked out. |
| G3.9 | Later | Fine-grained “effects specialist” job. | Out of v1. |

### 13.4 Guidance mode — G4

| ID | Priority | Requirement | Acceptance |
|----|----------|-------------|------------|
| G4.1 | Must | Per-user Guided \| Expert, persisted. | Toggle survives reload. |
| G4.2 | Must | New users start Guided. | Fresh profile opens coach. |
| G4.3 | Must | Mode does not change access or job. | Expert viewer still cannot edit. |
| G4.4 | Should | After stage `review` complete once, prompt once to try Expert. Dismissible, never forced. | Prompt shows at most once per user. |
| G4.5 | Must | Expert: rail closed; Help reopens it. | Help focuses Ask or scripted panel. |

### 13.5 Coach — G5 / G6

| ID | Priority | Requirement | Acceptance |
|----|----------|-------------|------------|
| G5.1 | Must | Coach rail as §9.1; does not replace workbench. | All existing workbench actions remain on the main canvas. |
| G5.2 | Must | Scripted content: where, purpose, next, pipeline, blockers (§9.2). | Each programme section has distinct purpose copy. |
| G5.3 | Must | Next action uses real navigation/focus. | “Bind vision” opens Sources and focuses the vision binding control. |
| G5.4 | Must | No focus trap; Escape clears highlight. | Keyboard user can ignore the coach entirely. |
| G5.5 | Must | Coach never auto-runs agents or approval. | No generation_run created by opening the rail. |
| G5.6 | Must | Pipeline derived per §8. | Binding a vision + policy flips `bind` without a checkbox. |
| G5.7 | Must | Guided landing = first incomplete stage. | New programme opens Sources (bind), not a done/not-done list. |
| G5.8 | Must | Ahead-of-sequence navigation allowed; coach states the recommended next stage. | Opening Export early does not crash; coach still points at bind if unbound. |
| G5.9 | Must | Replace programme “Guided setup” checklist as author landing. Admin sees Programme configuration. | Authors are not greeted with five ticks as the product tour. |
| G5.10 | Must | Research folder: orientation only, no eight-stage pipeline. | No false “bind vision” on a research folder. |
| G5.11 | Must | Organisation pages: coach explains organisation vs programmes. | First organisation visit matches wizard welcome intent even if wizard was skipped. |
| G5.12 | Should | Optional control highlight, reduced-motion safe. | Prefers-reduced-motion: no animation. |
| G5.13 | Should | Small viewport: bottom sheet. | Rail not unusable at 375px width. |
| G5.14 | Must | Empty states on tabs match coach purpose + next (G12.5). | Expert with coach closed still understands Sources. |

### 13.6 Product Help — G7

| ID | Priority | Requirement | Acceptance |
|----|----------|-------------|------------|
| G7.1 | Should | Help AI in the coach Ask box, isolated per §10. | Calls do not hit draft/analysis compilers (test). |
| G7.2 | Must (when AI on) | Hard refuse list §10.4, server-enforced. | “Write chapter 3” returns refusal; no `generation_runs` kind draft. |
| G7.3 | Must (when AI on) | No policy document bodies in Help prompts. | Prompt fixture test. |
| G7.4 | Must (when AI on) | Separate `help_conversations`; RLS tenant + user. | Other users cannot read. |
| G7.5 | Must | Scripted coach works if Help is disabled or errors. | Feature flag off → rail intact. |
| G7.6 | Should | `navigate` tool. | “Take me to Review” changes `section`. |
| G7.7 | Should | Replies in active UI language. | NL UI → NL answer. |
| G7.8 | Must (when AI on) | Rate limit per user. | Burst returns 429 in Ask box, not a hang. |
| G7.9 | Later | Help corpus CMS for admins. | v1: in-repo / seeded articles. |

### 13.7 First-run — G8

| ID | Priority | Requirement | Acceptance |
|----|----------|-------------|------------|
| G8.1 | Must | Organisation wizard copy per §11.1. | Welcome explains organisation vs programme. |
| G8.2 | Must | Creating first programme opens that programme with coach. | No extra “open workbench” hunt. |
| G8.3 | Must | No second programme modal wizard. | First bind/analyse is the coach. |
| G8.4 | Must | Skip does not mark pipeline complete. | Skipped org still shows incomplete `orient`/`bind` as appropriate. |
| G8.5 | Must | No wizard replay when setup already completed/dismissed. | Coach still available. |
| G8.6 | Should | Reopen organisation wizard from organisation. | Existing entry point remains labelled with new terms. |

### 13.8 Surfaces — G9

| ID | Priority | Requirement | Acceptance |
|----|----------|-------------|------------|
| G9.1 | Must | Nav visibility per §12.2. | Reviewer primary strip is Review-centred, not Setup/Agents. |
| G9.2 | Must | Deep links work regardless of job chrome. | `?section=editor` opens editor; actions still RBAC. |
| G9.3 | Must | Header per §12.4. | Guidance toggle and Help visible on programme. |
| G9.4 | Should | Policy chat labelled as programme assistant, distinct from Help. | Two different entry points, two different refusals. |
| G9.5 | Must | More menu contains hidden-but-permitted items. | Author admin hybrid can reach templates via More. |

### 13.9 Configuration vs authoring — G10

| ID | Priority | Requirement | Acceptance |
|----|----------|-------------|------------|
| G10.1 | Must | Creating/editing templates and specialist agents is Administrator + access. | Author member cannot publish a new agent. |
| G10.2 | Must | Binding privileged documents on a programme is allowed for Author if access includes source/workspace update. | Author can complete `bind` without being org admin. |
| G10.3 | Should | Coach tells authors when template/agents are missing and to ask an administrator. | Empty configuration state names the job who can fix it. |

### 13.10 Data, API, security — G11

| ID | Priority | Requirement | Acceptance |
|----|----------|-------------|------------|
| G11.1 | Must | Persist `guidance_mode` on the user profile. | RLS: user reads/writes own row. |
| G11.2 | Must | Persist jobs on space and workspace membership (or equivalent assignment table). | RLS: same visibility as membership. |
| G11.3 | Must | `help_conversations` / messages with RLS. | No cross-tenant read. |
| G11.4 | Must | Help route authorised as current user; no service-role shortcut around RLS for reads of other users. | Standard action auth. |
| G11.5 | Must | Feature flag for Help AI independent of coach. | Flag off: G5 still ships. |

### 13.11 i18n, accessibility, quality — G12

| ID | Priority | Requirement | Acceptance |
|----|----------|-------------|------------|
| G12.1 | Must | All new UI strings EN + NL. | i18n audit for new keys. |
| G12.2 | Must | Coach is a labelled complementary landmark; workbench remains main. | Landmark exists; skip link or natural tab order reaches main first or equivalently usable. |
| G12.3 | Must | Coach load must not block workbench first paint beyond existing page cost. | Rail may fill in after data; no extra full-page spinner. |
| G12.4 | Should | Help/coach keyboard operable (open, close, Ask). | Without pointer. |
| G12.5 | Must | Tests: pipeline derivation unit tests; Help refusal integration test; invite-job default home e2e. | CI on new logic. |

### 13.12 Telemetry — G13

| ID | Priority | Requirement | Acceptance |
|----|----------|-------------|------------|
| G13.1 | Should | Aggregate events: mode toggle, coach reopen, Help refusal. No policy text, no document bodies. | Payload schema review. |
| G13.2 | Later | Tenant-level disable of Help AI. | Compliance settings. |

---

## 14. Data model (requirements, not DDL)

Minimum fields. Exact schema is an implementation task; RLS is mandatory.

**Profile**

- `guidance_mode`: `guided` | `expert` (default `guided`)
- `expert_prompt_dismissed_at` (nullable)

**Space membership**

- `job`: `administrator` | `none` (or boolean `is_administrator_job`)
- Access `role` unchanged

**Workspace membership**

- `job`: `author` | `reviewer`
- Access `role` unchanged

**Help**

- `help_conversations`: id, user_id, space_id (nullable), workspace_id (nullable), created_at
- `help_messages`: conversation_id, role, content, created_at  
  Content is about the product, not programme drafts.

**Not stored**

- Pipeline checkboxes. Derive from bindings, reports, measures, chapters, review states, export jobs.

---

## 15. Non-functional

| Area | Requirement |
|------|-------------|
| Tenancy | No new tenant concept. All new rows inherit space/workspace isolation. |
| Security | Help AI cannot become a write API. Jobs cannot escalate access. |
| i18n | EN and NL at ship of each slice. |
| Accessibility | Coach must not fail keyboard or screen-reader use of the workbench. Full WCAG campaign remains out of Execution Plan; this slice must not regress landmarks already present. |
| Performance | Scripted coach is local derivation + copy. Help AI is async in the rail. |
| Reliability | Help failure degrades to scripted coach. |
| Audit | Job changes; Help conversations retained per organisation retention policy. |
| Models | Help may use a cheaper/faster tier via the existing gateway (D11). Not a new vendor lock. |

---

## 16. Delivery slices (requirements order)

This is not an Execution Plan update. It is the order that satisfies dependencies.

| Slice | Ships | Must IDs |
|-------|-------|----------|
| **S0 Copy & landing** | G1 display names, tab purpose, programme-as-home, empty states, wizard copy | G1.1–G1.3, G1.5, G5.14, G8.1, G8.2 |
| **S1 Jobs** | Invite + persist jobs, default homes, nav visibility, header switcher, backfill, audit | G2.*, G3.1–G3.8, G9.1–G9.3, G9.5, G10.*, G11.2 |
| **S2 Coach** | Rail, derived pipeline, scripted next action, replace checklist landing, research/org variants | G4.*, G5.1–G5.11, G6 via G5, G8.3–G8.5, G11.1, G12.* except Help tests |
| **S3 Help AI** | Isolated route, corpus, refuse, navigate, flag | G7.*, G11.3–G11.5, G12.5 Help test |
| **S4 Polish** | Glossary, highlight, mobile sheet, expert prompt, telemetry, tenant Help disable | G1.4, G4.4, G5.12–G5.13, G13 |

S0 can ship without schema for jobs. S1 should not wait for Help AI. S2 must not depend on S3 (L7).

---

## 17. Out of scope (repeated for implementers)

- Second application or execute-only UI
- Workflow builder
- Changing Brief F-ids or compiler/agent architecture
- OCR, `.dotx`, gazette, WCAG campaign, residency contracts
- Fourth job types (legal, effects, lead)
- Help answering from the policy corpus
- Auto-approve or auto-generate-all

---

## 18. Open questions (do not block S0–S2)

1. **Display word “Organisation” vs “Authority”** in NL/EN for mixed municipal/provincial tenants — pick at copy time; both beat “Space.”
2. **Workspace access role on invite** vs job: keep inviting as member+Author as default; admin+Administrator for org staff.
3. **Help corpus ownership** — product team in-repo until a CMS is justified (G7.9).
4. **Senior lead** as Author with a future “sign-off” capability — remains review policy, not a job.

Resolved for this document: no dual app; no job-as-RBAC; no Help-in-policy-chat.

---

## 19. Traceability to the Product Brief

| Brief | This document |
|-------|----------------|
| §4 Primary users | §7.4 mapping onto three jobs |
| §5 Spaces → Workspaces | L5, G1 — display only |
| F31 Author workbench | Coach + job chrome; workbench stays one surface |
| F32–F33 Agents / instructions | Unchanged; Help must not edit prompts |
| F36 Guided programme setup | §11.2 + G5.9 — real guide, not a checklist |
| §9 End-to-end flow | §8 pipeline derivation |
| Human approval, citations, distinct-reviewer | L9, G3.7, G5.5, G7.2 |

---

## 20. Definition of done (programme)

This requirements set is **met in software** when:

1. A new Author in Guided mode can go from first programme open → bound vision and policy → first analysis without being taught by an engineer, and can say what the current screen is for.
2. A Reviewer never lands on Programme configuration or Agents as home.
3. An Administrator still has the full organisation surface.
4. Expert mode is the same product with the rail closed.
5. Help AI, if enabled, cannot draft or approve.
6. Access roles still solely determine write/approve/invite.

Until then, F36 remains a checklist with a misleading name.
