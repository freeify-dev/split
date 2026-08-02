export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong'
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  json?: unknown
  actor?: string | null
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.json !== undefined) headers['content-type'] = 'application/json'
  if (opts.actor) headers['x-solomon-actor'] = opts.actor

  let res: Response
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
    })
  } catch {
    throw new ApiClientError(0, 'OFFLINE', 'You appear to be offline — try again once you have a connection')
  }

  if (res.status === 204) return undefined as T
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const body = data as { error?: { code?: string; message?: string } } | null
    throw new ApiClientError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `Request failed (${res.status})`,
    )
  }
  return data as T
}
