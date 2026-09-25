"use server"

import { createClient } from "@/lib/supabase/server"
import { listProgrammeChapters } from "@/lib/actions/programme"
import { spaceCost, type SpaceCost } from "@/lib/llm/usage"
import { isSuperAdmin } from "@/lib/llm/resolve"
import { ENOUGH_MEASURES_PER_INTEREST, type TourFacts } from "@/lib/programme/demo-tour"

/** What has been done in a programme so far, so the tour knows which steps are finished. */
export async function getTourFacts(workspaceId: string): Promise<{ data: TourFacts; cost: SpaceCost | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const empty = { data: {} as TourFacts, cost: null }
  if (!user) return empty

  const count = async (table: string, apply?: (query: any) => any) => {
    let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId)
    if (apply) query = apply(query)
    const { count: total } = await query
    return total ?? 0
  }

  const [{ data: workspace }, { data: interests }, { data: measures }, chapters] = await Promise.all([
    supabase.from("workspaces").select("space_id, metadata").eq("id", workspaceId).maybeSingle(),
    supabase.from("programme_interests").select("id, selected, workup_document_id").eq("workspace_id", workspaceId),
    supabase.from("programme_measures").select("id, interest_ids, decision, priority, role_check").eq("workspace_id", workspaceId),
    listProgrammeChapters(workspaceId),
  ])
  if (!workspace) return empty

  const metadata = (workspace.metadata as Record<string, unknown> | null) || {}
  const bindings = (metadata.programmeBindings as Record<string, unknown> | undefined) || {}
  const chosen = (interests || []).filter((interest) => interest.selected)
  const perInterest = new Map<string, number>()
  for (const id of (measures || []).flatMap((measure) => (measure.interest_ids as string[] | null) || [])) {
    perInterest.set(id, (perInterest.get(id) ?? 0) + 1)
  }
  const chapterRows = chapters.data || []

  const [analysis, coherence, coherenceDecided, comments, themes, freezes, publications, consultations, responses, redrafts, digests] =
    await Promise.all([
      count("analysis_reports", (query) => query.eq("report_type", "existing_policy")),
      count("programme_coherence_findings"),
      count("programme_coherence_findings", (query) => query.not("decision", "is", null)),
      count("programme_comments"),
      count("programme_comment_themes"),
      count("programme_freezes"),
      count("programme_publications", (query) => query.is("revoked_at", null)),
      count("programme_consultations"),
      count("consultation_comments"),
      count("programme_jobs", (query) => query.eq("kind", "chapter").eq("status", "done")),
      count("demo_digests"),
    ])

  const facts: TourFacts = {
    setup: bindings.setupComplete ? 1 : 0,
    analysis,
    interests: (interests || []).length,
    chosen: chosen.length,
    workups: chosen.filter((interest) => interest.workup_document_id).length,
    measuredInterests: chosen.filter((interest) => (perInterest.get(interest.id) ?? 0) >= ENOUGH_MEASURES_PER_INTEREST).length,
    measures: (measures || []).length,
    decided: (measures || []).filter((measure) => measure.decision).length,
    dropped: (measures || []).filter((measure) => measure.decision === "drop").length,
    prioritised: (measures || []).filter((measure) => measure.priority).length,
    rolesChecked: (measures || []).filter((measure) => measure.role_check).length,
    coherence,
    coherenceDecided,
    effects: Array.isArray(metadata.effectsCheckedIds) ? metadata.effectsCheckedIds.length : 0,
    chapters: chapterRows.length,
    chaptersWritten: chapterRows.filter((chapter) => chapter.drafted).length,
    reviewRequested: chapterRows.filter((chapter) => chapter.workflowStatus === "in_review" || chapter.workflowStatus === "approved").length,
    approved: chapterRows.filter((chapter) => chapter.workflowStatus === "approved").length,
    allApproved: chapterRows.length > 0 && chapterRows.every((chapter) => chapter.workflowStatus === "approved") ? 1 : 0,
    redrafts,
    comments,
    themes,
    freezes,
    publications,
    consultations,
    responses,
    digests,
  }
  const cost = (await isSuperAdmin(user.id)) && workspace.space_id ? await spaceCost(workspace.space_id as string) : null
  return { data: facts, cost }
}
