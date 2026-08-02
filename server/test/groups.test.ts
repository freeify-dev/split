import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ActivityPageDto, ApiErrorBody, GroupDto } from '@solomon/shared'
import { makeTestApp, type TestApp } from './helper'

let t: TestApp
beforeEach(() => {
  t = makeTestApp()
})
afterEach(() => t.close())

describe('groups API', () => {
  it('creates a group with participants', async () => {
    const group = await t.createGroup()
    expect(group.id).toHaveLength(21)
    expect(group.currency).toBe('EUR')
    expect(group.participants.map((p) => p.name)).toEqual(['Ana', 'Ben', 'Cleo'])
    expect(group.participants.every((p) => p.id.length === 12)).toBe(true)
  })

  it('fetches a group by id and 404s on unknown ids', async () => {
    const group = await t.createGroup()
    const found = await t.request(`/api/groups/${group.id}`)
    expect(found.status).toBe(200)
    expect(((await found.json()) as GroupDto).name).toBe('Ski Trip')

    const missing = await t.request('/api/groups/doesnotexist0000000000')
    expect(missing.status).toBe(404)
    expect(((await missing.json()) as ApiErrorBody).error.code).toBe('NOT_FOUND')
  })

  it('renames a group and allows currency change while empty', async () => {
    const group = await t.createGroup()
    const res = await t.request(`/api/groups/${group.id}`, {
      method: 'PATCH',
      json: { name: 'Summer Trip', currency: 'USD' },
    })
    expect(res.status).toBe(200)
    const updated = (await res.json()) as GroupDto
    expect(updated.name).toBe('Summer Trip')
    expect(updated.currency).toBe('USD')
  })

  it('rejects invalid group creation', async () => {
    const res = await t.request('/api/groups', {
      method: 'POST',
      json: { name: '', currency: 'EUR', participants: [] },
    })
    expect(res.status).toBe(422)
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('VALIDATION')
  })

  it('rejects duplicate participant names at creation', async () => {
    const res = await t.request('/api/groups', {
      method: 'POST',
      json: { name: 'Trip', currency: 'EUR', participants: [{ name: 'Ana' }, { name: 'ana' }] },
    })
    expect(res.status).toBe(422)
  })

  it('deletes a group', async () => {
    const group = await t.createGroup()
    const del = await t.request(`/api/groups/${group.id}`, { method: 'DELETE' })
    expect(del.status).toBe(204)
    expect((await t.request(`/api/groups/${group.id}`)).status).toBe(404)
  })

  // Regression: deleting a group that has expenses used to fail with
  // "FOREIGN KEY constraint failed". expense_payers and expense_splits
  // reference participants with ON DELETE RESTRICT, and SQLite enforced that
  // before the expense cascade had cleared the referencing rows — so a group
  // became undeletable the moment anyone added an expense to it. The test above
  // never caught it because the group it deletes is empty.
  it('deletes a group that has expenses', async () => {
    const group = await t.createGroup()
    const [ana, ben] = group.participants
    const expense = await t.request(`/api/groups/${group.id}/expenses`, {
      method: 'POST',
      actor: ana!.id,
      json: {
        description: 'Dinner',
        amount: 3000,
        currency: 'EUR',
        date: '2026-07-20',
        splitMode: 'equal',
        paidBy: ana!.id,
        splits: [{ participantId: ana!.id }, { participantId: ben!.id }],
      },
    })
    expect(expense.status).toBe(201)

    const del = await t.request(`/api/groups/${group.id}`, { method: 'DELETE' })
    expect(del.status).toBe(204)
    expect((await t.request(`/api/groups/${group.id}`)).status).toBe(404)
  })
})

describe('participants API', () => {
  it('adds a participant, rejecting duplicate names', async () => {
    const group = await t.createGroup()
    const added = await t.request(`/api/groups/${group.id}/participants`, { method: 'POST', json: { name: 'Dana' } })
    expect(added.status).toBe(201)

    const dup = await t.request(`/api/groups/${group.id}/participants`, { method: 'POST', json: { name: 'Ana' } })
    expect(dup.status).toBe(409)
    expect(((await dup.json()) as ApiErrorBody).error.code).toBe('CONFLICT')
  })

  it('renames a participant', async () => {
    const group = await t.createGroup()
    const ana = group.participants[0]!
    const res = await t.request(`/api/groups/${group.id}/participants/${ana.id}`, {
      method: 'PATCH',
      json: { name: 'Anastasia' },
    })
    expect(res.status).toBe(200)
    const reloaded = (await (await t.request(`/api/groups/${group.id}`)).json()) as GroupDto
    expect(reloaded.participants.map((p) => p.name)).toContain('Anastasia')
  })

  it('removes an unreferenced participant', async () => {
    const group = await t.createGroup()
    const cleo = group.participants[2]!
    const res = await t.request(`/api/groups/${group.id}/participants/${cleo.id}`, { method: 'DELETE' })
    expect(res.status).toBe(204)
    const reloaded = (await (await t.request(`/api/groups/${group.id}`)).json()) as GroupDto
    expect(reloaded.participants).toHaveLength(2)
  })

  it('404s for a participant from another group', async () => {
    const groupA = await t.createGroup()
    const groupB = await t.createGroup({ name: 'Other' })
    const res = await t.request(`/api/groups/${groupB.id}/participants/${groupA.participants[0]!.id}`, {
      method: 'PATCH',
      json: { name: 'X' },
    })
    expect(res.status).toBe(404)
  })
})

describe('activity API', () => {
  it('records creation and membership changes with actor attribution', async () => {
    const group = await t.createGroup()
    const ana = group.participants[0]!
    await t.request(`/api/groups/${group.id}/participants`, { method: 'POST', json: { name: 'Dana' }, actor: ana.id })

    const res = await t.request(`/api/groups/${group.id}/activity`)
    expect(res.status).toBe(200)
    const page = (await res.json()) as ActivityPageDto
    expect(page.items.length).toBeGreaterThanOrEqual(2)
    expect(page.items[0]!.summary).toBe('Added Dana')
    expect(page.items[0]!.actorParticipantId).toBe(ana.id)
    expect(page.nextBefore).toBeNull()
  })

  it('ignores actor headers from other groups', async () => {
    const groupA = await t.createGroup()
    const groupB = await t.createGroup({ name: 'Other' })
    await t.request(`/api/groups/${groupB.id}/participants`, {
      method: 'POST',
      json: { name: 'Zed' },
      actor: groupA.participants[0]!.id,
    })
    const page = (await (await t.request(`/api/groups/${groupB.id}/activity`)).json()) as ActivityPageDto
    expect(page.items[0]!.actorParticipantId).toBeNull()
  })

  it('paginates with before cursor', async () => {
    const group = await t.createGroup()
    for (let i = 0; i < 5; i++) {
      await t.request(`/api/groups/${group.id}/participants`, { method: 'POST', json: { name: `P${i}` } })
    }
    const firstPage = (await (await t.request(`/api/groups/${group.id}/activity?limit=3`)).json()) as ActivityPageDto
    expect(firstPage.items).toHaveLength(3)
    expect(firstPage.nextBefore).not.toBeNull()
    const secondPage = (await (
      await t.request(`/api/groups/${group.id}/activity?limit=3&before=${firstPage.nextBefore}`)
    ).json()) as ActivityPageDto
    expect(secondPage.items.length).toBeGreaterThanOrEqual(1)
    expect(secondPage.items.every((i) => i.id < firstPage.nextBefore!)).toBe(true)
  })
})

describe('healthz', () => {
  it('reports ok', async () => {
    const res = await t.request('/healthz')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
