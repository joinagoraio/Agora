function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1"
}

/**
 * Browser clients must call Auth on a host the visiting machine can reach.
 * Local .env points at localhost:54321, which fails from another device on the LAN.
 * When the page is opened via a LAN hostname or IP, reuse that host on the API port.
 */
export function resolveBrowserSupabaseUrl(configured: string, pageHostname?: string): string {
  try {
    const url = new URL(configured)
    const host = pageHostname ?? (typeof window === "undefined" ? undefined : window.location.hostname)
    if (!host || isLoopbackHost(host) || !isLoopbackHost(url.hostname)) {
      return url.origin
    }
    url.hostname = host
    return url.origin
  } catch {
    return configured
  }
}
