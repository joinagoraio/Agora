# Prompt: build the "Guided tour" (beta) with narration, Autopilot, live questions and an end-of-demo summary

You are building a **guided tour** into an existing web product. It walks an audience through the product in an agreed order. It tells the presenter what to do, why it matters and what is happening, and it can play a recorded voice-over in a choice of voices. It can also present the whole demo by itself (**Autopilot**): it navigates, presses buttons, types, waits for AI steps and moves on. The presenter can pause at any moment, work by hand, and continue; the tour knows from the product's own data what has already been done. The audience can ask spoken questions of a live AI voice, and at the end the tour summarises what the room asked into improvement points.

The tour is a **beta, internal feature for demos**: visible only to platform admins, only inside a loaded demo (see the separate "Demo mode" prompt). Build it so that it could later become an onboarding aid for normal users, but do not expose it to them now.

Replace these placeholders throughout:

- `{{PRODUCT}}`: the product name.
- `{{TENANT}}`: the organisation.
- `{{WORK_ITEM}}`: the main object the tour runs in (the reference product used an environmental "programme" workbench with a document, a toolbar, tool sections that open as a large overlay panel, and an assistant side panel).
- `{{PLATFORM_ADMIN}}`: the platform super admin.

The reference implementation used Next.js (App Router, server actions, `after()`), Supabase (Postgres, RLS, Storage), Tailwind CSS v4, Radix/shadcn, and OpenAI (`gpt-4o-mini-tts` for narration and read-aloud, `gpt-realtime` over WebRTC for live questions, `gpt-4o-mini-transcribe` for dictation and question transcripts). Keep the behaviour; adapt the mechanics to the target stack.

**Do not invent tour content.** Build the engine, the UI and the data model. Author the steps (texts, targets and Autopilot actions) together with the product owner, as data.

---

## 1. Prerequisites in the product

Build these first, or confirm they already exist.

### 1.1 Long AI steps run as background jobs
Every AI action that can take more than a few seconds must survive navigation and reload:
- A server action records a job row (`kind`, `status` running/done/failed/cancelled, `progress` JSON with done/total/current/target id/result, `error`, `started_at`, `updated_at`, `completed_at`) and runs the work after the response (`after()` or a queue), updating progress as it goes.
- If a job of that kind is already running for this work item, the action returns it instead of starting another.
- A client jobs provider around the work-item page polls a `listJobs(workItemId)` action every 2.5 s while any job is running, or for 15 s after a job was started (`watch()`). It exposes the latest job per kind and a hook `useBackgroundJob(kind, onFinished)` that fires once on the running → done transition.
- A job with no update for 20 minutes counts as stale (for example after a server restart).

The tour's panel shows live progress from these jobs, and Autopilot waits on them.

### 1.2 Stable targets on every control the tour uses
Every button, tab, input, row or container the tour highlights or operates carries:
- `data-guidance-target="<stable-id>"`: kebab-case, never a translated label. Several elements may share an id; the tour uses the first **visible** one, and for presses the first **enabled** visible one.
- Optionally `data-guidance-state="<space-separated tokens>"` describing its state, so Autopilot can pick the right one. Examples:
  - a list row: `undecided unprioritised`
  - a per-item action: `todo` or `done`
  - a toggle: `on` or `off`
  - a collapsible section: `open` or `closed`
  - a finding card: `<kind> <decision|undecided>`

Keep these attributes stable; they are part of the tour's contract. Radix-style components that open on `pointerdown` (select triggers, dropdown triggers) must still get the attribute on the trigger element.

### 1.3 A "facts" endpoint
A server action `getTourFacts(workItemId)` returns a flat map of counts describing what exists in the work item: for example setup complete (0/1), reports, items found, items chosen, work-ups, items with enough generated children, decisions, drops, priorities, checks, comparison findings and decided findings, records, sections, sections written, reviews requested, approved, all approved (0/1), redrafts, frozen versions, publications, and summaries. For the collaboration and consultation parts (§1.4) it also counts:
- **Team and assistant:** work item members; assistant answers; questions from the room (typed in the assistant or spoken with Questions), **excluding the question Autopilot asks itself** (§10).
- **Colleague notes:** notes (top-level comments), replies, themes, and themes answered.
- **Consultation:** consultations, consultations closed, responses, topics, topics decided (a decision applied), personal replies, published topic summaries, appeals, and appeals reviewed.
- **Exports:** Word files made, and PDFs made **by the server**. Count a PDF only when the export produced a real PDF file, not the print-page fallback (store the produced MIME type on the export job so the fact can tell them apart).

