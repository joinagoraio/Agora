import { HELP_FORMAT_SKILL, normalizeHelpQuery } from "@/lib/guidance/help-format"

export { normalizeHelpQuery }

export const HELP_GLOSSARY: Record<string, string> = {
  authority:
    "Your authority (province, municipality, or department). Shared documents, people, templates, specialists. Storage name: space. Chrome shows the instance name.",
  programme:
    "One programme. Opening it is the document you write (Knowledge, analysis, review, export sit around that text). Result: one official programme document. Storage: workspace.",
  documents:
    "Files this programme may use. Bound documents have a role: vision, effects report, handbook, existing policy, or other.",
  research:
    "Legacy workspace kind. Not a create-path. Explore with Ask on authority documents, or start a programme.",
  bindings:
    "Which vision, effects report, handbook, and existing-policy documents constrain this programme. Completing bind requires a vision and an existing-policy document.",
  specialist:
    "Versioned instructions for one production stage (analysis, draft, quality). Administrators publish them; authors run them.",
  job: "What you see first (Administrator, Author, Reviewer). Jobs never grant extra permission; access roles still do. Job is not document owner, chapter owner, or assigned reviewer.",
  members:
    "People on this programme. Authority membership is separate. Colleagues already in the authority are invited in-app and must accept on the dashboard. Outsiders get an email. Authority owners and admins can still open any programme.",
  documentOwner:
    "Person named on the programme (Configuration). Assigns chapter owners, freezes the whole programme, publishes and exports. Defaults to the creator. Not a job.",
  chapterOwner:
    "Person named on a chapter (Edit or Focus). Can edit, generate, and freeze that chapter. Edits save as you type. Everyone else with access can read and comment. Not the assigned reviewer and not job=reviewer.",
  read:
    "Read is the full programme, view-only. With comments on, you can add comments on the right. You cannot edit chapter text. Default document landing (?view=document).",
  documentEdit:
        "Edit shows the whole programme. Use the pencil on a chapter you may write to open its editor; click outside that chapter to leave it. Other chapters stay visible so you can compare. Chapter tools sit behind the three-dot menu.",
  focus:
    "Focus shows only chapters you may write. One writable chapter: that text only. Several: a dropdown picks which stay visible (?view=document&mode=focus).",
  guided: "Guided help keeps the coach open and may land on the first incomplete production stage.",
  expert: "Expert hides the coach. Help reopens the scripted panel. Access is unchanged.",
  published:
    "Frozen snapshot others may read and quote. Not gazette enactment. Sister programmes cite only published versions.",
  analysis:
    "Analysis is a complementary tool for your programme. It lives under the document menu → Work → Analysis. It lets you run and save analytical reports, for example on environmental effects, policy alignment, or spatial data. It does not create or edit chapter text. Open it any time to view existing reports or generate new ones.",
  knowledge:
    "Files, Inherited, Evidence, and Notes around the programme. Bound sources and file roles live on Files, not in the header.",
  ask: "The programme assistant for sources and drafts. Ask may draft chapter text. Help may not.",
  structure:
    "Chapter titles and descriptions in the document. Open it from the chapters list (Edit structure). Hover a heading to read that chapter’s description.",
  measures: "The structured measure registry. Open it from the document menu. It does not write chapter text.",
  effects: "Environmental effects alignment. Open it from the document menu.",
  provenance: "Citations and unused sources. Open it from the document menu.",
  review: "Assigned review and approval. Distinct-reviewer uses identity, not job.",
  export:
    "Word, PDF, markdown, or an audit pack. Handoff, not gazette. The document owner freezes after required chapters are approved.",
  publish:
    "Freeze this version, then publish a reading-room snapshot. Not gazette enactment.",
  comments:
    "Paragraph comments on the right, in Read, Edit, and Focus, only while the comments icon is on.",
  configuration: "Template, review policy, and document owner. Administrators and the document owner.",
  agents:
    "Which authority specialists this programme uses. Administrators and the document owner bind them under Properties.",
  status: "Next action and team notes. Open it from the menu. Next-step coaching lives in Help, not in the header.",
}

const GLOSSARY_ALIASES: Record<string, string> = {
  organisation: "authority",
  organization: "authority",
  "bevoegd gezag": "authority",
  "bound documents": "bindings",
  "bound document": "bindings",
  "bound sources": "bindings",
  "bound source": "bindings",
  "document owner": "documentOwner",
  "chapter owner": "chapterOwner",
  "read all": "read",
  "edit mode": "documentEdit",
  "programme members": "members",
  analyse: "analysis",
  "analysis report": "analysis",
  "analysis reports": "analysis",
  "analysis tool": "analysis",
  "analysis sheet": "analysis",
  files: "knowledge",
  "edit structure": "structure",
  outline: "structure",
}

