/**
 * Request deduplication utility
 * Prevents duplicate concurrent requests from executing multiple times
 * Useful for expensive operations like API calls, database queries, etc.
 */

interface PendingRequest<T> {
  promise: Promise<T>
  timestamp: number
}

// In-memory cache for pending requests (cleaned up after completion)
const pendingRequests = new Map<string, PendingRequest<any>>()

// Cleanup interval: remove stale requests older than 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes
const MAX_REQUEST_AGE = 5 * 60 * 1000 // 5 minutes

// Start cleanup interval
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, request] of pendingRequests.entries()) {
      if (now - request.timestamp > MAX_REQUEST_AGE) {
        pendingRequests.delete(key)
      }
    }
  }, CLEANUP_INTERVAL)
}

/**
 * Generate a unique key for a request
 */
export function generateRequestKey(
  prefix: string,
  params: Record<string, any>,
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${JSON.stringify(params[key])}`)
    .join("|")
  return `${prefix}:${sortedParams}`
}

/**
 * Deduplicate a request - if the same request is already in flight, return the existing promise
 * Otherwise, execute the function and cache the promise
 */
export async function deduplicateRequest<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  // Check if request is already pending
  const existing = pendingRequests.get(key)
  if (existing) {
    return existing.promise
  }

  // Create new request
  const promise = fn()
    .then(result => {
      // Remove from pending after completion
      pendingRequests.delete(key)
      return result
    })
    .catch(error => {
      // Remove from pending on error
      pendingRequests.delete(key)
      throw error
    })

  pendingRequests.set(key, {
    promise,
    timestamp: Date.now(),
  })

  return promise
}

/**
 * Clear a specific pending request (useful for manual cleanup)
 */
export function clearPendingRequest(key: string): void {
  pendingRequests.delete(key)
}

/**
 * Clear all pending requests (useful for testing or cleanup)
 */
export function clearAllPendingRequests(): void {
  pendingRequests.clear()
}

/**
 * Get count of pending requests (useful for monitoring)
 */
export function getPendingRequestCount(): number {
  return pendingRequests.size
}

