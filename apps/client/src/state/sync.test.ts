import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../telemetry', () => ({ log: () => undefined, setLogAuth: () => undefined }))

const store = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
vi.stubGlobal('window', { setTimeout, clearTimeout })

describe('save name follows the account username', () => {
  beforeEach(() => store.clear())

  it('a stale save name is replaced once the username is known', async () => {
    const { useSave } = await import('./save')
    const { useProfile } = await import('./profile')
    await import('./sync')
    useSave.getState().setName('Spinner')
    useProfile.getState().set({ username: 'shanky' })
    expect(useSave.getState().name).toBe('shanky')
  })

  it('a remote save carrying the old name is corrected on adopt', async () => {
    const { useSave } = await import('./save')
    const { useProfile } = await import('./profile')
    const { matchName } = await import('./sync')
    useProfile.getState().set({ username: 'shanky' })
    useSave.setState({ name: 'Spinner' })
    matchName()
    expect(useSave.getState().name).toBe('shanky')
  })
})
