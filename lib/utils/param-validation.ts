import { sanitizeUUID } from "@/lib/utils/input-sanitization"
import { ValidationError } from "@/lib/utils/errors"

/**
 * Validate that a route parameter is a well-formed UUID
 * @throws ValidationError when the value is invalid
 */
export function assertUUIDParam(value: string | undefined, name: string): string {
  const sanitized = value ? sanitizeUUID(value) : null
  if (!sanitized) {
    throw new ValidationError(`${name} must be a valid UUID`, { param: name })
  }
  return sanitized
}

/**
 * Validate multiple UUID parameters in one call
 * Returns an object with sanitized values keyed by the provided field names.
 */
export function assertUUIDParams<T extends Record<string, string | undefined>>(
  params: T,
  fields: Array<keyof T>,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const field of fields) {
    const value = params[field]
    result[field as string] = assertUUIDParam(value, field as string)
  }
  return result
}

