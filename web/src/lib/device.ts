import { useSyncExternalStore } from 'react'

/**
 * Everything this device remembers, under one localStorage key: which groups
 * it has visited and who the user claims to be in each. This is the entire
 * "account system".
 */
export interface DeviceGroupEntry {
  name: string
  claimedParticipantId: string | null
  lastVisitedAt: number
}

export interface DeviceState {
  groups: Record<string, DeviceGroupEntry>
}

const KEY = 'solomon.device.v1'
const listeners = new Set<() => void>()
let cache: DeviceState | null = null

function read(): DeviceState {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as DeviceState) : null
    cache = parsed && typeof parsed.groups === 'object' && parsed.groups !== null ? parsed : { groups: {} }
  } catch {
    cache = { groups: {} }
  }
  return cache
}

function write(state: DeviceState): void {
  cache = state
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage full/blocked — keep the in-memory copy working
  }
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      cache = null
      listeners.forEach((l) => l())
    }
  })
}

export function getDeviceState(): DeviceState {
  return read()
}

export function getClaim(groupId: string): string | null {
  return read().groups[groupId]?.claimedParticipantId ?? null
}

export function rememberGroup(groupId: string, patch: Partial<DeviceGroupEntry> & { name: string }): void {
  const state = read()
  const existing = state.groups[groupId]
  write({
    groups: {
      ...state.groups,
      [groupId]: {
        claimedParticipantId: existing?.claimedParticipantId ?? null,
        ...existing,
        ...patch,
        lastVisitedAt: Date.now(),
      },
    },
  })
}

export function claimIdentity(groupId: string, participantId: string | null): void {
  const state = read()
  const existing = state.groups[groupId]
  if (!existing) return
  write({ groups: { ...state.groups, [groupId]: { ...existing, claimedParticipantId: participantId } } })
}

export function forgetGroup(groupId: string): void {
  const state = read()
  const { [groupId]: _gone, ...rest } = state.groups
  write({ groups: rest })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDeviceState(): DeviceState {
  return useSyncExternalStore(subscribe, read, () => ({ groups: {} }))
}
