# Technical confidence update (post-spikes)

**Date:** 2026-07-31  
**Focus:** Technical feasibility only (no cost)  
**Spikes:** S1 (playbook compiler) + S2a/b/c (sections, DOCX, structured artefacts)

---

## Confidence board

| Area | Before | After | Evidence |
|------|--------|-------|----------|
| Playbook compiler / AI control seam | Medium | **High** | S1 shipped: `lib/chat/playbook-compiler.ts` wired to chat + draft; safety non-overridable |
| Section indexing (F2) | Medium | **Medium–high** | `extractSectionsFromPages` handles numbered/chapter/markdown/ALL CAPS + font-size; quote→section resolve tested. Residual: real scanned PDFs |
| DOCX export | Medium–high | **High** (pipeline) / **Medium–high** (Word polish) | Valid OOXML zip via JSZip; headings in `document.xml`. Residual: complex Word layout / templates |
| Measures registry contracts | Medium–high | **High** | Zod measure schema, citation requirement, deviation gate, approval helper |
| Analysis / QC pipeline shape | Medium | **Medium–high** | Analysis report schema + parse path + heuristic disposition. Residual: LLM quality on real corpora |
| Effects-report linkage fields | Medium | **High** (data model) | `effectsDirection`, `effectsDeviation`, justification required in parser |
| TipTap outline integration | Medium–high | Medium–high (unchanged) | Not spiked this round — still integration work, not a feasibility blocker |
| PDF OCR / scan quality | Medium | Medium (unchanged) | Fixture PDF in repo is a stub (41 bytes); needs real corpus |

---

## What was implemented

| Spike | Module | Tests |
|-------|--------|-------|
| S1 | `lib/chat/playbook-compiler.ts` | `tests/unit/playbook-compiler.test.ts` |
| S2a | `lib/documents/section-extraction.ts` | `tests/unit/section-extraction.test.ts` |
| S2b | `lib/export/markdown-to-docx.ts` | `tests/unit/docx-export.test.ts` |
| S2c | `lib/programme/structured-artefacts.ts` | `tests/unit/structured-artefacts.test.ts` |

**Suite:** 136/136 passing.

---

## Verdict

Technical feasibility of the Product Brief on Agora is **confirmed for the former medium items that were architecture/contract risks**. Remaining non-high items are mostly **corpus quality** (real PDFs) and **LLM output quality** (measures/analysis usefulness) — not “can we build the platform.”

### Recommended next confidence jumps (if desired)

1. Run section extraction on **3 real provincial PDFs** (vision / programme / effects report)  
2. Open generated DOCX in Word once and note layout gaps  
3. One live LLM call producing measure JSON validated by `parseMeasureCandidatesJson`  

---

## Document control

| Field | Value |
|-------|-------|
| Title | Technical confidence update |
| Language | English |
