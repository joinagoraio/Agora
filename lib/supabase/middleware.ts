import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  // Debug: Log environment variable access
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Log for debugging (remove in production)
  console.log("[Middleware] Environment check:", {
    urlExists: !!supabaseUrl,
    keyExists: !!supabaseAnonKey,
    urlLength: supabaseUrl?.length || 0,
    keyLength: supabaseAnonKey?.length || 0,
  })

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase environment variables:")
    if (!supabaseUrl) console.error("  - NEXT_PUBLIC_SUPABASE_URL is not set")
    if (!supabaseAnonKey) console.error("  - NEXT_PUBLIC_SUPABASE_ANON_KEY is not set")
    console.error("\nPlease set these in your .env.local file or environment variables.")
    console.error("Find these values at: https://supabase.com/dashboard/project/_/settings/api")
    
    // Return a 500 error response instead of crashing
    return NextResponse.json(
      { error: "Server configuration error: Missing Supabase credentials" },
      { status: 500 }
    )
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/shared") &&
    request.nextUrl.pathname !== "/"
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (user && request.nextUrl.pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
