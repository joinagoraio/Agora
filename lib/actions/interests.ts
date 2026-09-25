"use server"

import MarkdownIt from "markdown-it"
import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { splitTextIntoPages, type TextPage } from "@/lib/documents/text-pages"
import { parseProgrammeBindings, resolveDraftAgentId } from "@/lib/programme/domain"
import {
  DEFAULT_WORKUP_HEADINGS,
  findNumberedInterests,
  mapInterestRow,
  parseWorkupHeadings,
  type FoundInterest,
  type ProgrammeInterest,
  type WorkupHeading,
} from "@/lib/programme/interests"

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true })
const WORKUP_ORIGIN = "programme_interest_workup"

async function requireWriter(workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
    return null
  } catch (error) {
    return error instanceof Error ? error.message : "Unauthorized"
  }
}

async function loadWorkspace(workspaceId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from("workspaces").select("id, name, metadata, space_id").eq("id", workspaceId).maybeSingle()
  return { supabase, workspace: data }
}

export async function listProgrammeInterests(workspaceId: string): Promise<{ data: ProgrammeInterest[]; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_interests")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true })
  if (error) return { error: error.message, data: [] }
  return { data: (data || []).map(mapInterestRow) }
}

async function visionPages(supabase: Awaited<ReturnType<typeof createClient>>, documentIds: string[]) {
  if (documentIds.length === 0) return []
  const [{ data: documents }, { data: pages }] = await Promise.all([
    supabase.from("documents").select("id, title, content").in("id", documentIds),
    supabase.from("document_pages").select("document_id, page_number, text_content").in("document_id", documentIds),
  ])
  return (documents || []).map((document) => {
    let docPages: TextPage[] = (pages || [])
      .filter((page) => page.document_id === document.id)
      .map((page) => ({ pageNumber: page.page_number, text: page.text_content || "" }))
      .sort((a, b) => a.pageNumber - b.pageNumber)
    const pageChars = docPages.reduce((sum, page) => sum + page.text.length, 0)
    const content = (document.content || "").replace(/<[^>]+>/g, " ")
    if (docPages.length === 0 || pageChars < content.length * 0.5) docPages = splitTextIntoPages(content)
    return { id: document.id as string, title: (document.title as string) || document.id, content: document.content as string, pages: docPages }
  })
}

/** Ask the model for the interests when the vision does not number them. */
async function findInterestsWithModel(input: {
  workspaceId: string
  supabase: Awaited<ReturnType<typeof createClient>>
  documents: Array<{ id: string; title: string; content: string }>
}): Promise<FoundInterest[] | { error: string }> {
  const { selectEvidenceForTask, withCitationPages } = await import("@/lib/programme/evidence-select")
  const evidence = await selectEvidenceForTask({
    supabase: input.supabase,
    documents: input.documents,
    query: "belang belangen provinciaal gemeentelijk nationaal principe uitgangspunt ambitie interest interests principle ambition",
    budgetChars: 60000,
  })
  const { completeLlm } = await import("@/lib/llm")
  const { resolvePlatformTaskLlm } = await import("@/lib/llm/resolve")
  const llm = await resolvePlatformTaskLlm("summarize")
  const completion = await completeLlm({
    usage: { workspaceId: input.workspaceId, kind: "interests" },
    provider: llm.provider,
    endpoint: llm.endpoint,
    apiKey: llm.apiKey,
    model: llm.model,
    json: true,
    maxTokens: 8000,
    messages: [
      {
        role: "system",
        content:
          'List the interests, principles, or core commitments this vision names as the basis for policy, in the order the vision gives them. Use the vision\'s own wording and numbering. Return JSON only: {"interests":[{"reference":string|null,"label":string,"summary":string,"documentId":string,"pageNumber":number,"quote":string}]}. The quote is the exact line that names the interest.',
      },
      { role: "user", content: evidence.text },
    ],
  })
  try {
    const parsed = JSON.parse(completion.text.slice(completion.text.indexOf("{"), completion.text.lastIndexOf("}") + 1)) as {
      interests?: Array<Record<string, unknown>>
    }
    return (parsed.interests || []).flatMap((row) => {
      const label = typeof row.label === "string" ? row.label.trim() : ""
      const documentId = typeof row.documentId === "string" ? row.documentId : input.documents[0]?.id
      if (!label || !documentId) return []
      const [citation] = withCitationPages(
        [
          {
            documentId,
            pageNumber: typeof row.pageNumber === "number" ? row.pageNumber : undefined,
            quote: typeof row.quote === "string" ? row.quote : undefined,
          },
        ],
        evidence.spans,
      )
      return [
        {
          reference: typeof row.reference === "string" && row.reference.trim() ? row.reference.trim() : null,
          label,
          summary: typeof row.summary === "string" ? row.summary.trim() : null,
          citation: citation!,
        },
      ]
    })
  } catch {
    return { error: "The model did not return a readable list of interests." }
  }
}