Rules:
- Only counts, cheap queries, no AI.
- For platform admins it also returns the tenant's AI cost (see the demo mode prompt).
- Where one generation can "cover" several groups at once, count a group as covered only when it has enough items of its own (for example at least 3). Otherwise one broad generation marks everything as done.

### 1.4 Product features the tour demonstrates
The tour shows the whole product, from the dashboard to the end of consultation. Build or confirm these first; each needs stable targets (§1.2) and a fact (§1.3).
- **Colleague notes on the draft:** notes anchored to a paragraph, with replies, shown beside the paragraph when there is room and in a panel when there is not.
- **Group notes by meaning:** an AI call groups open notes that make the same point, even in different words or on different paragraphs, and returns per group a heading, a short summary and a draft answer. Fall back to a keyword grouping when the AI is unavailable. Notes that are already handled keep their theme.
- **Answer a theme once:** one action posts the same reply under every note in the theme and marks the theme and its notes handled.
- **Server-side exports:** Word, and a real PDF rendered by a headless browser on the server. Install that browser in the production image, pinned to the exact version the app's browser library expects (add a unit test that the two versions match). Without it the PDF falls back to a print page in a new window, which Autopilot must never open in front of a room.
- **Publish a fixed version**, then **open a consultation** on it.
- **The public page:** while the consultation is open, a click on a passage (or Enter on a focused passage; passages are keyboard-reachable) puts it in the response form as the quote. After a decision, the respondent sees the decision and the reasoning under their own response, can reply, and can appeal. The published topic summary appears above the form.
- **Group responses by topic:** an AI call puts responses about the same concern in one topic and proposes per topic an answer and a decision (accepted, accepted with changes, rejected, merged, out of scope). Prefer fewer, broader topics. After the AI call, **join topics whose responses quote the same passage**; the AI sometimes splits what plainly belongs together.
- **Decide per topic:** take over the proposal or edit it, write a reason, and apply it to every response in the topic in one action. Each response keeps its own history (who, when, why).
- **Personal replies** to single responses.
- **Public topic summary:** an AI draft per topic (number of responses, decision, reason) in the tenant's writing language; staff edit and publish it.
- **Appeals:** the respondent asks for a new assessment; staff uphold or reopen with a reason; then close the consultation.

---

## 2. Tour data model (stored as JSON on the demo pack)

```ts
type TourLanguage = "nl" | "en" // every language the UI supports
type TourVoice = "female" | "male"

type TourText = {
  title: string      // short heading for the strip and panel
  action: string     // what the presenter does on screen
  why: string        // the talking point
  happening?: string // what the AI is doing, for steps that start a job
  expect: string     // what the room should see when the step is done
  narration: string  // what the voice says (15 to 50 seconds of speech)
}

type TourStep = {
  id: string // stable, kebab-case
  block: string
  place: {
    view: "document" | "knowledge"
    section?: WorkbenchSection
    mode?: "read" | "edit"
    page?: "programme" | "authority" | "platform" | "dashboard" | "published" // default is the work item page
  }
  target?: string // data-guidance-target to highlight on arrival
  click?: string // data-guidance-target to press on arrival (tabs, sub-views, openers)
  waitForJob?: JobKind // the panel shows this job's live progress
  estMinutes: number
  text: Record<TourLanguage, TourText>
  auto?: TourAction[] // what Autopilot does here, in order
  doneWhen?: TourCondition[] // the step counts as done when all hold
  option?: "aiSetup" // belongs to an optional part the pack can switch on
  panel?: "digest" // extra content the panel shows on this step
}

type TourBlock = { id: string; title: Record<TourLanguage, string>; minutes: number }

type DemoTour = {
  version: number
  blocks: TourBlock[]
  steps: TourStep[]
  options?: Partial<Record<TourOption, boolean>>
  defaultVoice?: TourVoice
}

type TourCondition = { fact: string; min?: number /* default 1 */; atLeastFact?: string }

type ActionGuards = { unless?: TourCondition; onlyIf?: TourCondition; optional?: boolean }

type TourAction = ActionGuards & (
  | {
      do: "click"
      target: string
      state?: string
      contains?: string // prefer a match whose text contains this (for example a passage on a topic); fall back to any match
      pick?: "last"     // press the last match instead of the first (for example the newest answer)
    }
  | { do: "type"; target: string; text: Record<TourLanguage, string> }
  | { do: "wait"; ms: number }
  | { do: "waitJob"; kind: JobKind }
  | { do: "waitFor"; condition: TourCondition; timeoutMs?: number }
  | { do: "waitForTarget"; target: string; state?: string; timeoutMs?: number } // wait until an element shows, such as an answer finishing
  | { do: "waitNarration" }
  | { do: "key"; key: string }                        // for example Escape to close a dialog
  | { do: "scrollTo"; text?: string; target?: string } // scroll to the element with this target, or the first h1/h2/h3 containing the text
  | { do: "pause" }                                   // Autopilot pauses itself (the break)
  | { do: "group"; actions: TourAction[] }
)
```

