import { type NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import { createClient } from "@/lib/supabase/server"
import {
  decryptGoogleTokenBundle,
  encryptGoogleTokenBundle,
  GOOGLE_TOKEN_METADATA_KEY,
} from "@/lib/security/googleTokens"
import { env } from "@/lib/env"
import { applyRateLimitHeaders, checkRateLimit, driveRateLimit, RateLimitStatus } from "@/lib/rate-limit"
import { getClientIdentifier } from "@/lib/utils/request"
import { logger } from "@/lib/utils/logger"

type TokenPair = {
  accessToken: string | null
  refreshToken: string | null
}

async function getValidAccessToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: any,
): Promise<TokenPair> {
  if (!user) {
    return { accessToken: null, refreshToken: null }
  }

  const tokenBundle = decryptGoogleTokenBundle(user.user_metadata?.[GOOGLE_TOKEN_METADATA_KEY])

  if (tokenBundle?.accessToken) {
    return {
      accessToken: tokenBundle.accessToken,
      refreshToken: tokenBundle.refreshToken ?? null,
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.provider_token) {
    return {
      accessToken: session.provider_token,
      refreshToken: session.provider_refresh_token ?? tokenBundle?.refreshToken ?? null,
    }
  }

  return {
    accessToken: null,
    refreshToken: tokenBundle?.refreshToken ?? null,
  }
}

async function refreshAccessToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  refreshToken: string,
): Promise<TokenPair> {
  try {
    const {
      data: { session },
      error: refreshError,
    } = await supabase.auth.refreshSession()

    if (refreshError) {
      logger.error("Failed to refresh Supabase session:", refreshError)
      return { accessToken: null, refreshToken: null }
    }

    if (session?.provider_token) {
      const latestRefreshToken = session.provider_refresh_token || refreshToken
      const encryptedBundle = encryptGoogleTokenBundle({
        accessToken: session.provider_token,
        refreshToken: latestRefreshToken,
        expiresAt: session.expires_at,
        storedAt: new Date().toISOString(),
      })

      await supabase.auth.updateUser({
        data: {
          [GOOGLE_TOKEN_METADATA_KEY]: encryptedBundle,
          google_access_token: null,
          google_refresh_token: null,
          google_token_expires_at: null,
        },
      })

      return {
        accessToken: session.provider_token,
        refreshToken: latestRefreshToken ?? refreshToken,
      }
    }

    logger.warn("No provider_token in refreshed session, user needs to re-authenticate")
    return { accessToken: null, refreshToken }
  } catch (error) {
    logger.error("Error refreshing token:", error)
    return { accessToken: null, refreshToken }
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
    const folderId = searchParams.get("folderId") || "root"
    const query = searchParams.get("query")
    const fileId = searchParams.get("fileId")
    const pageToken = searchParams.get("pageToken")

    const tokenPair = await getValidAccessToken(supabase, user)
    let accessToken = tokenPair.accessToken
    let refreshToken = tokenPair.refreshToken

    if (!accessToken) {
      return respondWithRateLimit(
        NextResponse.json(
          { error: "Access token is required. Please authenticate with Google." },
          { status: 401 },
        ),
      )
    }

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
          const refreshedTokens = await refreshAccessToken(supabase, refreshToken)

          if (refreshedTokens.accessToken && refreshedTokens.accessToken !== accessToken) {
            accessToken = refreshedTokens.accessToken
            refreshToken = refreshedTokens.refreshToken
            oauth2Client.setCredentials({ access_token: accessToken })

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
