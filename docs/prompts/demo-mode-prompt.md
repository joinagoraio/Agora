# Prompt: build "Demo mode" (demo packs, loaded demos, demo strip)

You are building a **demo mode** into an existing multi-tenant web product. It lets a platform administrator load a complete, realistic, ready-made organisation ("demo") from a reusable template ("demo pack") in one click, present it, reset it, hide it, and remove it, without ever touching real customers' data. It also measures what each demo costs in AI usage.

Replace these placeholders with the product's own terms throughout:

- `{{PRODUCT}}`: the product name.
- `{{TENANT}}`: the organisation or workspace-owning entity (in the reference product: an "authority").
- `{{WORK_ITEM}}`: the main object users work on inside a tenant (in the reference product: a "programme").
- `{{PLATFORM_ADMIN}}`: the platform-level super administrator role.

Build it in the product's existing stack and component library. The reference implementation used Next.js (App Router, server actions, `after()` for background work), Supabase (Postgres, Row Level Security, Storage), Tailwind CSS v4 and Radix/shadcn components, with OpenAI as the AI provider. Keep the behaviour identical; adapt the mechanics.

---

## 1. Goals and non-goals

**Goals**
- A platform admin can create and edit demo packs, and load any number of independent demo tenants from a pack.
- Every loaded demo is clearly marked as a demo, only for platform admins, on every page of that tenant.
- Reset, End and Hide are safe: they can only ever act on tenants that are marked as demos.
- The team can see what each demo cost in AI usage, and what recording its voice-over cost.
- Pack content can be seeded and upgraded from code without losing settings an admin changed on the pack.

**Non-goals**
- Demo mode is not a trial or sandbox for customers. Customers never see packs, the demo strip, or these admin pages.
- Demo tenants are real tenants in the database; there is no separate "fake" data path. Everything the product does works in a demo exactly as for a customer.

---

## 2. Data model