/** Find the interests the bound vision names, keeping earlier selections and work-ups. */
export async function findProgrammeInterests(workspaceId: string) {
  const denied = await requireWriter(workspaceId)
  if (denied) return { error: denied }
  const { supabase, workspace } = await loadWorkspace(workspaceId)
  if (!workspace) return { error: "Programme not found" }
  const bindings = parseProgrammeBindings((workspace.metadata as Record<string, unknown>) || {})
  if (bindings.environmentalVisionDocumentIds.length === 0) return { error: "Mark the environmental vision among the sources first." }

  const documents = await visionPages(supabase, bindings.environmentalVisionDocumentIds)
  let found: FoundInterest[] = documents.flatMap((document) => findNumberedInterests(document.pages, document.id))
  if (found.length < 3) {
    const fromModel = await findInterestsWithModel({ workspaceId, supabase, documents })
    if ("error" in fromModel) return { error: fromModel.error }
    found = fromModel
  }
  if (found.length === 0) return { error: "No interests were found in the vision." }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const existing = (await listProgrammeInterests(workspaceId)).data
  const keyOf = (reference: string | null, label: string) => (reference ? `ref:${reference}` : `label:${label.toLowerCase()}`)
  const byKey = new Map(existing.map((interest) => [keyOf(interest.reference, interest.label), interest]))

  for (const [index, interest] of found.entries()) {
    const row = {
      reference: interest.reference,
      label: interest.label,
      summary: interest.summary,
      citations: [interest.citation],
      sort_order: index + 1,
      updated_at: new Date().toISOString(),
    }
    const match = byKey.get(keyOf(interest.reference, interest.label))
    if (match) {
      await supabase.from("programme_interests").update(row).eq("id", match.id).eq("workspace_id", workspaceId)
    } else {
      await supabase
        .from("programme_interests")
        .insert({ ...row, workspace_id: workspaceId, origin: "extracted", created_by: user?.id ?? null })
    }
  }

  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return listProgrammeInterests(workspaceId)
}

export async function setProgrammeInterestSelected(workspaceId: string, interestId: string, selected: boolean) {
  const denied = await requireWriter(workspaceId)
  if (denied) return { error: denied }
  const supabase = await createClient()
  const { error } = await supabase
    .from("programme_interests")
    .update({ selected, updated_at: new Date().toISOString() })
    .eq("id", interestId)
    .eq("workspace_id", workspaceId)
  if (error) return { error: error.message }
  return { data: { id: interestId, selected } }
}