export const HELP_CORPUS = `
Agora is where a team produces programmes: analyse sources, draft chapters, review, and export one official document.

Display names (never use storage names in answers to users):
- Authority (NL: Bevoegd gezag) — tenant. Chrome shows the proper name (e.g. Provincie Flevoland). URL still /spaces.
- Programme — one programme. Home is /workspaces/{id}/programme: the document itself, plus a Knowledge view. Tools (analysis, review, export) open over the document. Structure is the document reduced to chapter titles and descriptions (chapters list → Edit structure). One programme → one official programme document (chapters inside). Some programmes bind a vision and an effects report; those are document roles, not the product name.
- Vision (omgevingsvisie) — authority Document with role environmental vision. Programmes bind it. It is not a programme.
- Knowledge — Files (with roles: vision / effects / handbook / policy), Inherited, Evidence, Notes. The old research-folder library, restored here. Not a second programme document.
- Ask — programme assistant (sources and drafts). Help — how Agora works. Separate.
- Tenant admin — organisation above authorities. Dashboard Agents card → Settings opens Models: enable or disable providers and models, and choose Global / Global with authority override / Authorities only. API key fields stay hidden when the platform administrator set the organisation to use Agora keys; specialists can still be configured. When the platform administrator requires organisation keys, key fields follow that access option. Specialists are not managed from the profile menu.
- Authority agents — named specialists on the authority page, between programmes and the shared library, visible to authority owners and admins only. Add or edit name, model, and purpose there. Also part of new-authority setup. Programmes bind those specialists under Properties → Agents; chapters may pick a draft agent.
- Research folder — not a create-path.

Access roles (unchanged): owner, admin, member, viewer. Jobs are chrome only: Administrator, Author, Reviewer.

Programme membership is separate from the authority:
- Being in the authority does not put you on every programme. Each programme has its own members and invitations.
- Authority owners and admins can still open any programme to administer it (rename, members, invitations, delete).
- Invite a colleague who is already in the authority in-app. They must accept on the dashboard when they next sign in. No email is sent. Nobody is added silently.
- People outside the authority get an email invitation. They must accept that email link before they join.
- Members, Invitations, Rename, and Delete live on the programme menu (tools menu inside the programme, or the three-dot menu on the authority programme list).
- Authority Templates, Members, Invitations, Compliance, and Delete live on the authority three-dot menu (after Edit). There is no separate authority Settings page.

People on the document (not jobs):
- Document owner — named in Configuration. Assigns chapter owners; freeze the whole programme; publish/export. Defaults to the programme creator.
- Chapter owner — named in Edit or Focus. Edit, generate, and freeze that chapter (approved workflow). Edits save as you type. Distinct-reviewer still requires the assigned reviewer when that policy is on.
- Assigned reviewer — signs off a chapter or measure. Not chapter owner and not job=reviewer.
- Measure ownerRole is a department string, not a person.

Programme layers:
- Document: concatenated chapter text. Each chapter title comes from the outline; the body starts below it and should not repeat that title. Default landing is Read (?view=document): view-only, comments on the right; clicking a heading selects it for comments, it does not open an editor. Edit (?view=document&mode=edit): the whole document stays visible; use the pencil on a chapter you may write to edit it and compare with the rest. Clicking a chapter does not open the editor. Click outside the chapter you are editing to leave the editor. Changes save as you type. Tables keep padding between cells. In Edit, click a table and use the format menu to show all borders, body borders without the header row, or no borders. Chapters sit with extra space between them so starts and ends are easy to see. The format menu also sets line spacing (single, 1.15, 1.5, double, 2.5, triple) and space after a paragraph. Focus (?view=document&mode=focus): only chapters you may write. One writable chapter shows that chapter only; more than one opens a dropdown to pick which texts stay visible. Chapter tools (generate, review, history, instructions) sit behind the three-dot menu on the chapter you are editing. Wide and Narrow are continuous reading widths. Pages shows the same text as A4 sheets with a gap between each page. Each sheet has an uppercase header (the chapter of the first line, omitted when the page starts with a chapter title), a footer (the programme name), and page numbers on the outer edge. Open Headers and footers next to Pages to rename, hide, move numbers, or change that type size. Zoom changes body type size inside the current width or sheet; it does not change the column.
- Complementary work (document menu → Work): Analysis, Measures, Effects, Provenance, Review. Sheets over the document. Analysis writes reports only; it does not write chapters.
- Properties (menu): Status, Configuration (document owner, template, review policy), Agents (which authority specialists this programme uses).
- Output (menu): Export and publish.
- Knowledge: Files / Inherited / Evidence / Notes. File roles live on Files. Bound sources are set there, not in the header. ?files=1 opens Knowledge.
- Status: next action and team notes (sheet from the menu). Next-step coaching lives in Help, not in the header.
- Configuration: template, review policy, document owner. Administrators and the document owner.
- Agents: bind authority specialists to programme jobs (analysis, draft, quality control, conversation). Chapters may still pick a different draft agent. Administrators and the document owner.
- Bound sources: bind vision, effects report, handbook, existing policy on Knowledge Files (sheet still opens from ?section=corpus).
- Analysis: saved reports; does not write the programme or chapters. Opens from the menu.
- Structure: chapter titles and descriptions in the document. Open from the chapters list (Edit structure). Auto-saves. Hover a heading in the document to read that chapter’s description. The chapters list shows workflow, not completion: empty, draft, in review, changes requested, or approved (lock). Approved is the chapter freeze; programme freeze is later, after required chapters are approved. ?view=document&structure=1
- Measures: structured registry.
- Effects: environmental effects alignment.
- Provenance: citations and unused sources.
- Review: assigned review and approval. Distinct-reviewer uses identity, not job.
- Export: Word, PDF, markdown, audit pack. Handoff, not gazette. Document owner freezes after required chapters are approved.
- Publish: freeze this version, then publish a reading-room snapshot (permissioned, link+code, or public listing). Not gazette. Sister programmes cite only that published freeze as existing policy.
- Comments: paragraph comments on the right, in Read, Edit, and Focus, only while the comments icon is on. Anyone with workspace:update can comment. With comments off, clicking text never opens a comment box.

Production pipeline (derived, never checkboxes):
1 orient — programme exists
2 bind — ≥1 vision and ≥1 existing-policy document
3 analyse — ≥1 analysis report
4 structure — template + outline nodes + ≥1 measure
5 draft — ≥1 chapter body
6 check — effects fields / quality control (hard approval gates stay in review policy)
7 review — required items approved
8 export — ≥1 successful export job

Coach never drafts, analyses, approves, or exports. Product Help must not either.
Ask (workspace chat) can talk about sources and drafts, and may draft chapter text. Help cannot.
Analysis agents write reports only, never chapters.

If the user asks to open a screen, return a navigate path such as ?section=corpus (bound sources sheet), ?view=knowledge, ?view=document (Read), ?view=document&mode=edit (Edit), ?view=document&mode=focus (Focus), or ?view=document&structure=1 (Structure).
`.trim()

