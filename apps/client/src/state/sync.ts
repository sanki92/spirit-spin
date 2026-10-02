import { log } from '../telemetry'
import { useSave, type SaveData } from './save'

const AUTH_KEY = 'spirit.auth'
interface Auth { token: string; playerId: string; recoveryCode: string | null; version: number }

let auth: Auth | null = null
let timer = 0
let inflight = false
let applyingRemote = false

function loadAuth(): Auth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    return raw ? (JSON.parse(raw) as Auth) : null
  } catch {
    return null
  }
}

function storeAuth(a: Auth): void {
  auth = a
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(a))
  } catch {
    return
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(path, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(auth ? { authorization: `Bearer ${auth.token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, data: (await res.json().catch(() => ({}))) as T }
}

const snapshot = (): SaveData => {
  const s = useSave.getState() as unknown as Record<string, unknown>
  return Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function')) as unknown as SaveData
}

function adopt(remote: Record<string, unknown>, version: number): void {
  applyingRemote = true
  useSave.setState(remote as Partial<SaveData>)
  applyingRemote = false
  storeAuth({ ...(auth as Auth), version })
}

export async function reauth(): Promise<void> {
  try {
    localStorage.removeItem(AUTH_KEY)
  } catch {
    return
  }
  auth = null
  const g = await api<{ token: string; playerId: string; recoveryCode: string }>('POST', '/v1/auth/guest')
  if (g.status === 200) storeAuth({ ...g.data, version: 0 })
}

export function authHeader(): Record<string, string> {
  return auth ? { authorization: `Bearer ${auth.token}` } : {}
}

export function recoveryCode(): string | null {
  return auth?.recoveryCode ?? null
}

export async function startSync(): Promise<void> {
  auth = loadAuth()
  try {
    if (!auth) {
      const g = await api<{ token: string; playerId: string; recoveryCode: string }>('POST', '/v1/auth/guest')
      if (g.status !== 200) return log('sync.guest-failed', { status: g.status })
      storeAuth({ ...g.data, version: 0 })
      log('sync.guest', { playerId: g.data.playerId })
    }
    const me = await api<{ version: number; save: Record<string, unknown> }>('GET', '/v1/me')
    if (me.status === 401) {
      localStorage.removeItem(AUTH_KEY)
      auth = null
      return startSync()
    }
    if (me.status === 200 && me.data.version > (auth as Auth).version && Object.keys(me.data.save).length) {
      const local = snapshot()
      if (((me.data.save.xp as number) ?? 0) >= local.xp) adopt(me.data.save, me.data.version)
      else storeAuth({ ...(auth as Auth), version: me.data.version })
    }
    useSave.subscribe(() => {
      if (applyingRemote) return
      clearTimeout(timer)
      timer = window.setTimeout(() => void push(), 2000)
    })
    void push()
  } catch (e) {
    log('sync.offline', { error: String(e) })
  }
}

async function push(): Promise<void> {
  if (!auth || inflight) return
  inflight = true
  try {
    const local = snapshot()
    const r = await api<{ version: number; save?: Record<string, unknown> }>('PUT', '/v1/save', { baseVersion: auth.version, save: local })
    if (r.status === 200) storeAuth({ ...auth, version: r.data.version })
    else if (r.status === 409 && r.data.save) {
      if (((r.data.save.xp as number) ?? 0) > local.xp) adopt(r.data.save, r.data.version)
      else {
        storeAuth({ ...auth, version: r.data.version })
        inflight = false
        return push()
      }
    } else if (r.status === 401) {
      await reauth()
      inflight = false
      return push()
    } else log('sync.push-failed', { status: r.status })
  } catch (e) {
    log('sync.offline', { error: String(e) })
  } finally {
    inflight = false
  }
}

export async function recover(code: string): Promise<boolean> {
  const r = await api<{ token: string; playerId: string }>('POST', '/v1/auth/recover', { code })
  if (r.status !== 200) return false
  storeAuth({ token: r.data.token, playerId: r.data.playerId, recoveryCode: code.toUpperCase(), version: 0 })
  const me = await api<{ version: number; save: Record<string, unknown> }>('GET', '/v1/me')
  if (me.status === 200) adopt(me.data.save, me.data.version)
  return true
}
