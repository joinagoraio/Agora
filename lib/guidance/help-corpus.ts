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
  documentOwner:
    "Person named on the programme (Configuration). Assigns chapter owners, freezes the whole programme, publishes and exports. Defaults to the creator. Not a job.",
  chapterOwner:
    "Person named on a chapter (Focus). Can save, generate, and freeze that chapter. Everyone else with access can read and comment. Not the assigned reviewer and not job=reviewer.",
  focus:
    "Focus is write mode for one chapter (?view=document&chapter=). Read all is the concatenated document with comments on the right and no save toolbar under every heading.",
  guided: "Guided help keeps the coach open and may land on the first incomplete production stage.",
  expert: "Expert hides the coach. Help reopens the scripted panel. Access is unchanged.",
  published:
    "Frozen snapshot others may read and quote. Not gazette enactment. Sister programmes cite only published versions.",
}

const GLOSSARY_ALIASES: Record<string, string> = {
  organisation: "authority",
  organization: "authority",
  "bevoegd gezag": "authority",
  "bound documents": "bindings",
  "bound document": "bindings",
  "document owner": "documentOwner",
  "chapter owner": "chapterOwner",
  "read all": "focus",
}

export const HELP_CORPUS = `
Agora is where a team produces programmes: analyse sources, draft chapters, review, and export one official document.

Display names (never use storage names in answers to users):
- Authority (NL: Bevoegd gezag) — tenant. Chrome shows the proper name (e.g. Provincie Flevoland). URL still /spaces.
- Programme — one programme. Home is /workspaces/{id}/programme: the document itself, plus a Knowledge view. Tools (structure, analysis, review, export) open over the document. One programme → one official programme document (chapters inside). Some programmes bind a vision and an effects report; those are document roles, not the product name.
- Vision (omgevingsvisie) — authority Document with role environmental vision. Programmes bind it. It is not a programme.
- Knowledge — Files (with roles: vision / effects / handbook / policy), Inherited, Evidence, Notes. The old research-folder library, restored here. Not a second programme document.
- Ask — programme assistant (sources and drafts). Help — how Agora works. Separate.
- Research folder — not a create-path.

Access roles (unchanged): owner, admin, member, viewer. Jobs are chrome only: Administrator, Author, Reviewer.

People on the document (not jobs):
- Document owner — named in Configuration. Assigns chapter owners; freeze the whole programme; publish/export. Defaults to the programme creator.
- Chapter owner — named in Focus. Save, generate, and freeze that chapter (approved workflow). Distinct-reviewer still requires the assigned reviewer when that policy is on.
- Assigned reviewer — signs off a chapter or measure. Not chapter owner and not job=reviewer.
- Measure ownerRole is a department string, not a person.

Programme layers:
- Document: concatenated chapter text. Default landing is Read all (?view=document): comments in the right rail; clicking a heading selects it; it does not grow a toolbar. Focus (?view=document&chapter=<outlineNodeId>): save / generate / freeze for that chapter if you own it; other chapters stay in the scroll, dimmed. Edit on a heading (or Sections → chapter) enters Focus.
- Complementary work (document menu → Work): Analysis, Measures, Effects, Provenance, Review. Sheets over the document. Analysis writes reports only; it does not write chapters.
- Skeleton (menu): Structure — outline from the bound template. Sections on the page is a jump list, not Structure.
- Properties (menu): Status, Configuration (document owner, specialists, template, review policy).
- Output (menu): Export and publish.
- Knowledge: Files / Inherited / Evidence / Notes. File roles live on Files. Bound sources are set there, not in the header. ?files=1 opens Knowledge.
- Status: next action and team notes (sheet from the menu). Next-step coaching lives in Help, not in the header.
- Configuration: template, specialists, review policy, document owner. Administrators and the document owner.
- Bound sources: bind vision, effects report, handbook, existing policy on Knowledge Files (sheet still opens from ?section=corpus).
- Analysis: saved reports; does not write the programme or chapters. Opens from the menu.
- Structure: outline from the bound template. Opens from the menu.
- Measures: structured registry.
- Effects: environmental effects alignment.
- Provenance: citations and unused sources.
- Review: assigned review and approval. Distinct-reviewer uses identity, not job.
- Export: Word, PDF, markdown, audit pack. Handoff, not gazette. Document owner freezes after required chapters are approved.
- Publish: freeze this version, then publish a reading-room snapshot (permissioned, link+code, or public listing). Not gazette. Sister programmes cite only that published freeze as existing policy.
- Comments: paragraph comments on the right, on Read all and Focus. Anyone with workspace:update can comment.

Production pipeline (derived, never checkboxes):
1 orient — programme exists
2 bind — ≥1 vision and ≥1 existing-policy document
3 analyse — ≥1 analysis report
4 structure — template + outline nodes + ≥1 measure
5 draft — ≥1 chapter body
6 check — effects fields / QC (hard approval gates stay in review policy)
7 review — required items approved
8 export — ≥1 successful export job

Coach never drafts, analyses, approves, or exports. Product Help must not either.
Ask (workspace chat) can talk about sources and drafts, and may draft chapter text. Help cannot.
Analysis agents write reports only, never chapters.

If the user asks to open a screen, return a navigate path such as ?section=corpus (bound sources sheet), ?view=knowledge, or ?view=document&chapter=<outlineNodeId> (Focus).
`.trim()

export function glossaryDefinition(term: string): string | null {
  const key = term.trim().toLowerCase().replace(/[?.!]+$/g, "")
  const resolved = GLOSSARY_ALIASES[key] ?? key
  return HELP_GLOSSARY[resolved] ?? null
}

export const HELP_SYSTEM_PROMPT = `You are Agora product Help. Answer only how to use Agora: authority vs programme, document vs complementary tools, Read all vs Focus, jobs vs owners, Guided vs Expert, why a step is blocked, where to click.

Rules:
- Use the corpus below. Reply in the user's UI language (English or Dutch).
- Never draft policy, write chapters, invent measures, approve, bind documents, or export.
- Never quote or request policy document bodies, chapter text, or measure narratives.
- You may mention document titles and roles only.
- If asked to do production work, refuse and point to Ask or the current tab. Ask may draft; Help may not.
- Complementary tools live in the document menu, not as header icons. Comments sit on the right.
- If the user wants to go somewhere, end with a line: NAVIGATE: /workspaces/{id}/programme?section={section} using the workspace id from context when present. Use ?view=document&chapter= for Focus.

Corpus:
${HELP_CORPUS}

Glossary:
${Object.entries(HELP_GLOSSARY)
  .map(([term, definition]) => `- ${term}: ${definition}`)
  .join("\n")}
`

