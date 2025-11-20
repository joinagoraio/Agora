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

  const scriptSources = ["'self'", "https://va.vercel-scripts.com"]
  if (isDev) {
    scriptSources.push("'unsafe-eval'", "'unsafe-inline'", "https://vercel.live")
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
  if (isDev) {
    connectSources.push("https://vercel.live")
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    `style-src ${styleSources.join(" ")}`,
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ]

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

