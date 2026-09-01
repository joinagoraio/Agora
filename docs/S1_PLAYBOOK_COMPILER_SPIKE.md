# S1 — Playbook compiler spike (tight scope)

**Status:** In progress / spike  
**Parent:** [`CONFIDENCE_PLAN.md`](./CONFIDENCE_PLAN.md) spike S1  
**Goal:** Prove chat + draft can share a compiler where **code owns safety** and a **swappable playbook string** owns domain/style — without DB, UI, or behaviour change.

---

## In scope

1. Add `lib/chat/playbook-compiler.ts` that builds system prompts in fixed order:
   - identity + language (**code**)
   - playbook body (**swappable string**, default = today’s domain/style text)
   - runtime sections (**caller-provided**: context, notices, etc.)
   - safety / citation core (**code**, always last before optional run instructions)
   - optional run instructions
2. Wire **chat** (`app/api/chat/route.ts`) and **draft** (`generateWorkspaceDocumentDraft`) through the compiler.
3. Default playbooks preserve current wording as closely as practical (parity).
4. Unit tests: compile order, playbook override, safety always present, empty playbook still safe.
5. Existing `prompt-guard` tests remain green; full unit suite green.

## Out of scope (explicit)

- Playbook DB tables, versions, admin UI  
- Seed “environmental programme” playbook content  
- Changing citation format or RAG  
- `generation_runs` audit log  
- Privileged document bindings  
- Golden live LLM Q&A (manual optional later)  
- Sonnet escalation unless Composer path fails  

## Pass criteria

- [x] Chat and draft call `compileSystemPrompt` (or kind-specific wrappers)
- [x] Overriding playbook body changes middle section only; citation/safety block still appended from code
- [x] `npm test` green  
- [x] No new user-facing UI  

**Completed:** spike implementation in `lib/chat/playbook-compiler.ts`, wired in chat + draft.  

## Effort cap

Stop at compiler + wiring + tests. Do not expand into Phase 2 of the Execution Plan.
