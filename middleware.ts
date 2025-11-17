import { NextRequest, NextResponse } from "next/server"
import { createCsrfProtect } from "@edge-csrf/nextjs"

import { updateSession } from "@/lib/supabase/middleware"
import { env } from "@/lib/env"

const csrfProtect = createCsrfProtect({
  cookie: {
    secure: env.NODE_ENV === "production",
  },
})

const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

export async function middleware(request: NextRequest) {
  const sessionResponse = await updateSession(request)

  if (!(sessionResponse instanceof NextResponse)) {
    return sessionResponse
  }

  if (CSRF_METHODS.has(request.method)) {
    const csrfError = await csrfProtect(request, sessionResponse)
    if (csrfError) {
      return new NextResponse("Invalid CSRF token", { status: 403 })
    }
  }

  return sessionResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}