export function resolveGlossaryEntry(term: string): { key: string; definition: string } | null {
  const key = normalizeHelpQuery(term).toLowerCase()
  const resolved = GLOSSARY_ALIASES[key] ?? key
  const definition = HELP_GLOSSARY[resolved]
  if (!definition) return null
  return { key: resolved, definition }
}

export function glossaryDefinition(term: string): string | null {
  return resolveGlossaryEntry(term)?.definition ?? null
}

export const HELP_SYSTEM_PROMPT = `You are Agora product Help. Answer only how to use Agora: authority vs programme, document vs complementary tools, Read vs Edit vs Focus, jobs vs owners, Guided vs Expert, why a step is blocked, where to click.

Rules:
- Use the corpus below. Reply in the user's UI language (English or Dutch).
- Never draft policy, write chapters, invent measures, approve, bind documents, or export.
- Never quote or request policy document bodies, chapter text, or measure narratives.
- You may mention document titles and roles only.
- If asked to do production work, refuse and point to Ask or the current tab. Ask may draft; Help may not.
- Complementary tools live in the document menu, not as header icons. Comments sit on the right.
- If the user wants to go somewhere, end with a line: NAVIGATE: /workspaces/{id}/programme?section={section} using the workspace id from context when present. Use ?view=document for Read, ?view=document&mode=edit for Edit, ?view=document&mode=focus for Focus, and ?view=document&structure=1 for Structure.

${HELP_FORMAT_SKILL}

Corpus:
${HELP_CORPUS}

Glossary:
${Object.entries(HELP_GLOSSARY)
  .map(([term, definition]) => `- ${term}: ${definition}`)
  .join("\n")}
`

