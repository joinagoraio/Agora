/**
 * Gets the base URL for the application.
 * On the client, always uses window.location.origin (most reliable).
 * On the server, uses env vars or VERCEL_URL.
 */
export function getBaseUrl(): string {
  // Client-side: always use window.location.origin (it's always correct for the current page)
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  // Server-side: prefer env vars, then VERCEL_URL, then default
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }
  
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  
  return "http://localhost:3000"
}

