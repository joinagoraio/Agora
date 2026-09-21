# Flevoland dry-run feedback

Collected during the live dry-run on 21 Sep 2026. Address after the session. Do not interrupt the walkthrough to fix these.

## Crashes

- **Full-page “Something went wrong” after Bind / Guidance / Analysis / Run analysis (21 Sep).** Reproduced: a thrown server action (LLM resolve, `revalidatePath`) becomes a Next.js “Server Components render” digest and the root error boundary replaces the document. Bindings persisted. Fix: never throw from bind/analysis; `force-dynamic` on the programme page; show the error text on the fallback.
  - **Shipped** in PR #14.

## Sheets / modals

- **Analysis (and other tool sheets) need a viewport overlay (21 Sep).** Without a backdrop it is unclear what is modal vs the document. Normal modal behaviour. We removed the overlay so the toolbar stayed clickable — restore a dimmed overlay *and* keep toolbar/next-bar usable.
  - **Fixed in this batch.** Dimmed overlay is back (`pointer-events-none`); toolbar and next-step bar stay above it.

## Setup wizard chrome

- **Type looks broken on the sources screen (21 Sep).** Words render with extra/stretched letters (e.g. “already”, “environmental”). Check the live webfont / ligatures after the session.
  - **Fixed in this batch.** Geist is applied on the root layout; wizard copy disables ligatures.

## Guidance / Help

- **Too complex (21 Sep).** The answer to “What is an environmental vision, existing policy, and effects report on this page?” was too long and too abstract (Bind Sources / Knowledge → Files / stage names). Prompt Help to give shorter, tailored answers for the screen the user is on — here: the three wizard dropdowns, what each file is for, which two are required.
  - **Fixed in this batch.** Setup questions resolve to a short glossary; Help uses the builtin prompt and names the three dropdowns.

## Ask / Guidance tabs

- **Conversations vanish on tab toggle (21 Sep).** Switching Guidance → Ask clears the Guidance thread. Switching Ask → Guidance clears the Ask thread. Both should survive the tab change.
  - **Fixed in this batch.** Both panes stay mounted and hide with CSS.
- **Close X does not close the side panel (21 Sep).** After Start writing, the X on the Ask/Guidance rail does not dismiss the panel.
  - **Fixed in this batch.** The sidebar header now has a close control that calls `onClose`.

## Agents / prompts (reviewed 21 Sep, before binding)

Safe to continue the dry-run. Not Flevoland-tuned. Fix after the session, do not rewrite prompts mid-run.

- **Draft identity says “municipal”.** Flevoland is a province. Change to provincial / bevoegd gezag.
  - **Fixed in this batch.** Draft identity writes as the bound bevoegd gezag and does not assume a municipality.
- **Standard outline instructions assume the real Omgevingsvisie Flevoland 2050 (H4.2, belangen 1–3, 14–16, 20–21).** The casus files only cover “housing near nodes” and interests 14 and 20. Drafting “Visie 4.2” will either refuse or invent. Prefer generating **Wonen en samenleving** or **Maatregelenprogramma**.
  - **Fixed in this batch for new programmes.** Seed instructions stay inside bound sources. Existing outlines are unchanged — start a new programme.
- **Help prompt still tells people to bind on Knowledge → Files**, not the wizard dropdowns on this screen.
  - **Fixed in this batch.**
- **QC and Chapter drafter expect a handbook and quality/style rules** we will not bind. Those runs will be thin; say that out loud (letter 6 / Handleiding later).
  - **Fixed in this batch.** QC reports a missing handbook instead of inventing one. Still no official Handleiding in this dry-run.
- **Output language follows the profile.** English UI → English findings and chapters. Switch the account to Dutch before analysis if the toets should look Dutch.
  - **No code change.** Say this at the restart of the dry-run.

## Found in the local dry-run (21 Sep, after the first batch)

- **Upload casus markdown fails with “Failed to create document record”.** The finalize insert wrote a `url` column that does not exist. The table column is `external_url`. **Fixed in this batch.**
- **Generate measures replaces the page with “Something went wrong”.** `resolveAgentVersionLlm` throws when the bound specialist’s catalog model is missing or disabled (local default agents point at disabled `gpt-4o-mini`). Analysis already caught this; measures did not. **Fixed in this batch:** measures/draft return `{ error }`; bound-model resolve falls back to the platform draft model so the page stays.

## Overlay follow-up (shipped)

- **Toolbar stayed clickable through the sheet.** After the first overlay fix, `modal={false}` plus a `pointer-events-none` backdrop still let hover/click reach the toolbar and chapter tooltips. **Shipped as a true modal** (PR #18): overlay dims and captures pointer; only the sheet is interactive; click-outside closes.

## Found in the full local dry-run (21 Sep, second pass)

Blocking bugs, fixed locally (not on live until shipped):

- **Start writing flashes “No chapters yet”.** Outline nodes load asynchronously. Show “Loading chapters…” until the request finishes.
- **QC: “The bound agent has no source documents”.** Latest QC version on Amsterdam has empty `source_roles`. No handbook is bound (by design). QC may now run with an empty set, and source resolve falls back to default QC roles so a bound vision is used.
- **Create stub / Chapter tools hidden or stuck disabled.** Tools only appeared after the pencil; clicking another chapter closed the editor; background `useTransition` (locks, comments, outline load, workbench `refresh`) set `pending` and disabled Create stub, Regenerate, and Export DOCX. Edit mode now shows Create stub; chapter click switches the editor; Start writing opens the first writable chapter; background loads no longer use `useTransition`.
- **Chapter generate refused: “sources not provided”.** `getAllWorkspaceKnowledge` selected `documents.url`, a column that does not exist, so the draft saw no casus files. Select is `external_url` only. After the fix, Wonen drafted from the casus with citations (groundedness 0.33).
- **Export / Publish sheet vanished immediately.** Auto-activating the first chapter deleted `?section=` from the URL, which closed the tool sheet. Activating a chapter no longer clears the section.
- **Standard outline still named official Visie 4.2 / 5.2 / 5.4 sources** in relation hints. Seed copy now stays on bound sources. Choosing Standard again syncs those fields on the existing Sterke Leefregio's template (match by title). A brand-new template is not required.

Opinions / non-blocking:

- **Analysis purpose copy starts with “Saved reports…”** Easy to read as a finished run. Empty state should not say “Saved”.
- **Ask / Guidance stay mounted and hide with CSS.** Hidden Help / Close / tabs remain in the accessibility tree off-screen. Prefer `inert` on the closed rail.
- **Publish toolbar control** is “Publish status: Not published”, not a button labelled exactly “Publish”. Icon-only toolbar is easy to miss.
- **Citations render as raw `[citation:{…}]` JSON** in the chapter body. Fine for a toets if we say so; ugly for reading.
- **Amsterdam is a stand-in space.** Do not treat it as Flevoland authority.
- **No official Handleiding.** QC and draft stay thin. Do not invent a handbook.
- **Output language follows the profile.** English UI → English findings. Say this at the joint restart.
- **Next bar can say Writing** after measures even when analysis never produced a real report.

## Colleague comments vs consultation (21 Sep, local)

- **Colleague notes had no reply and no common-note grouping.** Consultation already had reply + AI topics on the published snapshot. Draft comments are a different job: prepare the live text for consultation. **Fixed in this batch:** replies on `programme_comments`, lexical/AI themes on the live draft, Review + comment rail “Find common notes”, “Addressed in draft”. Consultation ledger unchanged.
- **Opinion:** the comment rail is tight once a thread + the prep card stack. A later pass could collapse addressed themes and keep only the active paragraph card expanded.
