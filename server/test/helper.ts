import type { GroupDto } from '@solomon/shared'
import { createApp } from '../src/app'
import { createDb, type Db } from '../src/db/client'
import { createFxService } from '../src/services/fx'

export interface TestRequestInit extends Omit<RequestInit, 'body'> {
  json?: unknown
  actor?: string
  body?: RequestInit['body']
}

export interface TestApp {
  db: Db
  request: (path: string, init?: TestRequestInit) => Promise<Response>
  createGroup: (overrides?: Record<string, unknown>) => Promise<GroupDto>
  close: () => void
}

/** Tests never touch the real network: the default FX fetcher always fails. */
const offlineFetch: typeof fetch = async () => {
  throw new Error('network disabled in tests')
}

export function makeTestApp(opts: { fxFetch?: typeof fetch } = {}): TestApp {
  const { db, sqlite } = createDb(':memory:')
  const fx = createFxService(db, { fetchImpl: opts.fxFetch ?? offlineFetch })
  const app = createApp(db, fx)

  const request = async (path: string, init: TestRequestInit = {}) => {
    const { json, actor, ...rest } = init
    const headers = new Headers(rest.headers)
    let body = rest.body
    if (json !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(json)
    }
    if (actor) headers.set('x-solomon-actor', actor)
    return app.request(path, { ...rest, headers, body })
  }

  return {
    db,
    request,
    createGroup: async (overrides = {}) => {
      const res = await request('/api/groups', {
        method: 'POST',
        json: {
          name: 'Ski Trip',
          currency: 'EUR',
          participants: [{ name: 'Ana' }, { name: 'Ben' }, { name: 'Cleo' }],
          ...overrides,
        },
      })
      if (res.status !== 201) throw new Error(`createGroup failed: ${res.status} ${await res.text()}`)
      return (await res.json()) as GroupDto
    },
    close: () => sqlite.close(),
  }
}
