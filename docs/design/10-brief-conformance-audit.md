# Brief conformance audit (Phase 10.5)

**Date:** 2026-07-31  
**Implementer:** Grok 4.5 (Grok-first plan)  
**Method:** Map Product Brief F1–F36 to shipped foundations + local E2E evidence

| F-ids | Status | Evidence |
|-------|--------|----------|
| F1–F5 | Foundation | Document roles `036`, bindings, privileged context; section extraction + `rebuildDocumentSections` on ingest (NL titles, false-positive filters) |
| F32–F33 | Foundation | Playbooks `037` + `047` config; seed pack; compiler loads playbook body + model tiers on chat/draft/measures |
| F18–F23 | Foundation | `generation_runs` `038`, unused sources, citations on measures; groundedness payload on draft runs |
| F11–F17, F19 | Foundation | Templates/measures `039`, approval gate, structured artefacts, effects panel |
| F6–F10, F8 | Foundation | Analysis reports + heuristic analysis + effects fields; policy graph tables `040` |
| F24–F26 | Foundation | Artefact versions + section locks `041` |
| F27 | Foundation | Export jobs `042` + DOCX/markdown/print-HTML PDF + audit package + tenant exit export |
| F29 | Foundation | Space Compliance settings (retention, legal hold, residency, no-train); delete gates; prune |
| F30–F31, F36 | Foundation | Programme workbench IA (`?section=`), guided setup, programme-only nav, EN/NL |
| F34–F35 | Foundation | Groundedness assessor; golden evals `tests/evals`; observability metrics; Playwright programme journey (local) |

## Residual gaps (honest)

- Stakeholder Word templates / Chromium-based PDF rendering (print-HTML PDF is shipped)  
- OCR/scanned PDF corpora validation for section extraction  
- Full WCAG audit beyond workbench landmarks / labelled tabs  
- Ops contractual sign-off on residency/no-train beyond product defaults  
- Formal security-review pass on RLS `035–042` **completed** (2026-07-31); harden `043`+ shipped locally  

## E2E evidence (local)

Chromium Playwright against local Supabase + Next (`tests/e2e/critical-flows.spec.ts`): login, programme entry, section deep links (setup→analysis→measures→review→export), health/API checks — **passed** 2026-07-31.

## Verdict

Grok-first delivery covers the Brief critical path as **product foundations**: programme workbench, playbooks, measures, analysis, provenance, export, compliance, evals, and local E2E. Remaining work is deepening quality (OCR corpora, stakeholder templates, full a11y/perf campaigns) and ops sign-off — not greenfield architecture.
