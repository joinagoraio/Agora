/**
 * Input sanitization utilities
 * Provides functions to sanitize user inputs and prevent XSS attacks
 */

import DOMPurify from "dompurify"
import { JSDOM } from "jsdom"

// Create a JSDOM instance for server-side DOMPurify
const window = new JSDOM("").window
const purify = DOMPurify(window as any)

/**
 * Sanitize HTML content
 */
export function sanitizeHTML(html: string, options?: DOMPurify.Config): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "span",
      "div",
      "strong",
      "em",
      "u",
      "b",
      "i",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "a",
      "blockquote",
      "code",
      "pre",
    ],
    ALLOWED_ATTR: ["class", "style", "href", "target", "rel", "id"],
    ALLOW_DATA_ATTR: false,
    ...options,
  })
}

/**
 * Sanitize plain text (removes all HTML)
 */
export function sanitizeText(text: string): string {
  return purify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
}

/**
 * Sanitize URL
 */
export function sanitizeURL(url: string): string {
  try {
    const parsed = new URL(url)
    // Only allow http and https protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return ""
    }
    return parsed.toString()
  } catch {
    return ""
  }
}

/**
 * Sanitize file name
 */
export function sanitizeFileName(fileName: string): string {
  // Remove path traversal attempts and dangerous characters
  return fileName
    .replace(/\.\./g, "") // Remove ..
    .replace(/[\/\\]/g, "_") // Replace / and \ with _
    .replace(/[<>:"|?*]/g, "_") // Replace dangerous characters
    .trim()
    .substring(0, 255) // Limit length
}

/**
 * Sanitize search query
 */
export function sanitizeSearchQuery(query: string): string {
  // Remove potential SQL injection patterns
  return query
    .replace(/['";\\]/g, "") // Remove quotes and backslashes
    .trim()
    .substring(0, 500) // Limit length
}

/**
 * Validate and sanitize UUID
 */
export function sanitizeUUID(uuid: string): string | null {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidRegex.test(uuid)) {
    return uuid.toLowerCase()
  }
  return null
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const sanitized = email.trim().toLowerCase()
  if (emailRegex.test(sanitized) && sanitized.length <= 254) {
    return sanitized
  }
  return null
}

/**
 * Sanitize workspace/space name
 */
export function sanitizeName(name: string): string {
  return name
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/[<>:"|?*\/\\]/g, "") // Remove dangerous characters
    .trim()
    .substring(0, 255) // Limit length
}

