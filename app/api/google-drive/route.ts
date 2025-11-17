import { type NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import { createClient } from "@/lib/supabase/server"
import { env } from "@/lib/env"

async function getValidAccessToken(
  providedToken?: string | null,
  refreshToken?: string | null,
): Promise<string | null> {
  if (providedToken) {
    return providedToken
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const googleAccessToken = user.user_metadata?.google_access_token
  if (googleAccessToken) {
    return googleAccessToken
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.provider_token) {
    return session.provider_token
  }

  return null
}

async function refreshAccessToken(refreshToken: string, supabase: any): Promise<string | null> {
  try {
    const {
      data: { session },
      error: refreshError,
    } = await supabase.auth.refreshSession()

    if (refreshError) {
      console.error("Failed to refresh Supabase session:", refreshError)
      return null
    }

    if (session?.provider_token) {
      await supabase.auth.updateUser({
        data: {
          google_access_token: session.provider_token,
          google_refresh_token: session.provider_refresh_token || refreshToken,
          google_token_expires_at: session.expires_at?.toString(),
        },
      })

      return session.provider_token
    }

    console.warn("No provider_token in refreshed session, user needs to re-authenticate")
    return null
  } catch (error) {
    console.error("Error refreshing token:", error)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get("action")
    const providedToken = searchParams.get("accessToken")
    const providedRefreshToken = searchParams.get("refreshToken")
    const folderId = searchParams.get("folderId") || "root"
    const query = searchParams.get("query")
    const fileId = searchParams.get("fileId")
    const pageToken = searchParams.get("pageToken")

    let accessToken = await getValidAccessToken(providedToken, providedRefreshToken || undefined)

    if (!accessToken) {
      return NextResponse.json({ error: "Access token is required. Please authenticate with Google." }, { status: 401 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const refreshToken = providedRefreshToken || user?.user_metadata?.google_refresh_token

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })

    const drive = google.drive({ version: "v3", auth: oauth2Client })

    const makeDriveRequest = async (requestFn: () => Promise<any>): Promise<any> => {
      try {
        return await requestFn()
      } catch (error: any) {
        const isAuthError =
          error?.code === 401 ||
          error?.response?.status === 401 ||
          error?.message?.includes("invalid authentication credentials") ||
          error?.message?.includes("Invalid Credentials") ||
          error?.message?.includes("Request had invalid authentication credentials")

        if (isAuthError && refreshToken && user) {
          console.log("Access token expired, attempting refresh...")
          const newAccessToken = await refreshAccessToken(refreshToken, supabase)

          if (newAccessToken && newAccessToken !== accessToken) {
            oauth2Client.setCredentials({ access_token: newAccessToken })
            accessToken = newAccessToken

            try {
              return await requestFn()
            } catch (retryError: any) {
              console.error("Retry after refresh also failed:", retryError)
              throw new Error(
                "AUTH_REQUIRED: Please reconnect your Google account. The access token has expired and could not be refreshed.",
              )
            }
          } else {
            throw new Error(
              "AUTH_REQUIRED: Please reconnect your Google account. The access token has expired and could not be refreshed.",
            )
          }
        }
        throw error
      }
    }

    if (action === "list") {
      const response = await makeDriveRequest(() =>
        drive.files.list({
          q: folderId === "root" ? "'root' in parents and trashed=false" : `'${folderId}' in parents and trashed=false`,
          fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink, thumbnailLink)",
          orderBy: "modifiedTime desc",
          pageSize: 50,
          pageToken: pageToken || undefined,
        }),
      )

      return NextResponse.json({
        files: response.data.files || [],
        nextPageToken: response.data.nextPageToken,
      })
    } else if (action === "search") {
      if (!query) {
        return NextResponse.json({ error: "Query parameter is required for search" }, { status: 400 })
      }

      const searchQuery = `name contains '${query.replace(/'/g, "\\'")}' and trashed=false`
      const response = await makeDriveRequest(() =>
        drive.files.list({
          q: searchQuery,
          fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink, thumbnailLink)",
          orderBy: "modifiedTime desc",
          pageSize: 50,
          pageToken: pageToken || undefined,
        }),
      )

      return NextResponse.json({
        files: response.data.files || [],
        nextPageToken: response.data.nextPageToken,
      })
    } else if (action === "download") {
      if (!fileId) {
        return NextResponse.json({ error: "File ID is required for download" }, { status: 400 })
      }

      const fileMetadata = await makeDriveRequest(() =>
        drive.files.get({
          fileId,
          fields: "id, name, mimeType, size",
        }),
      )

      const fileResponse = await makeDriveRequest(() =>
        drive.files.get(
          {
            fileId,
            alt: "media",
          },
          { responseType: "arraybuffer" },
        ),
      )

      return NextResponse.json({
        file: fileMetadata.data,
        content: Buffer.from(fileResponse.data as ArrayBuffer).toString("base64"),
      })
    } else {
      return NextResponse.json({ error: "Invalid action. Use 'list', 'search', or 'download'" }, { status: 400 })
    }
  } catch (error: any) {
    console.error("Google Drive API error:", error)

    const isAuthError =
      error?.code === 401 ||
      error?.response?.status === 401 ||
      error?.message?.includes("invalid authentication credentials") ||
      error?.message?.includes("Invalid Credentials") ||
      error?.message?.includes("Request had invalid authentication credentials") ||
      error?.message?.includes("AUTH_REQUIRED")

    if (isAuthError) {
      const errorMessage = error?.message?.includes("AUTH_REQUIRED")
        ? error.message
        : "Authentication failed. Please reconnect your Google account. The access token may have expired."

      return NextResponse.json(
        {
          error: errorMessage,
          code: "AUTH_ERROR",
        },
        { status: 401 },
      )
    }

    if (error?.code === 403) {
      return NextResponse.json(
        {
          error: "Permission denied. Please ensure you have granted the necessary permissions to access Google Drive.",
          code: "PERMISSION_ERROR",
        },
        { status: 403 },
      )
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Google Drive API request failed",
        code: error?.code || "UNKNOWN_ERROR",
        details:
          env.NODE_ENV === "development" && error instanceof Error && error.stack ? error.stack : undefined,
      },
      { status: error?.code || 500 },
    )
  }
}
