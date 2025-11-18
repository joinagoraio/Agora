import { type NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import { createClient } from "@/lib/supabase/server"
import { env } from "@/lib/env"
import { applyRateLimitHeaders, checkRateLimit, driveRateLimit, RateLimitStatus } from "@/lib/rate-limit"
import { getClientIdentifier } from "@/lib/utils/request"
import { logger } from "@/lib/utils/logger"

async function getValidAccessToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: any,
  providedToken?: string | null,
  refreshToken?: string | null,
): Promise<string | null> {
  if (providedToken) {
    return providedToken
  }

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
      logger.error("Failed to refresh Supabase session:", refreshError)
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

    logger.warn("No provider_token in refreshed session, user needs to re-authenticate")
    return null
  } catch (error) {
    logger.error("Error refreshing token:", error)
    return null
  }
}

export async function GET(request: NextRequest) {
  let rateLimitStatus: RateLimitStatus | undefined
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const identifier = user?.id ?? getClientIdentifier(request.headers)
    rateLimitStatus = await checkRateLimit(
      driveRateLimit,
      user ? `google-drive:user:${user.id}` : `google-drive:ip:${identifier}`,
    )
    const respondWithRateLimit = (response: NextResponse) =>
      applyRateLimitHeaders(response, rateLimitStatus)

    if (!rateLimitStatus.success) {
      return respondWithRateLimit(
        NextResponse.json({ error: "Google Drive rate limit exceeded. Please wait and try again." }, { status: 429 }),
      )
    }

    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get("action")
    const providedToken = searchParams.get("accessToken")
    const providedRefreshToken = searchParams.get("refreshToken")
    const folderId = searchParams.get("folderId") || "root"
    const query = searchParams.get("query")
    const fileId = searchParams.get("fileId")
    const pageToken = searchParams.get("pageToken")

    let accessToken = await getValidAccessToken(
      supabase,
      user,
      providedToken,
      providedRefreshToken || undefined,
    )

    if (!accessToken) {
      return respondWithRateLimit(
        NextResponse.json(
          { error: "Access token is required. Please authenticate with Google." },
          { status: 401 },
        ),
      )
    }

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
          logger.info("Access token expired, attempting refresh...")
          const newAccessToken = await refreshAccessToken(refreshToken, supabase)

          if (newAccessToken && newAccessToken !== accessToken) {
            oauth2Client.setCredentials({ access_token: newAccessToken })
            accessToken = newAccessToken

            try {
              return await requestFn()
            } catch (retryError: any) {
              logger.error("Retry after refresh also failed:", retryError)
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

      return respondWithRateLimit(
        NextResponse.json({
          files: response.data.files || [],
          nextPageToken: response.data.nextPageToken,
        }),
      )
    } else if (action === "search") {
      if (!query) {
        return respondWithRateLimit(
          NextResponse.json({ error: "Query parameter is required for search" }, { status: 400 }),
        )
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

      return respondWithRateLimit(
        NextResponse.json({
          files: response.data.files || [],
          nextPageToken: response.data.nextPageToken,
        }),
      )
    } else if (action === "download") {
      if (!fileId) {
        return respondWithRateLimit(
          NextResponse.json({ error: "File ID is required for download" }, { status: 400 }),
        )
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

      return respondWithRateLimit(
        NextResponse.json({
          file: fileMetadata.data,
          content: Buffer.from(fileResponse.data as ArrayBuffer).toString("base64"),
        }),
      )
    } else {
      return respondWithRateLimit(
        NextResponse.json({ error: "Invalid action. Use 'list', 'search', or 'download'" }, { status: 400 }),
      )
    }
  } catch (error: any) {
    logger.error("Google Drive API error:", error)

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

      return applyRateLimitHeaders(
        NextResponse.json(
          {
            error: errorMessage,
            code: "AUTH_ERROR",
          },
          { status: 401 },
        ),
        rateLimitStatus,
      )
    }

    if (error?.code === 403) {
      return applyRateLimitHeaders(
        NextResponse.json(
          {
            error: "Permission denied. Please ensure you have granted the necessary permissions to access Google Drive.",
            code: "PERMISSION_ERROR",
          },
          { status: 403 },
        ),
        rateLimitStatus,
      )
    }

    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Google Drive API request failed",
          code: error?.code || "UNKNOWN_ERROR",
          details:
            env.NODE_ENV === "development" && error instanceof Error && error.stack ? error.stack : undefined,
        },
        { status: error?.code || 500 },
      ),
      rateLimitStatus,
    )
  }
}
