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
