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
  job: "What you see first (Administrator, Author, Reviewer). Jobs never grant extra permission; access roles still do.",
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

Programme chrome:
- Document (home): concatenated chapter text. Default landing. Read the whole document; chapter save/generate tools are not in the header.
- Knowledge: Files / Inherited / Evidence / Notes. File roles live on Files. Bound sources are set there, not in the header. ?files=1 opens Knowledge.
- Menu: one document menu over the text. Work (analysis, measures, effects, provenance, review), Skeleton (structure), Properties (status, configuration), Output (export/publish).
- Status: next action and team notes (sheet from the menu). Next-step coaching lives in Help, not in the header.
- Configuration: template, specialists, review policy. Administrators; authors via Properties in the menu.
- Bound sources: bind vision, effects report, handbook, existing policy on Knowledge Files (sheet still opens from ?section=corpus).
- Analysis: saved reports; does not write the programme. Opens from the menu.
- Structure: outline from the bound template. Opens from the menu. Sections in the document is a jump list, not Structure.
- Measures: structured registry.
- Effects: environmental effects alignment.
- Provenance: citations and unused sources.
- Review: assigned review and approval. Distinct-reviewer uses identity, not job.
- Export: Word, PDF, markdown, audit pack. Handoff, not gazette.
- Publish: freeze this version, then publish a reading-room snapshot (permissioned, link+code, or public listing). Not gazette. Sister programmes cite only that published freeze as existing policy.

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
Ask (workspace chat) can talk about sources and drafts. Help cannot.

If the user asks to open a screen, return a navigate path such as ?section=corpus (bound sources sheet) or ?view=knowledge.
`.trim()

export function glossaryDefinition(term: string): string | null {
  const key = term.trim().toLowerCase().replace(/[?.!]+$/g, "")
  const resolved = GLOSSARY_ALIASES[key] ?? key
  return HELP_GLOSSARY[resolved] ?? null
}

export const HELP_SYSTEM_PROMPT = `You are Agora product Help. Answer only how to use Agora: authority vs programme, tabs, jobs, Guided vs Expert, why a step is blocked, where to click.

Rules:
- Use the corpus below. Reply in the user's UI language (English or Dutch).
- Never draft policy, write chapters, invent measures, approve, bind documents, or export.
- Never quote or request policy document bodies, chapter text, or measure narratives.
- You may mention document titles and roles only.
- If asked to do production work, refuse and point to Ask or the current tab.
- If the user wants to go somewhere, end with a line: NAVIGATE: /workspaces/{id}/programme?section={section} using the workspace id from context when present.

Corpus:
${HELP_CORPUS}

Glossary:
${Object.entries(HELP_GLOSSARY)
  .map(([term, definition]) => `- ${term}: ${definition}`)
  .join("\n")}
`

