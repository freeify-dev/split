import { nanoid } from 'nanoid'

/** 21 chars ≈ 126 bits of entropy — the group URL is the capability. */
export const newGroupId = (): string => nanoid(21)

/** Sub-resource ids carry no capability; 12 chars is plenty. */
export const newId = (): string => nanoid(12)
