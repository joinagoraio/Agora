import { NextRequest, NextResponse } from "next/server"
import { createCsrfProtect, CsrfError } from "@edge-csrf/nextjs"

import { updateSession } from "@/lib/supabase/middleware"

const csrfProtect = createCsrfProtect({
  cookie: {
    secure: process.env.NODE_ENV === "production",
  },
})

const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])
const CSRF_TOKEN_ENDPOINT = "/api/csrf-token"

export async function middleware(request: NextRequest) {
  const sessionResponse = await updateSession(request)

  if (!(sessionResponse instanceof NextResponse)) {
    return sessionResponse
  }

  const isApiRoute = request.nextUrl.pathname.startsWith("/api/")
  const isServerActionRequest = request.headers.has("next-action")

  const shouldValidateCsrf = CSRF_METHODS.has(request.method) && isApiRoute && !isServerActionRequest
  const shouldIssueToken = request.nextUrl.pathname === CSRF_TOKEN_ENDPOINT

  if ((shouldValidateCsrf || shouldIssueToken) && isApiRoute) {
    try {
      await csrfProtect(request, sessionResponse)
    } catch (error) {
      if (error instanceof CsrfError && shouldValidateCsrf) {
        return new NextResponse("Invalid CSRF token", { status: 403 })
      }
      // If we're just issuing a token, propagate other errors so the request fails fast.
      throw error
    }
  }

  return sessionResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}

