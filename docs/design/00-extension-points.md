# Extension-point map

Indicative paths. Execution Plan v2 owns sequencing; update this table when a phase lands.

| Concern | Primary paths |
|---------|----------------|
| Prompt assembly (all stages) | `lib/chat/playbook-compiler.ts` |
| Chat | `app/api/chat/route.ts` |
| Draft / chapter generation | `lib/actions/document.ts` (`generateWorkspaceDocumentDraft`) |
| Workspace / privileged context | `lib/chat/context.ts` |
| RAG / knowledge | `lib/rag/search.ts` |
| Citations | `lib/chat/resolve-citations.ts`, `lib/utils/citation-parser.ts` |
| Document ingest | `lib/actions/document.ts`, `lib/utils/pdf-extraction.ts` |
| Section extraction | `lib/documents/section-extraction.ts` |
| Templates / outline | `lib/actions/template.ts`, `lib/actions/outline.ts`, `lib/programme/handbook-seed.ts` |
| Agents | `lib/actions/agent.ts`, `lib/programme/source-set.ts` |
| LLM gateway | `lib/llm/complete.ts` (OpenAI-compatible + Anthropic) |
| Measures / analysis artefacts | `lib/actions/measures.ts`, `lib/actions/analysis.ts`, `lib/actions/pipelines.ts` |
| Versions / locks / comments | `lib/actions/collaboration.ts`, `lib/actions/comments.ts` |
| Export compose | `lib/export/compose-programme.ts`, `lib/actions/export.ts` |
| Workspace CRUD | `lib/actions/workspace.ts` |
| Migrations | `scripts/035_*.sql` onward (`048+` for plan v2) |
| i18n | `lib/i18n/messages/en.ts`, `lib/i18n/messages/nl.ts` |
