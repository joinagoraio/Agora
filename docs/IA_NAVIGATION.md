# Agora — Information architecture and navigation

**Status:** Canonical (agreed 2026-08-31)  
**Companion:** [`PRODUCT_BRIEF.md`](./PRODUCT_BRIEF.md) §5, [`GUIDANCE_MODEL.md`](./GUIDANCE_MODEL.md), [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md)  
**Storage:** Unchanged. `spaces` / `workspaces` / URLs stay. This document is **display structure, naming, and user journeys**.

This is the product IA after inheriting generic Agora (spaces, workspaces, knowledge tabs) and refactoring into an environmental-programme production tool. It supersedes mixed “organisation / programme / research folder / library / files / sources” chrome where they conflict.

---

## 1. What the tool is

Agora produces **environmental programmes** under the Environment and Planning Act.

A programme exists to produce **one official programme** a colleague can review and the authority can export: handbook-structured text, a measures register, effects account, citations, human sign-off, Word/PDF/audit pack.

Documents, analysis, and Ask are how you get there. They are not the objective.

Agora is **not** a document library, **not** a chatbot with files attached, and **not** the official gazette.

---

## 2. Two layers only

| Layer | Display (EN / NL) | Storage | Owns |
|-------|-------------------|---------|------|
| **Authority** | The instance name in chrome (e.g. Provincie Flevoland). Type name **Authority** / **Bevoegd gezag** when creating. | `spaces` | People, shared documents, templates, specialists. Security boundary. |
| **Programme** | Programme / Programma | `workspaces.kind = environmental_programme` | This programme’s files (with roles), analysis, chapters, measures, review, freeze, export, publish snapshot. |

No third layer. Programmes are **siblings** under an authority. A programme does not contain folders. A folder does not belong to a programme.

**Cardinality**

- One authority → many programmes.
- One programme → **one official programme document** (internally: many chapters + measures). Export may be several *files* (Word, PDF, audit pack) of that same programme.
- **Vision 2050** (omgevingsvisie) is **not** a programme. It is an authority **Document** with role environmental vision. Programmes **bind** it. They do not rewrite it. Several programmes may share the same visie.

A third level (programme → workstream) remains out of the default model (Brief §5.1).

---

## 3. Names (one word per idea)

| Concept | Say (EN) | Say (NL) | Never say in the UI |
|---------|----------|----------|---------------------|
| Tenant | Proper name; **Authority** on create | De naam; **Bevoegd gezag** on create | Space, organisation, company, workspace |
| Unit of work | **Programme** | **Programma** | Workspace, workbench, project, folder |
| Objective | One official programme | Eén omgevingsprogramma | A pile of unrelated documents |
| Shared files | **Documents** | **Documenten** | Library, corpus, knowledge |
| Programme files | **Documents** (each has a **role**) | **Documenten** (elk heeft een **rol**) | Files vs sources vs workspace documents |
| Policy assistant | **Ask** | **Vraag** | Chat as a destination page |
| Product help | **Help** | **Hulp** | Mixing Help into Ask |
| Scratch research | Not a peer type | Geen eigen type | Research folder next to programme |

Every primary screen has a **title** and a **one-line subtitle**. A small **info** mark (not an eye) may add two sentences. The subtitle must be enough without the mark.

---

## 4. Daily journeys

**After sign-in:** **My programmes** — programmes the user can work on, with status and next action. Switch authority in the header (or a quiet Authorities list) if they belong to more than one. Do not start on an admin page of mixed cards.

**Opening a programme** *is* the work. Landing is the programme workbench (`/workspaces/{id}/programme`), not a documents-and-chat dump and not a second click on Analyse & draft.

**Authority area** (from the header name): Documents (shared), People, Setup (templates, specialists). Authors do not land here by accident.

---

## 5. Inside a programme

Left (or primary) navigation is the production journey. One current stage. Ask stays a companion rail, not a home.

| Nav id | Display | Subtitle (always visible) |
|--------|---------|---------------------------|
| `overview` | Overview | Where this programme stands |
| `corpus` | Documents | What this programme may use. Each file has a role (vision, effects report, handbook, existing policy, …). Origin (uploaded here vs from the authority) is a badge, not a second tab. |
| `analysis` | Analysis | What to keep, change, or still write. Does not write the programme. |
| `outline` | Structure | Chapter tree from the handbook |
| `editor` | Chapters | The text of the programme |
| `measures` | Measures | Concrete actions, not ambitions |
| `effects` | Effects | Fit with the effects report |
| `provenance` | Provenance | Why a claim is believed |
| `review` | Review | A colleague signs off |
| `export` | Export | Word, PDF, audit pack — handoff, not the working copy |
| `setup` | Configuration | Administrators: template, specialists, review policy. Authors reach via More if permitted. |

**Overview** is the programme home for Expert and for orientation: name, purpose, status, single next action, team **notes** (quiet; not a peer of Documents). Guided mode may jump to the first incomplete production stage; Overview remains in the nav.

**Ask** is the programme assistant (policy, sources, drafts). **Help** is product Help (how Agora works). They must not share a thread or a write path.

---

## 6. What we do not keep as peers

### 6.1 Research folders

`workspaces.kind = research` may remain in storage for existing rows. It is **not** a peer of Programme in create, lists, or dashboard.

Explore without a programme: **Ask** over the authority’s Documents.  
Start work: create a **programme** (status may be *Collecting* until bindings exist).

Do not create “a programme of many documents that together form a vision.” The visie is one authority document; programmes implement it.

### 6.2 Knowledge cluster

Do **not** keep **Knowledge** with Files, Inherited, Evidence, and Notes as a tab strip.

| Old tab | Fate |
|---------|------|
| Files + Inherited | **Documents** (one list, origin + role) |
| Evidence (saved chat answers) | Do not keep. Analysis reports and provenance already hold findings and citations. Pin a chat answer into analysis or a chapter if it matters. |
| Notes | Overview only (team handover). Not equal rank with Documents. |

The old `/workspaces/{id}` documents page may remain as a **file manager** (`?files=1`) reached from Documents → add files. It is not the programme home.

---

## 7. Done, frozen, published

Downloads are not a final state.

| State | Meaning |
|-------|---------|
| **Approved** | A colleague signed off inside Agora |
| **Frozen** | This version will not change; it is what was exported |
| **Published** | This frozen snapshot may be shared and quoted |
| **Official** | Gazette / legal enactment — **not Agora** |

**Published** is a reading-room snapshot (title, period, PDF, citation), default **permissioned** (authority members or time-limited link + code). Optional public listing if the authority chooses. Drafts, analysis, and Ask stay off that page.

Agora is not a public CMS or gazette (Brief §3, §11). Publish does not enact law.

---

## 8. Programmes quoting programmes

Programmes already share authority Documents (e.g. Vision 2050).

A programme may cite a **sister programme** only as that sister’s **Published** (frozen) snapshot, bound on Documents with role **existing policy** (or equivalent). Citations point at that version. Live drafts are not citable.

---

## 9. Look and feel

Monochrome, spacious, light. Title + subtitle on every stage. One primary action per screen. Info mark for extra explanation. Do not use an eye icon for “what is this” (eye means view).

---

## 10. Alignment with other docs

- Product Brief §5 — two-level tenancy; this file is the display IA.
- Guidance model — display names, landing, coach; research folder is not a create-path.
- Execution Plan — storage D1 unchanged; UI/IA work package H.1; publish H.2 / G.8.
- Domain dictionary — display column matches this file.
