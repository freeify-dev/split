import type { Context } from 'hono'
import type { ZodType } from 'zod'
import { zValidator } from '@hono/zod-validator'

export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 422 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const notFoundError = () => new ApiError(404, 'NOT_FOUND', 'Not found')
export const conflictError = (message: string) => new ApiError(409, 'CONFLICT', message)

/** Read a path param contributed by a parent mount (untyped in sub-routers). */
export function requireParam(c: Context, name: string): string {
  const value = c.req.param(name)
  if (!value) throw notFoundError()
  return value
}

export function errorResponse(c: Context, err: unknown) {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status)
  }
  console.error('unhandled error:', err)
  return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
}

/** zValidator with the standard error envelope (422 + first issue message). */
export function validate<T extends ZodType>(target: 'json' | 'query' | 'param', schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? 'Invalid input'
      return c.json({ error: { code: 'VALIDATION', message } }, 422)
    }
    return undefined
  })
}
