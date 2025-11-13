import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { syncSource } from "@/lib/actions/source"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> },
) {
  try {
    const { connectorId } = await params
    const body = await req.json()
    const { testConnection = false } = body

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get source details
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("*")
      .eq("id", connectorId)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 })
    }

    // Test connection based on source type
    let testResult: { success: boolean; message: string; error?: string }

    switch (source.type) {
      case "google_drive":
        // Test Google Drive connection
        if (!source.config?.access_token) {
          testResult = {
            success: false,
            message: "Connection test failed",
            error: "Missing access token",
          }
        } else {
          try {
            const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
              headers: {
                Authorization: `Bearer ${source.config.access_token}`,
              },
            })
            if (response.ok) {
              testResult = {
                success: true,
                message: "Connection successful",
              }
            } else {
              testResult = {
                success: false,
                message: "Connection test failed",
                error: `Google API returned ${response.status}`,
              }
            }
          } catch (error) {
            testResult = {
              success: false,
              message: "Connection test failed",
              error: error instanceof Error ? error.message : "Unknown error",
            }
          }
        }
        break

      case "overheid_nl":
        // Test overheid.nl SRU API
        try {
          const testQuery = "keyword=test"
          const response = await fetch(
            `https://repository.overheid.nl/sru?operation=searchRetrieve&version=1.2&query=${testQuery}&maximumRecords=1`,
            {
              headers: {
                Accept: "application/xml",
              },
            },
          )
          if (response.ok) {
            testResult = {
              success: true,
              message: "Connection successful",
            }
          } else {
            testResult = {
              success: false,
              message: "Connection test failed",
              error: `SRU API returned ${response.status}`,
            }
          }
        } catch (error) {
          testResult = {
            success: false,
            message: "Connection test failed",
            error: error instanceof Error ? error.message : "Unknown error",
          }
        }
        break

      default:
        testResult = {
          success: true,
          message: "Connection test not implemented for this source type",
        }
    }

    // If testConnection is false, also try to sync
    if (!testConnection && testResult.success) {
      const syncResult = await syncSource(connectorId)
      if (syncResult.error) {
        testResult = {
          success: false,
          message: "Sync failed",
          error: syncResult.error,
        }
      } else {
        testResult = {
          success: true,
          message: syncResult.message || "Sync completed successfully",
        }
      }
    }

    return NextResponse.json(testResult)
  } catch (error) {
    console.error("[v0] Connector test API error:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Connection test failed",
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    )
  }
}
