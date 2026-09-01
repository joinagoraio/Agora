# Domain dictionary

Frozen vocabulary for environmental-programme work on Agora. Aligns with [`PRODUCT_BRIEF.md`](../PRODUCT_BRIEF.md) §6 and Execution Plan v2.

Display names (UI) vs storage names (code, URLs, tables). Canonical IA: [`../IA_NAVIGATION.md`](../IA_NAVIGATION.md).

| Display (EN / NL) | Storage |
|-------------------|---------|
| Authority / Bevoegd gezag (chrome: instance name) | `spaces`, routes `/spaces/...` |
| Programme / Programma | `workspaces.kind = environmental_programme`, home `/workspaces/{id}/programme` |
| Research (`kind = research`) | Legacy storage only; not a create-path or dashboard peer |
| Job (Administrator, Author, Reviewer) | `space_members.job`, `workspace_members.job` — chrome only, not RBAC |
| Access role (owner, admin, member, viewer) | `space_members.role`, `workspace_members.role` |
| Guided help / Expert | `profiles.guidance_mode` |
| Ask | workspace policy chat (`/api/chat`) |
| Help | product Help AI (`/api/help`), distinct from Ask |
| Documents | Authority shared files, or programme files with a **role** |
| Published | Frozen programme snapshot; not gazette enactment |

| Term | Meaning |
|------|---------|
| **Space** | Authority tenant |
| **Workspace** | Container; production unit when `kind = environmental_programme` |
| **Document role** | `environmental_vision` \| `environmental_effects_report` \| `programme_handbook` \| `existing_policy` \| `housing_programme` \| `quality_style_rules` \| `other` |
| **Programme bindings** | Privileged doc IDs + `templateId` + bound agent IDs (per stage) + `chapterDocuments` |
| **Template** | Space-owned reusable programme contract: outline tree, required/optional, per-node instructions and input fields, writing/quality rules, source–analysis–goal–measure relations, desired output form |
| **Outline node** | Template chapter/section (`parent_id` tree) with instructions and optional field specs |
| **Agent** | Space-owned versioned specialist: name, role/position, stage, instructions, source set, output contract, quality criteria, provider, model |
| **Agent version** | Immutable published revision; rollback publishes a new version |
| **Agent stage** | Compiler/workflow part: `analysis` \| `vision` \| `measures` \| `oer` \| `qc` \| `draft` \| `chat` |
| **Playbook** | Legacy instruction-pack storage only; not a user-facing product (Execution Plan D2) |
| **Measure** | Structured registry row: ambition \| goal \| measure \| implementation; includes `outline_node_id` |
| **Generation run** | Immutable audit of AI inputs/outputs/sources, including `agent_version_id` |
| **Analysis report** | Saved findings (adopt/adapt/drop/missing, conflicts, coverage, effects, quality); re-runnable, comparable |
| **Artefact version** | Snapshot of section/measure/document/agent for restore/compare |
| **Document section** | Extracted heading anchor (page + offset) for citations |

TypeScript source of truth: [`lib/programme/domain.ts`](../../lib/programme/domain.ts).