**Parsing** (`parseDemoTour(raw, { allOptions })`):
- Drop incomplete steps and unknown actions or job kinds.
- Normalise options to booleans; default voice is `female`.
- Unless `allOptions` is set, drop steps whose option is off, and drop blocks that end up empty. Narration recording uses `allOptions: true`, so switching an option on needs no new recording.

**Helpers:**
- `conditionHolds(condition, facts)`: the fact is at least `min`, and at least the value of `atLeastFact` when given.
- `stepDone(step, facts)`.
- `tourStartMinutes(tour)`: the cumulative planned clock per step.
- `tourStepHref(step, ids)`: builds the link for any page; outside the work item it adds `?tourProgramme=<workItemId>` so the next page knows the tour led there. The public page's address depends on the current publication, so `published` links to a small redirect route under the work item (`/<work-item>/published?tourProgramme=…`) that forwards to the current publication's public page, keeping the parameter.
- `tourStepQuery(step)`: the work item's own query string (view, section, mode and so on).
- `onTourStepPage(step, pathname, ids)`: whether the browser is already on the step's page. For `published`, any public publication page counts, because its address is only known after the redirect.
- `atTourStepPlace(step, search)`: whether the address already shows the step's place. Compare only the parameters the tour sets (view, section, structure, and the mode when the step sets one). The work item adds its own parameters (open chapter, focus and so on), and they must not count as a mismatch.

The pack's code defines its tour and bumps `version` on every change (see the demo mode prompt for seeding and preserving options).

---

## 3. Where the tour appears

