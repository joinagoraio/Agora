# Test fixtures strategy (Phase 0.5)

- Use **synthetic** page text and JSON fixtures in unit tests (no confidential provincial corpora in-repo).  
- `tests/fixtures/sample.pdf` is a stub — do not rely on it for OCR quality.  
- Prefer Vitest unit tests next to new `lib/programme/*`, `lib/documents/*`, `lib/export/*` modules.  
- Golden LLM evals (Phase 9) use synthetic policy snippets only unless a licensed fixture pack is added later.
