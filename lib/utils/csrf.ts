/**
 * Fetch a CSRF token issued by the middleware.
 * The middleware always attaches the token to the response header.
 */
export async function fetchCsrfToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/csrf-token", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })

    const headerToken = response.headers.get("x-csrf-token")
    if (headerToken) {
      return headerToken
    }

    const data = await response.json().catch(() => null)
    if (data && typeof data.csrfToken === "string") {
      return data.csrfToken
    }
  } catch (error) {
    console.error("[CSRF] Failed to fetch CSRF token:", error)
  }

  return null
}