- **Gating:** on the work item page, if the tenant is a loaded demo, the viewer is a platform admin, the pack has a tour, **and the tour is switched on for this demo** (the demo's `demoTour` flag; see the demo mode prompt). Everywhere else nothing renders and no generic guidance shows (retire or hide any older guidance UI so the two never compete). With the tour off, the demo stays fully usable by hand, including its demo shortcuts.
- **The work item page** wraps its content in the jobs provider → the **tour provider** → the assistant/chat wrapper. The sidebar opens by default on the **Tour** tab.
- **Other pages** (the dashboard, the tenant page, the platform AI settings page, and the public publication page) mount the same provider only when the URL carries `tourProgramme=<the demo's work item id>`. Visiting those pages normally shows no tour. A small server component `DemoTourMount` does this check, loads the narration URLs, and renders the provider with a floating bar (§6) around the page.

---

## 4. The tour strip (work item page)

A slim bar directly under the product's toolbar, above the content: light sky-blue background, dark text, about 40 px high, with a 2 px progress line along its bottom edge (sky-500 on sky-100, width = step / total).

Left to right:
1. **Label:** a bordered uppercase badge "Tour · beta".
2. **Location (truncates):** "`<part title>` · **`<step title>`** · Step n of N". Add a green tick when the step is done (per facts) and "⟳ Working" while this step's job runs.
3. **Autopilot:** **Autopilot** (robot icon) when off or paused; the label becomes **Continue** when paused. **Pause autopilot** while running.
4. **Questions:** the live question control (§11).
5. **Narration:** play/pause for this step's narration, shown only when a recording exists.
6. **Voice:** "Voice: Female" / "Voice: Male". One click switches, and the tooltip names the other voice.
7. **Voice presents:** speaker icon, pressed when narration plays automatically on every Next.
8. **Back** and **Next** (primary).
9. **Close** (X): closes the tour for now. The demo strip then shows a **Guided tour** button to reopen it. (Switching the tour off for the whole demo is the demo strip's switch, not this button.)

While Autopilot runs, the strip keeps the assistant sidebar open on the Tour tab: **only when the step changes** it calls the sidebar's open and select-tab functions. Keep the sidebar context in a ref and depend only on the running state and the step index: the sidebar's setters change on every render, and a step such as the assistant question switches to another tab itself, which a re-render must not undo.

---

## 5. The Tour panel (sidebar tab "Tour")

The panel replaces the generic guidance in the assistant sidebar. The sidebar config gets optional `panel` (a React node) and `tabLabel`.

From top to bottom:
- **Header:**
  - a small sky "Tour · beta" label;
  - the step title, with a green tick when done;
  - one grey meta line: "`<part>` · Step n of N · about X min · at H:MM", where H:MM is the planned clock.
- **Autopilot row:** the Autopilot, Continue and Pause buttons, plus a square **Stop** when paused. While running: "⟳ Agora is presenting this step."
- **Autopilot note** (amber box, when set):
  - "Autopilot could not find the next button. Do this step by hand, then press Continue."
  - "`<error>` Do this step by hand, then press Continue."
  - "Paused for the break. Press Continue when you are ready."
  - "The tour is finished."

  Store the note as an i18n **key** and translate it when shown, so it follows a language change mid-run.
- **Cards** (bordered, small uppercase label):
  - **What to do:** the action text, plus a **Show me where** link that re-navigates and re-highlights.
  - **Why.**
  - **What is happening:** the happening text plus a live job line: "⟳ Working: 2 of 8 done", "Done. The result is on screen", "This run stopped with an error. Try once more, or move on", or "Not started yet". The card turns light sky-blue while the job runs.
  - **What the room sees.**
- **Narration controls:** play/pause with a label, and "Let the voice present" as a toggle.
- **Voice choice:** always visible, not only when a recording exists. "Voice" followed by segmented Female / Male buttons.
- **Step panel extras:** for example the summary block (§12) on `panel: "digest"`.
- **"In this part":** the steps of the current part, as "n. Title", with the current one highlighted and a tick on done ones. Clicking one goes there.
- **Footer text:** "n of N steps with a result are done" (counting steps that have `doneWhen`) and "AI cost of this demo so far: about US$ X.XX".
- **Sticky footer:** Back and Next.

---

## 6. The floating tour (pages outside the work item)

- A fixed bar at the very top of the viewport (z above page content), with the same content as the strip (§4), plus a spacer so the page isn't covered.
- A fixed card at the bottom right, 384 px wide, with a shadow: the "Tour · beta" label, the step title, the action text, the why text in grey, the voice choice, and the Autopilot note.
- When the tour is closed, a small floating **Guided tour** button at the bottom right reopens it.

---

## 7. Navigation, highlighting and tool panels

- **Going to a step** builds its link:
  - same page (`onTourStepPage`): replace the URL with the step's query, without scrolling;
  - another page: do a **full page load** (`window.location.assign`) and return `true` ("another page takes over"). A full load means a refresh still in flight on the previous page (for example right after submitting a form) cannot carry over into the next page.
- **Address check after arriving:** a refresh still in flight from the previous step can put the old address back. After the settle wait, if `atTourStepPlace` is false, navigate again, up to three times, 1.5 s apart. If the address still shows the previous screen, save `{ index, autopilot: "running" }` and load the step's address with a full page load, **once per step** (remember the step in `sessionStorage`), so the new page resumes on the right screen. On a slow production server the soft retries were not enough: right after a long AI job, the screen kept falling back to the previous section.
- **On arrival:**
  - if the step has `click`, wait up to 8 s for the target and press it;
  - if it has `target`, wait up to 8 s (600 ms after a click) and mark the element with `data-tour-highlight`, scrolling it into view (`block: "nearest"`, smooth);
  - remove every highlight when the step changes.
- **Highlight style:** a 3 px sky outline, 3 px offset, rounded corners, and a slow pulse (outline opacity 1 → 0.35 → 1 over 1.6 s).
- **Tool panels that normally open as a modal overlay over the whole screen:** while the tour is open, open them **non-modal**, without the dark overlay, and ignore outside clicks (their close button and Escape still work). Position them between the tour strip and the open sidebar, measuring both every 500 ms and on resize (top = bottom of the strip + 8 px; right = window width − the sidebar's left edge + 8 px). The strip and panel stay visible and clickable.

---

## 8. Saved state

Save per work item in `localStorage` (`<app>.demoTour.<workItemId>`): step index, open/closed, "voice presents", voice, and the Autopilot state (`off` / `running` / `paused`).

- **Restoring on mount:** use a `restored` **state** flag, not a ref, so the save effect cannot write the defaults over the saved values in the same commit.
- **Resuming:** if the saved Autopilot state is `running`, resume at the saved step. That covers a reload and a page change.
- **Voice default:** the voice starts as the pack's `defaultVoice` unless this browser chose one. A choice is also written to a global key (`<app>.speechVoice`) that the assistant's read-aloud uses outside demos.

---

## 9. Narration (pre-recorded voice-over)

- **Recording:** one mp3 per step × language × voice, made with a TTS model (instructions per language, for example "a calm, clear presenter for civil servants, natural accent, short pauses").
- **Storage:** a public storage bucket, path `<packId>/<voiceId>/<language>/<stepId>-<hash>.mp3`. The hash is sha1 of model, voice, language instructions and narration text, first 12 characters. Changing a text or voice therefore needs a new recording automatically, and old files are simply unused.
- **Serving:** the page lists existing files once per voice and language and passes a map `voice → language → stepId → public URL` to the provider. Steps without a file simply have no play button.
- **Recording action** (platform admin): computes the missing files for every step, including optional ones, returns their number at once, and records them in the background with 4 at a time. It records the cost per file (§8 of the demo mode prompt), and the admin row refreshes its status.
- **Security headers:**
  - add `media-src 'self' blob: data: <storage origin>` (plus the local storage origins in development) to the CSP; without it the browser silently refuses the audio;
  - `connect-src` must allow the AI provider for the live voice.
- **Playback:**
  - one shared `Audio` element; `playAudio(url)` returns a promise that settles when the audio **ends, errors, or is stopped by the tour**;
  - **do not settle on the `pause` event.** Pausing the previous recording fires `pause` a moment later, and it cuts the next narration short;
  - "Voice presents" plays the narration on every Next;
  - manual Back or Next stops the current audio.

---

## 10. Autopilot

**Loop** (`runAutopilot(fromIndex)`, with a run token so that a pause, stop, manual navigation or unmount cancels it). For each step from `fromIndex`:
1. Set the step and open the tour, then navigate.
   - If navigation went to another page: save `{ index, autopilot: "running" }` straight away and **return**. The new page's provider resumes.
2. Wait 1.6 s for the screen to settle, then run the address check (§7).
3. Start the narration, keeping its promise.
4. Refresh the facts. If `stepDone`, skip the actions, otherwise run `auto`.
5. Wait for the narration to finish, then pause 1.2 s.

After the last step: Autopilot off, with the note "The tour is finished".

**Actions:**
- **`click`:**
  - wait for the first **visible, enabled** match with all `state` tokens: up to 30 s, or 10 s when `optional`;
  - with `contains`, prefer matches whose text contains the phrase (case-insensitive) and fall back to any match; with `pick: "last"`, take the last match instead of the first;
  - an **optional** press whose target exists but in another state counts as already done: skip it after 800 ms instead of waiting 10 s;
  - scroll it to the centre, highlight it for 1.1 s, then **find it again** (if it was re-rendered or disabled meanwhile, wait until it is enabled again) and press;
  - wait 0.9 s.
  - **Pressing** dispatches `pointerdown`, `mousedown`, `pointerup`, `mouseup` with `pointerType: "mouse"` and `button: 0`, then `click()`. Radix triggers open on pointerdown; plain buttons react to click.
- **`type`:** focus, set the value through the native value setter of the input or textarea, dispatch `input` (bubbling), then wait 0.7 s. Use the text in the current screen language.
- **`waitJob`:** poll the jobs provider (and ask it to refresh every 3 s). Done when a running job was seen and has finished, or the job was updated after the wait began. A failed job becomes an error. If nothing appears within 30 s, carry on.
- **`waitFor`:** refresh the facts every 3 s until the condition holds. Default timeout 10 minutes; then "This is taking much longer than usual."
- **`waitForTarget`:** wait until a visible match appears (any enabled state), up to `timeoutMs` (default as for `click`). Use it for things that render late, such as an answer that is still streaming, or a sheet that must have opened.
- **`waitNarration`:** wait for the current narration promise.
- **`key`:** dispatch `keydown` with that key on the active element (it bubbles to the document; Radix dialogs close on Escape).
- **`scrollTo`:** scroll to the first visible element with `target`, or else to the first h1, h2 or h3 containing `text`.
- **`pause`:** set the break note and pause, **unless Autopilot was continued from this very step**. Otherwise Continue on the break would pause again at once.
- **`group`:** run the nested actions. With `optional`, a "not found" inside skips the rest of the group.
- **Guards:** before an action with `unless` or `onlyIf`, refresh the facts; skip when `unless` holds or `onlyIf` doesn't.

**Errors:** "not found" on a required action, or any error, stops the audio, sets Autopilot to paused, and shows the matching note. The presenter does the step by hand and presses Continue. Continue re-runs from the current step, and the step or its guarded groups are skipped when the facts show the work is done.

**Pause, stop and manual control:**
- **Pause** stops the audio and cancels the run.
- **Stop** also clears the note.
- **Manual Back or Next while running** pauses first.
- **Closing the tour** pauses.
- **Unmounting the provider** cancels the run and stops the audio.

**Authoring rules for `auto`:**
- Write each outcome as a guarded group, so a partially done step completes instead of repeating. For example: "keep one" unless decided ≥ 1; "adapt one with a reason" unless decided ≥ 2; "drop one with a reason" unless drops ≥ 1.
- Follow every press that should change data with a `waitFor` on the fact it produces. A press that silently did nothing, because the control was disabled or a prerequisite was missing, then becomes a visible error instead of a skipped step.
- Mind prerequisites: if a later step needs everything approved, press the demo-only bulk-approval control first. Mind side effects: a redraft resets that item's approval, so approve after redrafting.
- Open a dialog, `waitNarration`, then `key: Escape` to close it.
- **Demo shortcuts** (the demo's own buttons that let fictional colleagues read along or residents respond; see the demo mode prompt): press them, then `waitFor` the count they produce (for example notes ≥ 6, responses ≥ 8). Press them only once the prerequisite exists (enough chapters written; the consultation open).
- **One scripted assistant question:** keep the question Autopilot types as a constant in the tour code, with a helper `isTourAskQuestion(text)`. The room log (§12) and the room-questions fact both leave it out, so it never shows up as the room's question. Pattern: open the assistant tab, start a new chat (optional), `waitForTarget` the input, type, send, `waitFor` assistant answers ≥ 1, `waitForTarget` the read-aloud button, `waitNarration`, press read aloud (`pick: "last"`), let it play for a while, stop it, go back to the Tour tab.
- **The public page as a resident:** press a passage with `contains` a topic word, type the response, submit, `waitFor` responses ≥ 1. Later, show the published summary with `scrollTo` targets and submit an appeal (guarded: `unless` appeals ≥ 1). The presenter acts in their own name.
- **Per-topic decisions:** repeat a guarded group ("use the suggestion", then "apply") for as many topics as can exist, `unless` topics decided ≥ topics (`atLeastFact`).
- **Exports:** press Word `unless` Word files ≥ 1, `waitFor` it; then PDF `unless` server PDFs ≥ 1, `waitFor` it. The step is done when both exist.
- **The closing summary** is guarded with `onlyIf` room questions ≥ 1. Without questions there is nothing to summarise, and waiting for a summary that is never made would stall the last step.

---

## 11. Live questions from the room (push-to-talk)

**Server route** `POST /api/voice/session` (platform admin only):
- Mints a short-lived client secret from the realtime API for the chosen voice. Instructions:
  - the product's purpose in two or three sentences;
  - "answer briefly in two to four spoken sentences, concrete and honest; if you don't know, say so; never invent numbers, dates or legal claims";
  - the language rule;
  - the current step title;
  - a compact summary of the work item's current contents, built from a few database queries.
- Uses the platform's own API key, never exposed to the browser.

**Client control** (in the tour strip):
- **Connect:** a **Questions** button with a microphone icon. Pressing it gets the secret, opens a WebRTC peer connection with an audio transceiver but **no microphone track**, and a data channel. It posts the SDP offer to the realtime calls endpoint with the secret and sets the answer. When the channel opens, it sends `session.update` with `turn_detection: null` (push-to-talk) and input transcription in the current language.
- **Ready:** the control reads "Hold to ask a question · microphone off", with a small X to disconnect.
- **Holding the button** (pointer down or Space):
  - cancel any answer in progress, clear the input and output buffers;
  - **only now** call `getUserMedia` and attach the track with `replaceTrack`;
  - the button reads "Microphone on · release to ask", in red, pulsing.
- **Releasing:** wait 300 ms, `replaceTrack(null)`, stop the tracks (the browser's microphone indicator must go off), then commit the input buffer and create a response.
- **While answering:** "Answering… hold to ask again", plus a Stop button (cancel the response and clear the output).
- **Feedback log:** pair the question transcript and the answer transcript and post them, with the current step id and language, to `POST /api/demo/feedback` (§12).
- **Cost:** on `response.done`, post its usage to a cost route that prices text and audio tokens separately.
- **Headers:** the product's `Permissions-Policy` must allow `microphone=(self)`.

**Disclosure in the tour content** (required): the opening narration says the voice is recorded in advance, nobody is listening, the microphone is on only while the button is held, and only what is asked there and in the assistant is kept for a summary at the end. A second opening step explains that `{{PRODUCT}}` is built by people and AI together, evolves with use, that questions today help improve it, and that the tour is an internal beta that could later help onboarding.

---

## 12. What the room asked: log and end-of-demo summary

**Tables** (no cascading delete, so they outlive the demo tenant; RLS: platform admins read, the service role writes):
- `demo_feedback_log`: pack id (set null), tenant id, work item id, demo name, `source` (`ask` | `questions`), `source_id` (unique together with `source`; empty for spoken questions), step id, language, question, answer, `created_at`.
- `demo_digests`: pack id, tenant id, work item id, demo name, language, number of entries, `body_markdown`, `created_at`.

**Collecting** (on making a summary):
- Copy the assistant conversations of the demo tenant and its work items since `demoLoadedAt` into the log. Pair each user message with the next assistant message and upsert on the message id. Skip Autopilot's own scripted question (`isTourAskQuestion`).
- Add the spoken questions already in the log.

**Summary action** `makeDemoDigest(workItemId, language)` (platform admin):
- Nothing to summarise: return "No questions have been asked yet".
- Otherwise call the platform's summarise model. System prompt:
  - "summarise what users asked during a live demonstration, so the team can improve the product";
  - exactly these Markdown headings, in order: Topics / Where the answers fell short / What seemed unclear or missing / Improvement points (concrete, numbered) / Follow-up questions for the team;
  - "shown to the room: never name people, and do not quote questions literally";
  - "use only the log; be brief; one line if a heading has nothing".
- Log entries: "n. (spoken, Questions button / typed or dictated in the assistant, during step X) Question: … Answer: …", at most the last 80 entries, with answers cut to about 900 characters.
- Store the summary and record its cost as kind `digest`.

**The summary step** (`panel: "digest"`, the last step), shown in the Tour panel:
- a **Make the summary** button (sparkles icon; "Make the summary again" once one exists);
- while it runs: "Reading back through the questions and answers…";
- the result: "From N questions and answers", the Markdown (small H2s), and a **Read aloud** button.

Autopilot for this step, as one group guarded with `onlyIf` room questions ≥ 1: press it, `waitFor` summaries ≥ 1 (180 s), `waitNarration`, wait 1 s, then press Read aloud (optional). Without room questions the step only narrates.

**Admin:** the demo packs page lists summaries per pack with View and Download (see the demo mode prompt).

---

## 13. Voice in the assistant (companion feature, usable outside demos too)

- **Read aloud:** a small speaker button under every finished assistant answer (not while it streams):
  - it reads the answer without citation codes, markdown, links, tables or code;
  - one text plays at a time: starting another stops the first;
  - it shows Stop while playing;
  - the voice is the tour's voice in a demo, otherwise the last one chosen in this browser, otherwise female.
- **Text cleaning** (`speakableText`, pure, unit-tested):
  - remove the citation markers, code blocks and table lines;
  - replace images and links by their label; remove bare URLs;
  - remove heading, quote and list markers, and emphasis characters;
  - collapse spaces, and remove the space left before punctuation;
  - use `[ \t]` rather than `\s` in the line-start patterns, so blank lines between paragraphs survive.
- **Quick start:** split into parts at sentence ends. The first part is about 280 characters, so the voice starts in about 3 s; the rest are about 1,200 characters. Fetch the next part while the current one plays.
- **Speech route** `POST /api/speech/speak` (signed-in users, rate-limited to 20 per minute per user): returns one mp3 for the given text (at most 8,000 characters), voice and language, and records the cost as `read_aloud`.
- **Dictation:** a microphone button inside the input box, left of Send:
  - click to start and click to stop, stopping by itself after 60 s;
  - the tooltip reads "Ask by voice · microphone off" / "Microphone on · click to stop" / "Turning speech into text…";
  - the recording is webm/opus, or mp4 on Safari; keep the extension in the file name, because the transcription API goes by it;
  - `POST /api/speech/transcribe` (rate-limited) turns it into text; the recording is not kept; the cost is recorded as `dictation`;
  - the text is **sent at once as the question**;
  - release the microphone straight after recording.
- **Hands-free:** if the question was dictated, read the answer aloud automatically.
  - Keep the "read the answer after message n" flag **outside the chat component** (module state), because the first message creates the conversation and remounts the chat.
  - Start automatic reading only once: clear the flag when it starts, and use a read-aloud id based on conversation and position, not a message id that changes when the saved message replaces the streamed one.
  - A typed question clears the flag.

---

## 14. Optional tour parts across pages (example: "show how the AI is set up")

- **Setting:** a pack option switches in three steps after the specialists step:
  1. The platform's AI settings, **models tab only**. The tour must never open tabs that show other customers, and API keys must never be visible, only "key on file".
  2. The tenant's allowed models (open the models dialog, wait for the narration, press Escape).
  3. One specialist opened in its editor: instructions, sources, model, version history. Before opening, expand its section if it's collapsed (the toggle carries `open` / `closed`).
- **Mechanics:** these steps use `place.page`, the floating tour (§6), and cross-page resume (§10).
- **Localised names:** show default specialists by their localised name and task when the stored name matches the built-in default (display only; keep stored names, because code may match on them).

---

## 15. The written guide

Generate the per-step part of a Markdown guide from the tour data with a small script (for example `scripts/generate-tour-guide.ts`) that rewrites everything under a fixed "Step by step" heading, numbering the steps with every optional part shown. Write the rest of the guide by hand:
- **Timetable** per part (start time and minutes).
- **Two clocks, stated plainly:** the planned session (the sum of the step estimates, with time for the presenter's talk, discussion, the break and questions) and Autopilot on its own (narration plus AI waiting, typically a small fraction of the session). Audiences and presenters confuse the two.
- **Preparation checklist:** credits, narration complete, fresh demo, backup demo (hidden), language, sound, browser.
- **How the tour works:** strip, panel, voice, Autopilot, pause/by hand/continue, what is kept, the microphone disclosure, document views.
- **Timings:** how long Autopilot takes, measured, and the waiting times of the AI steps.
- **Costs:** measured per run.
- **Fallbacks:** credits, a slow step, no voice, wrong screen, an Autopilot note, everything broken.
- **Not shown in the demo.**
- **Per step:** action in each language, AI step, what the room sees, and the narration in each language, marked when optional or on another page.

Regenerate it whenever the tour changes.

---

## 16. Tests

**Unit tests:**
- The tour survives a JSON round trip, including `allOptions`.
- Step ids are unique, every step's part exists, and every language has an action and a narration of at least 40 characters.
- Every `target`, `click` and Autopilot `click`/`type` target exists as `data-guidance-target` in the component source (allow targets that are built from templates or passed as props).
- Every fact used in `doneWhen`, `unless`, `onlyIf` and `waitFor` is produced by the facts action (search its source).
- Parts appear in the agreed order.
- Optional parts are filtered when off, and their pages build the right links.
- `stepDone` and `conditionHolds`.
- `onTourStepPage` for every page kind (the public page matches any publication), and `atTourStepPlace` ignoring the work item's own parameters.
- Coverage: the tour contains the agreed step ids from the dashboard to the end of consultation, and the list of steps without Autopilot actions (narration only) is exactly the agreed one, so a new step cannot silently lack Autopilot.
- The production image's browser version for server PDFs matches the browser library's version in the package file.
- The speakable text cleaning and splitting.
- The summary prompt: headings, the no-names rule, trimming.
- The price table.

**Dry runs**, first locally, then on production:
- **Browser automation:** a hidden automation tab throttles timers (they fire about once a minute). Turn on focus emulation and set the page lifecycle to active before timing anything. Send resize and measure commands one after the other, never in parallel.
- **Microphone:** substitute a recorded narration file for the microphone (`getUserMedia` returning `audioElement.captureStream()`) to test dictation, the push-to-talk questions and the summary end to end. A real room microphone test stays with the presenter.
- **Full run:** a complete Autopilot run from step 1, logging each step's start time and every console error in full. Afterwards check the database: every expected result exists, the costs are recorded, the backup demo is hidden.
- **After every framework or UI-library upgrade, do a full run again.** Unit tests and short replays do not catch everything: in the reference product, a framework minor upgrade that bundled a newer React build made UI-library components that set state from ref callbacks loop ("Maximum update depth exceeded") partway through the tour, in three full runs out of three, while a replay of the same steps passed. The fix was to stay on the previous framework version until the UI library supports the new React build.

---

## 17. Acceptance criteria

1. **Gating:** only platform admins in a loaded demo ever see the tour; normal users see nothing new.
2. **Navigation:** Next goes to the right screen, opens the right tab or dialog, and outlines the right control. Tool panels never cover the strip or the Tour panel.
3. **Voice:** narration plays in the chosen voice and language, and is never cut short. Switching voice works from the strip, the panel and the floating card, and survives a reload.
4. **Autopilot, unattended:** it runs the whole tour with the audience waiting only on real AI work. It pauses at the break, and after Continue it finishes, with no manual help, in the order and timing of the script.
5. **Pause and hand-work:** you can pause at any step, do something by hand, and press Continue. Nothing is done twice.
6. **Errors:** a missing prerequisite produces a clear note, never a silent skip.
7. **Reload and pages:** a reload during Autopilot continues where it was; cross-page steps work both ways.
8. **Questions:** answered aloud in a few seconds, with the microphone indicator off except while holding the button.
9. **Summary:** it lists topics and improvement points without names or quotes, can be read aloud, and stays available after the demo is ended.
10. **Language:** every text exists in every UI language, and switching language mid-tour switches the narration and notes.
11. **Whole product:** Autopilot goes from the dashboard, through the tenant page and the work item, to the public page and back, and finishes with the consultation closed, with the audience waiting only on AI work.
12. **Tour off:** with the demo's tour switched off, no tour UI renders anywhere and the demo shortcuts still work.
13. **Exports:** the PDF step downloads a real PDF made on the server; no print window opens.
14. **Nothing asked:** without room questions, the last step narrates and the tour finishes; it does not wait for a summary.
