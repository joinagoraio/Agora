import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { syncAllScopeDocumentsToWorkspace } from "@/lib/services/scope-documents"

/**
 * Admin API endpoint to manually trigger sync of space documents to workspaces
 * 
 * GET: Returns a summary of what would be synced (dry run)
 * POST: Actually performs the sync
 * 
 * This is useful for:
 * - Recovering from failed syncs
 * - Backfilling after RLS policy fixes
 * - Testing the sync mechanism
 */

export async function GET() {
  try {
    const adminClient = createAdminClient()

    // Get all workspaces with their spaces
    const { data: workspaces, error: workspacesError } = await adminClient
      .from("workspaces")
      .select(`
        id,
        name,
        space_id,
        spaces:space_id (
          id,
          name
        )
      `)
      .not("space_id", "is", null)

    if (workspacesError) {
      console.error("[AdminSync] Error fetching workspaces:", workspacesError)
      return NextResponse.json(
        { error: "Failed to fetch workspaces" },
        { status: 500 }
      )
    }

    // Get all public space documents
    const { data: spaceDocuments, error: spaceDocsError } = await adminClient
      .from("space_items")
      .select("id, space_id, classification, visibility, payload->title")
      .eq("item_type", "document")
      .or("classification.eq.public,visibility.eq.public")

    if (spaceDocsError) {
      console.error("[AdminSync] Error fetching space documents:", spaceDocsError)
      return NextResponse.json(
        { error: "Failed to fetch space documents" },
        { status: 500 }
      )
    }

    // Group by space
    const spaceDocCounts = spaceDocuments?.reduce((acc: Record<string, number>, doc: any) => {
      acc[doc.space_id] = (acc[doc.space_id] || 0) + 1
      return acc
    }, {})

    // Calculate what would be synced
    const syncSummary = workspaces?.map((workspace: any) => ({
      workspace_id: workspace.id,
      workspace_name: workspace.name,
      space_id: workspace.space_id,
      space_name: workspace.spaces?.name,
      documents_to_sync: spaceDocCounts?.[workspace.space_id] || 0,
    }))

    return NextResponse.json({
      summary: {
        total_workspaces: workspaces?.length || 0,
        total_space_documents: spaceDocuments?.length || 0,
        total_syncs_needed: syncSummary?.reduce((sum: number, w: any) => sum + w.documents_to_sync, 0) || 0,
      },
      workspaces: syncSummary,
      note: "This is a dry run. Use POST to actually perform the sync.",
    })
  } catch (error) {
    console.error("[AdminSync] GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { workspace_id, space_id } = body

    const adminClient = createAdminClient()

    // If specific workspace/space provided, sync just that one
    if (workspace_id && space_id) {
      console.log(`[AdminSync] Syncing space ${space_id} to workspace ${workspace_id}`)
      
      const { syncedCount } = await syncAllScopeDocumentsToWorkspace(
        space_id,
        workspace_id,
        adminClient
      )

      return NextResponse.json({
        success: true,
        synced: {
          space_id,
          workspace_id,
          document_count: syncedCount,
        },
      })
    }

    // Otherwise, sync all workspaces
    console.log("[AdminSync] Syncing all workspaces...")

    const { data: workspaces, error: workspacesError } = await adminClient
      .from("workspaces")
      .select("id, name, space_id")
      .not("space_id", "is", null)

    if (workspacesError) {
      console.error("[AdminSync] Error fetching workspaces:", workspacesError)
      return NextResponse.json(
        { error: "Failed to fetch workspaces" },
        { status: 500 }
      )
    }

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No workspaces found to sync",
        synced: [],
      })
    }

    const results: any[] = []
    const errors: any[] = []

    for (const workspace of workspaces) {
      try {
        console.log(`[AdminSync] Syncing workspace ${workspace.id} (${workspace.name})`)
        
        const { syncedCount } = await syncAllScopeDocumentsToWorkspace(
          workspace.space_id,
          workspace.id,
          adminClient
        )

        results.push({
          workspace_id: workspace.id,
          workspace_name: workspace.name,
          space_id: workspace.space_id,
          documents_synced: syncedCount,
          status: "success",
        })
      } catch (syncError) {
        console.error(`[AdminSync] Failed to sync workspace ${workspace.id}:`, syncError)
        errors.push({
          workspace_id: workspace.id,
          workspace_name: workspace.name,
          space_id: workspace.space_id,
          error: syncError instanceof Error ? syncError.message : String(syncError),
          status: "failed",
        })
      }
    }

    const successCount = results.length
    const failureCount = errors.length

    return NextResponse.json({
      success: failureCount === 0,
      summary: {
        total_workspaces: workspaces.length,
        successful: successCount,
        failed: failureCount,
        total_documents_synced: results.reduce((sum, r) => sum + r.documents_synced, 0),
      },
      results: [...results, ...errors],
    })
  } catch (error) {
    console.error("[AdminSync] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