### 2.1 Demo pack (`platform_demo_packs`)
One row per pack. Fields:
- `id`, `name` (unique per platform), `created_at`, `updated_at`.
- `writing_language` (the language the demo's generated content is written in).
- Tenant profile fields copied to the loaded tenant: mission statement, description, jurisdiction or region, tenant type/scope (for example municipal / regional / national), `default_model_id` (the AI model the loaded tenant is switched to and its specialists use).
- `chapters` (or the product's equivalent **structure/template**): ordered list of sections with title, purpose, writing instructions, output form, which inputs each section draws on, and whether it is required.
- `files`: ordered list of source files with title, full text (or storage reference), and a **role** (what the file is for in the product, for example "vision" / "existing policy").
- Product-specific preselection, for example which items are pre-chosen on load and default headings.
- `tour` (JSON, nullable): the guided tour for this pack (see the separate guided-tour prompt). Demo mode only stores and returns it; it also stores two admin-editable tour settings inside it: `options` (map of optional tour parts to on/off) and `defaultVoice` (`female` | `male`).
- Row Level Security: only `{{PLATFORM_ADMIN}}` can read or write.

### 2.2 Loaded demo marker (on the tenant row)
A loaded demo is an ordinary tenant with these keys in its metadata JSON:
- `demo: true` (the only thing that makes it a demo; every destructive action checks it).
- `demoPackId`, `demoPackName`, `demoLoadedAt` (ISO timestamp).
- `demoHidden: true|false` (hidden from dashboards; see §6).
- `demoTour: true|false` (the guided tour is on for this demo; absent counts as on). Chosen when loading, switchable afterwards (§5, §7).

### 2.3 AI usage (`llm_usage`)
One row per AI call, written by the shared AI call layer (see §8):
- `id`, `created_at`, `workspace_id` (the `{{WORK_ITEM}}`, nullable, `on delete set null`), `space_id` (the `{{TENANT}}`, nullable, `on delete set null`), `kind` (what the call was for: analysis, chapter, work-up, measures, coherence, roles, narration, read_aloud, dictation, questions, digest, demo_people, note_groups, response_groups, and so on), `provider`, `model`, `input_tokens`, `output_tokens`, `cost_usd` (numeric, nullable when the model has no known price).
- Indexes on `(space_id, created_at desc)` and `(workspace_id, created_at desc)`.
- RLS: platform admins read; writes happen with the service role only.
- Because the foreign keys are `set null`, cost history survives when a demo is ended.

Ship every schema change as a numbered SQL migration, and apply it to production **before** deploying code that uses it.

---

## 3. Seeding packs from code

- The product ships at least one reference pack defined in code (profile, structure, files, tour).
- An idempotent `ensure<Name>Pack()` runs whenever pack data is needed (the admin page loads packs, a loaded demo is looked up, narration status is read). It:
  - inserts the pack if missing;
  - patches only fields that are missing or recognisably outdated (for example an older structure), never overwriting deliberate admin edits;
  - replaces the stored tour when the code's tour `version` is higher than the stored one, **preserving** the stored `options` and `defaultVoice`.
- Bump the tour version constant whenever tour steps or texts change.

---

## 4. Loading a demo

Server action `loadDemoPack(packId, { tour })`, platform admin only (`tour` defaults to on):
1. Create a new tenant named `<pack name> <YYYY-MM-DD HH:mm>` with the pack's profile fields and scope, owned by the current admin. Write the demo marker keys (§2.2), including `demoTour`.
2. Enable the pack's default model for this tenant.
3. Copy every pack file into the tenant as a document, with its role, visible to the tenant's work items.
4. Save the pack structure as the tenant's template, in order.
5. Create the tenant's default AI specialists (agents) bound to that model.
6. Create exactly one `{{WORK_ITEM}}` from the template, with the pack's preselections applied, and bind the files by role.
7. Add the demo colleagues (§5a) to the tenant and the work item, each with their job (writer or reviewer). A failure here is logged, not fatal.
8. Return the new work item's id; the client navigates straight to it.

It must never modify any existing tenant. Loading takes tens of seconds; show progress on the button and keep the page responsive.

---

## 5. The demo strip (on every page of a demo tenant)

A slim bar pinned to the very top of the tenant page and of every work-item page of that tenant, **rendered only for platform admins** and only when the tenant has `demo: true`. Nobody else sees it, and it takes no space for them.

**Look**: full width, about 32 px high, soft amber background, dark amber text, small type. Left: a bordered uppercase badge `DEMO`, then one truncating line: "Demo `{{TENANT}}` · `<pack name>` · loaded `<date, time>`". The load time is formatted **on the client** after mount (server and browser time zones differ; formatting on the server causes a hydration mismatch and a wrong time). Right, in this order:
1. **Guided tour** button (only when the tour is on for this demo and currently closed; reopens it).
2. **Guided tour** switch (only when the pack has a tour): turns the tour on or off for this demo, for every browser (server action `setLoadedDemoTour(tenantId, on)`, then refresh). Off gives a plain demo to explore or hand over, with no tour strip, Tour tab or Autopilot; on brings the tour back where it was left. The tour strip's own X only closes the tour for now.
3. **Reset**: confirmation dialog ("Start this demo again? This loads the pack fresh and then deletes `<name>`, with its N `{{WORK_ITEM}}`s, N items and N documents. Other demos stay."). On confirm: load a fresh demo from the same pack **with the same tour choice**, then end the old one, then navigate to the new work item.
4. **End demo** (red text): a destructive dialog that lists what will be deleted and requires typing a confirmation word in the UI language (for example `end` / `einde`) before the red button enables. After ending, navigate to the demo packs admin page.
5. **Hide until the page reloads** (X icon): hides the strip for this page view only.

Counts shown in the dialogs come from the server when the strip loads.

---

## 5a. Demo people and demo shortcuts

A demo must show collaboration and consultation at realistic volume without real people. The demo brings its own fictional people and a few shortcuts that make them act.

**People** (defined in code, per pack or product-wide):
- **Colleagues** (about five): name, a role in the organisation's own words (for example "legal adviser", "finance adviser"), and a job on the work item (writer or reviewer).
- **Residents and partners** (about eight): name with place or organisation in brackets, and a situation (first-time buyer, retiree, municipal officer, housing association, nature organisation, developer).
- `ensureDemoPeople(people)`: finds or creates one account per person through the auth admin API, with an address on a reserved domain (`…@example.com`), a random password that is never stored or shown, a confirmed email, and `app_metadata.demo_person = true`; upserts the profile name. Nobody can sign in to these accounts. They stay on the platform, but only demo tenants have them as members, so they disappear from view when a demo ends.

**Shortcuts** (amber demo buttons, platform admins in a demo only; they belong to the demo, not the tour, so they stay when the tour is off):
- **Colleagues read along** (above the document, once a few chapters are written): sends the written paragraphs (at most about 60, at least 60 characters each) with the colleagues' roles to the AI in the tenant's writing language, and asks for about twelve notes on real paragraphs, several making the same point in different words, plus a few replies to each other, as JSON. Parse defensively (unknown paragraphs or authors are dropped) and insert them as those colleagues.
- **Responses come in** (on the consultation screen, while it is open): takes passages from the published version and asks the AI for about fourteen responses from the residents and partners, several on the same passage, each with the passage quoted exactly. Insert them as those people, each with a history event.
- **Approve the rest**: approves every remaining chapter, so a later step that needs everything approved can run.
- Every shortcut checks on the server: platform admin, and the work item belongs to a loaded demo. Record their AI cost as kind `demo_people`; the grouping calls record `note_groups` and `response_groups`.

---

## 6. Hide from dashboard

- Server action `setLoadedDemoHidden(tenantId, hidden)`: platform admin only; refuses unless `demo: true`; writes `demoHidden`; revalidates the dashboard.
- A helper `isHiddenDemoTenant(metadata)` returns true only when both `demo` and `demoHidden` are true.
- The user dashboard and the quick-jump/command list filter out hidden demo tenants **and** every work item that belongs to one (work items can reach the dashboard through several queries, for example "work items in tenants I administer" and "work items I am a member of"; filter all of them).
- Hidden demos stay fully usable and reachable from the demo packs page (**Open**).

Typical use: a fully pre-run backup demo is kept out of sight of the audience.

---

## 7. Demo packs admin page (`/admin/demo-packs`, platform admins only)

Layout: page title and one-line explanation; a row of pack cards (name, file count, section count, language; selected card has a border); an **Add pack** button; below, the editor for the selected pack.

**Pack editor** (all fields of §2.1 with labels and one-line help text under each): name, writing language (select), default model (select from the enabled catalogue), mission, description, jurisdiction, scope (select), product-specific preselection fields, the structure list (add, remove, reorder, edit title, purpose, instructions, output form, inputs, required), the file list (title, role select, **View** full text in a dialog, add, remove). Buttons: **Load demo** (primary) with a **Start with the guided tour** switch next to it (on by default; only shown when the pack has a tour), **Save pack**, **Remove loaded demos**, **Delete pack** (typed confirmation; also removes the pack's loaded demos).

**Loaded demos** (for the selected pack): one row per loaded demo, newest first:
- Name, and a small `HIDDEN` chip when hidden.
- Second line: "Loaded `<local date time>` · N items · N documents · AI cost about US$ X.XX".
- Buttons: **Open**, a **Guided tour** switch (as on the demo strip), **Hide from dashboard / Show on dashboard**, **End demo** (typed confirmation as in §5).
- **Remove loaded demos**: one dialog listing every loaded demo by name with a typed confirmation word; ends them one by one. It must never touch a tenant without `demo: true`.

**Summaries** ("What the room asked"): list of end-of-demo summaries made from this pack's demos, kept even after those demos were ended: demo name, date, "from N questions and answers", **View** (expands the Markdown) and **Download** (`.md`). (Produced by the guided tour; see that prompt.)

**Tour parts**:
- **Default voice**: segmented buttons Female / Male, with the help text "The presenter can switch in the tour".
- One checkbox per optional tour part, with a label and a one-line explanation of what it adds and roughly how many minutes.

**Tour narration**: one status line per voice, "Female (`<voice id>`): Dutch 39 of 41, English 39 of 41", plus "recording cost so far about US$ X". The **Record narration** button starts recording only the missing files in the background. It shows "Recording…" and refreshes the status every 5 seconds until everything is recorded. It is disabled when complete.

---

## 8. AI cost tracking (product-wide, required by demo mode)

- **Price table** in code: per model id pattern, US dollars per million input and output tokens, most specific patterns first (for example `gpt-5.6-luna` before `gpt-5.6`). `tokenCost(model, in, out)` returns `null` for unknown models. Cover every model the platform can route to, including small reasoning models used for summarising and grouping (for example `o4-mini`, `o3-mini`); an unpriced model shows up as "calls without a known price" and understates the cost.
- **Adapters return token counts**: every provider adapter returns `tokens: { input, output }` from the provider's usage fields.
- **The shared completion function** accepts an optional `usage: { workspaceId, kind }`. When present it records a usage row after a successful call. Recording must **never** fail or slow the AI step: catch and log errors. Resolve the tenant from the work item when only the work item is given.
- **Attribute every AI call site** that belongs to a work item (analysis, drafting, generation, comparison, role checks and so on) with its work item id and a `kind`.
- **Non-token costs** are recorded with an explicit `cost_usd`:
  - text-to-speech: bytes ÷ 16 000 = seconds (for 128 kbit/s mp3), × the provider's per-minute estimate;
  - realtime voice: text and audio tokens priced separately, with cached tokens at the cached price;
  - transcription: its own token prices.
- `spaceCost(tenantId)` returns the total and a per-kind breakdown, plus a count of calls without a known price.
- Show costs honestly as estimates in US dollars ("about US$ X.XX").

---

## 9. Safety rules (test each one)

- Every destructive action checks, on the server, that the target tenant has `demo: true`. Client checks are never enough. So does `setLoadedDemoTour`, and so do the demo shortcuts (§5a).
- Every demo-mode server action and route checks `{{PLATFORM_ADMIN}}` on the server.
- Typed confirmations for End, Remove all and Delete pack; the confirmation word is localised.
- Reset creates the new demo **before** deleting the old one, so a failure leaves you with at least one demo.
- Nothing in demo mode deletes or changes non-demo tenants, users, or other demos.

---

## 10. Internationalisation and copy

- Every label, dialog, toast and help text goes through the product's i18n, with complete entries in every supported language. Add a test that the language files have the same keys.
- Plain, short, sentence-case copy; no internal jargon in anything a room could see.

---

## 11. Tests and acceptance

**Unit tests**
- Price table and cost maths.
- Hidden-demo helper.
- The pack seeding upgrade rule: a newer code version replaces the stored tour but keeps its options and default voice.
- Load-time formatting done on the client.
- Demo people: the prompts contain the people's roles and the paragraphs or passages; the parsers drop unknown paragraphs, passages and authors, and keep quotes exact.

**Manual acceptance**, on production after deploy:
1. Load a demo. It opens on its work item with the strip visible to a platform admin and invisible to a normal member.
2. Reset. A new demo exists, the old one is gone, and every other tenant is untouched (verify in the database).
3. Hide the demo. It disappears from the dashboard and the quick-jump list, but stays under **Open**.
4. End it with the typed word. It's gone, and its AI cost records remain.
5. The loaded-demo row shows a plausible AI cost after a few AI steps.
6. The narration row counts and records only the missing files.
7. Load a demo with **Start with the guided tour** off: no tour anywhere, the demo shortcuts work. Switch it on in the strip: the tour appears. Reset: the new demo keeps the choice.
8. The colleagues are members of the new work item with their jobs; **Colleagues read along** adds notes on real paragraphs; **Responses come in** adds responses with exact quotes of the published version.