/** Select interests by the vision's own numbers, for example from a demo pack. */
export async function selectProgrammeInterestsByReference(workspaceId: string, references: string[]) {
  const denied = await requireWriter(workspaceId)
  if (denied) return { error: denied }
  if (references.length === 0) return { data: { selected: 0 } }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_interests")
    .update({ selected: true, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .in("reference", references)
    .select("id")
  if (error) return { error: error.message }
  return { data: { selected: (data || []).length } }
}

export async function getProgrammeWorkupHeadings(workspaceId: string): Promise<{ data: WorkupHeading[]; custom: boolean }> {
  const { supabase, workspace } = await loadWorkspace(workspaceId)
  const { writingLanguageForSpace } = await import("@/lib/programme/load-writing-language")
  const language = await writingLanguageForSpace(workspace?.space_id)
  const bindings = parseProgrammeBindings((workspace?.metadata as Record<string, unknown>) || {})
  if (bindings.templateId) {
    const { data } = await supabase.from("programme_templates").select("workup_headings").eq("id", bindings.templateId).maybeSingle()
    const headings = parseWorkupHeadings(data?.workup_headings)
    if (headings.length > 0) return { data: headings, custom: true }
  }
  return { data: DEFAULT_WORKUP_HEADINGS[language], custom: false }
}

export async function saveTemplateWorkupHeadings(spaceId: string, templateId: string, headings: WorkupHeading[]) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from("programme_templates")
    .update({ workup_headings: parseWorkupHeadings(headings) })
    .eq("id", templateId)
    .eq("space_id", spaceId)
  if (error) return { error: error.message }
  revalidatePath(`/spaces/${spaceId}`)
  return { data: { templateId } }
}

export async function listTemplateWorkupHeadings(templateId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("programme_templates").select("workup_headings").eq("id", templateId).maybeSingle()
  if (error) return { error: error.message, data: [] as WorkupHeading[] }
  return { data: parseWorkupHeadings(data?.workup_headings) }
}

/** Sources a work-up may quote: every workspace document except chapters and other work-ups. */
async function workupSourceDocuments(supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string, chapterIds: string[]) {
  const { data } = await supabase
    .from("documents")
    .select("id, title, content, metadata")
    .eq("workspace_id", workspaceId)
    .neq("status", "deleted")
    .neq("status", "archived")
  const chapters = new Set(chapterIds)
  return (data || []).filter((row) => {
    if (chapters.has(row.id)) return false
    const metadata = (row.metadata as Record<string, unknown> | null) || {}
    return metadata.origin !== WORKUP_ORIGIN
  })
}

/** Draft (or redraft) the work-up of one interest under the programme structure's headings. */
export async function workUpProgrammeInterest(workspaceId: string, interestId: string) {
  const denied = await requireWriter(workspaceId)
  if (denied) return { error: denied }
  const { supabase, workspace } = await loadWorkspace(workspaceId)
  if (!workspace) return { error: "Programme not found" }
  const { data: row } = await supabase
    .from("programme_interests")
    .select("*")
    .eq("id", interestId)
    .eq("workspace_id", workspaceId)
    .maybeSingle()
  if (!row) return { error: "Interest not found" }
  const interest = mapInterestRow(row)
  const bindings = parseProgrammeBindings((workspace.metadata as Record<string, unknown>) || {})
  const headings = (await getProgrammeWorkupHeadings(workspaceId)).data

  const documents = await workupSourceDocuments(supabase, workspaceId, Object.values(bindings.chapterDocuments || {}))
  const { selectEvidenceForTask } = await import("@/lib/programme/evidence-select")
  const evidence = await selectEvidenceForTask({
    supabase,
    documents,
    query: [interest.label, interest.summary || "", ...headings.map((heading) => heading.label)].join("\n"),
    budgetChars: 40000,
  })

  const { writingLanguageForSpace } = await import("@/lib/programme/load-writing-language")
  const userLanguage = await writingLanguageForSpace(workspace.space_id)
  const { getLatestAgentVersion } = await import("@/lib/actions/agent")
  const { getTenantIdForSpace, resolveAgentVersionLlm } = await import("@/lib/llm/resolve")
  const { loadPromptLayers } = await import("@/lib/llm/prompts")
  const { compileSystemPrompt } = await import("@/lib/chat/playbook-compiler")
  const draftAgentId = resolveDraftAgentId(bindings, null)
  const agentVersion = draftAgentId ? (await getLatestAgentVersion(draftAgentId)).data : null
  const tenantId = await getTenantIdForSpace(workspace.space_id)
  let llm
  try {
    llm = await resolveAgentVersionLlm({ tenantId, spaceId: workspace.space_id, agentVersion })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not resolve the draft model" }
  }
  const layers = await loadPromptLayers("draft")
  const interestName = [interest.reference, interest.label].filter(Boolean).join(" ")
  const headingList = headings
    .map((heading, index) => `${index + 1}. ${heading.label}${heading.instruction ? ` (${heading.instruction})` : ""}`)
    .join("\n")
  const { systemPrompt } = compileSystemPrompt({
    kind: "draft",
    userLanguage,
    identity: layers.identity,
    playbookBody: agentVersion?.instructions || layers.playbook,
    citationMode: "strict",
    runtimeSections: `INTEREST WORK-UP (mandatory):
Interest: ${interestName}
${interest.summary ? `As the vision states it: ${interest.summary}` : ""}
Headings, in this order, each as a Markdown "## " heading:
${headingList}
Rules:
- Short, concrete text under every heading, grounded only in the evidence.
- When the sources say nothing for a heading, write one sentence saying so. Do not fill the gap.
- Do not invent budgets, numbers, dates, rules, or legal texts.
- Name other interests by their number when the evidence links them to this one.
- At most about 120 words per heading.`,
  })

  const { completeLlm } = await import("@/lib/llm")
  let text = ""
  try {
    const completion = await completeLlm({
      usage: { workspaceId, kind: "workup" },
      provider: llm.provider,
      endpoint: llm.endpoint,
      apiKey: llm.apiKey,
      model: llm.model,
      maxTokens: 8000,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Work up the interest "${interestName}".

Evidence (each piece shows its document id, section id, and page):
${evidence.text}

For EVERY factual claim include a structured citation [citation:{"quote":"exact text","documentId":"…","pageNumber":1}] using only the evidence document ids. Output only the Markdown headings and their text.`,
        },
      ],
    })
    text = completion.text.trim()
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The work-up could not be drafted" }
  }
  if (!text) return { error: "The model returned an empty work-up. Try again." }

  const html = markdown.render(text)
  const title = interestName
  const now = new Date().toISOString()
  let documentId = interest.workupDocumentId
  if (documentId) {
    const { error } = await supabase.from("documents").update({ content: html, title, updated_at: now }).eq("id", documentId)
    if (error) documentId = null
  }
  if (!documentId) {
    const { createWorkspaceDocument } = await import("@/lib/actions/document")
    const created = await createWorkspaceDocument(workspaceId, { title, content: html, classification: "internal" })
    if (created.error || !created.data) return { error: created.error || "Could not save the work-up" }
    documentId = String((created.data as { id: string }).id)
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const admin = createAdminClient()
    const { data: doc } = await admin.from("documents").select("metadata").eq("id", documentId).maybeSingle()
    await admin
      .from("documents")
      .update({
        metadata: { ...((doc?.metadata as Record<string, unknown>) || {}), origin: WORKUP_ORIGIN, programmeInterestId: interest.id },
      })
      .eq("id", documentId)
  }
  await supabase
    .from("programme_interests")
    .update({ workup_document_id: documentId, updated_at: now })
    .eq("id", interest.id)
    .eq("workspace_id", workspaceId)

  const { recordGenerationRun } = await import("@/lib/actions/generation-run")
  const {
    data: { user },
  } = await supabase.auth.getUser()
  await recordGenerationRun({
    workspaceId,
    kind: "draft",
    agentVersionId: agentVersion?.id ?? null,
    provider: llm.provider,
    model: llm.model,
    instructions: `Interest work-up: ${interestName}`,
    sourceDocumentIds: documents.map((document) => document.id),
    outputRef: documentId,
    citations: { evidenceCap: { used: evidence.used, total: evidence.total } },
    userId: user?.id,
  })

  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { interestId: interest.id, documentId, content: html } }
}

export async function getProgrammeInterestWorkup(workspaceId: string, interestId: string) {
  const supabase = await createClient()
  const { data: row } = await supabase
    .from("programme_interests")
    .select("workup_document_id")
    .eq("id", interestId)
    .eq("workspace_id", workspaceId)
    .maybeSingle()
  if (!row?.workup_document_id) return { data: null }
  const { data: document } = await supabase
    .from("documents")
    .select("id, title, content, updated_at")
    .eq("id", row.workup_document_id)
    .maybeSingle()
  if (!document) return { data: null }
  return {
    data: {
      documentId: document.id as string,
      title: document.title as string,
      content: (document.content as string) || "",
      updatedAt: document.updated_at as string | null,
    },
  }
}
