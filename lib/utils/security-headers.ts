/**
 * Security headers configuration
 * Provides security headers for Next.js responses
 */

export interface SecurityHeaders {
  [key: string]: string
}

/**
 * Get security headers for API responses
 */
export function getSecurityHeaders(): SecurityHeaders {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Content-Security-Policy": getCSP(),
  }
}

/**
 * Get Content Security Policy
 */
function getCSP(): string {
  const isDev = process.env.NODE_ENV !== "production"

  const scriptSources = ["'self'", "'unsafe-inline'"]
  if (isDev) {
    scriptSources.push("'unsafe-eval'", "https://vercel.live", "https://va.vercel-scripts.com")
  }

  const styleSources = ["'self'"]
  if (isDev) {
    styleSources.push("'unsafe-inline'")
  }

  const connectSources = [
    "'self'",
    "https://*.supabase.co",
    "https://*.openai.com",
    "https://*.upstash.io",
  ]
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl)
      connectSources.push(parsed.origin, `wss://${parsed.host}`, `ws://${parsed.host}`)
    } catch {
      // ignore invalid URL in headers helper
    }
  }
  if (isDev) {
    connectSources.push(
      "http://localhost:54321",
      "http://127.0.0.1:54321",
      "ws://localhost:54321",
      "ws://127.0.0.1:54321",
      "https://vercel.live",
    )
  }

  const imageSources = ["'self'", "data:", "blob:", "https:"]
  if (isDev) {
    imageSources.push("http://localhost:54321", "http://127.0.0.1:54321")
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    `style-src ${styleSources.join(" ")}`,
    `img-src ${imageSources.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  if (!isDev) {
    directives.push("upgrade-insecure-requests")
  }

  return directives.join("; ")
}

/**
 * Apply security headers to NextResponse
 */
export function applySecurityHeaders(response: Response): Response {
  const headers = getSecurityHeaders()
  
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  return response
}

