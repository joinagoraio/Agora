# Grok-first runbook

**Status:** Active operating guide  
**Companions:** [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md), [`PRODUCT_BRIEF.md`](./PRODUCT_BRIEF.md)  
**Policy:** Grok 4.5 implements everything; Sonnet/Opus redo failed review slices only.

---

## Next work package

| Field | Value |
|-------|-------|
| **Active phase** | Execution Plan **v2** A–G implemented as usable slices |
| **Next WP** | Harden in the workbench: bind handbook template + two agents, run measures/analysis, compose export |
| **Do not start** | OCR / PoC intake / ops sign-off (out of plan scope) |
| **Last completed** | v2 Phases A–G (templates, agents, LLM gateway, analysis/QC jobs, authoring, locks, compose export) |
| **Spikes credited** | S1 compiler; S2a sections; S2b DOCX; S2c structured artefacts |
| **Workbench** | `/workspaces/[workspaceId]/programme` · Space settings → Compliance |
| **Plan** | [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md) v2 |
| **Conformance** | [`design/10-brief-conformance-audit.md`](./design/10-brief-conformance-audit.md) (foundations only; not v2 exit) |
| **E2E** | `E2E_BASE_URL` + `E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD` + `E2E_WORKSPACE_PATH` then `npm run test:e2e` |

---

## Delivery loop

1. Pick WP from [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md)  
2. Grok implements (code + tests + i18n if UI)  
3. `npm test` green  
4. Complete review checklist below  
5. Pass → next WP; Fail → Sonnet/Opus redo **slice only**  

---

## Review checklist (paste per WP)

- [ ] Execution Plan WP id + F-ids addressed  
- [ ] Usable exit met (not schema-only)  
- [ ] Tests green; new tests for new logic  
- [ ] No silent change to citation/safety core without explicit note  
- [ ] RLS: tenant isolation reasoning written if schema touched  
- [ ] i18n EN+NL if UI  
- [ ] Redo needed? none / Sonnet (why) / Opus (why)  

---

## Mandatory expensive review triggers

Even when Grok “feels fine”, require careful review (and Opus redo if wrong) for:

- New/changed RLS or tenant-scoped tables  
- Chat citation / RAG hot paths (`app/api/chat/route.ts`, `lib/rag/search.ts`, `lib/chat/resolve-citations.ts`)  
- Export classification / confidential redaction  
- Freezing core schemas: bindings, **agents**, **templates**, measures, `generation_runs`, versions  

---

## Already done (do not redo)

| Spike | Path | Maps to |
|-------|------|---------|
| S1 | `lib/chat/playbook-compiler.ts` | Plan v1 Phase 2 / v2 compiler (D5) |
| S2a | `lib/documents/section-extraction.ts` | Phase 1b foundation |
| S2b | `lib/export/markdown-to-docx.ts` | Phase 7 foundation |
| S2c | `lib/programme/structured-artefacts.ts` | Phases 4–5 foundation |

---

## Phase exit

Use [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md) §11 checklist before advancing phases.
