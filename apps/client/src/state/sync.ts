import { log, setLogAuth } from '../telemetry'
import { useProfile, type Invite } from './profile'
import { useSave, type SaveData } from './save'

const AUTH_KEY = 'spirit.auth'
interface Auth { token: string; playerId: string; recoveryCode: string | null; version: number }

let auth: Auth | null = null
let timer = 0
let inflight = false
let applyingRemote = false
let signedOut = false
let suspended = false

interface Me { version: number; save: Record<string, unknown>; token?: string; username?: string | null; friendCode?: string }

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
  const data = (await res.json().catch(() => ({}))) as T
  const d = data as { error?: string; reason?: string }
  if (res.status === 403 && d.error === 'banned') useProfile.getState().set({ banned: d.reason || 'This account is suspended.' })
  if (res.status === 401 && d.error === 'signed-out') signOut()
  return { status: res.status, data }
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
  matchName()
}

export function matchName(): void {
  const u = useProfile.getState().username
  if (u && useSave.getState().name !== u) useSave.getState().setName(u)
}
useProfile.subscribe(matchName)
setLogAuth(authHeader)

export function signOut(): void {
  if (signedOut) return
  signedOut = true
  clearTimeout(timer)
  auth = null
  applyingRemote = true
  useSave.getState().reset()
  applyingRemote = false
  for (const k of [AUTH_KEY, 'spirit.save']) {
    try {
      localStorage.removeItem(k)
    } catch {
      continue
    }
  }
  useProfile.getState().set({ signedOut: true, loaded: false, username: null, friendCode: null, invites: [] })
  log('sync.signed-out', {})
}

export async function reauth(): Promise<boolean> {
  if (signedOut) return false
  const prev = auth ?? loadAuth()
  const code = prev?.recoveryCode ?? null
  if (code) {
    const r = await api<{ token: string; playerId: string }>('POST', '/v1/auth/recover', { code })
    if (r.status === 200) {
      storeAuth({ token: r.data.token, playerId: r.data.playerId, recoveryCode: code, version: prev?.version ?? 0 })
      log('sync.recovered', {})
      return true
    }
    if (r.status !== 404) {
      log('sync.recover-deferred', { status: r.status })
      return false
    }
  }
  const g = await api<{ token: string; playerId: string; recoveryCode: string }>('POST', '/v1/auth/guest')
  if (g.status === 200) {
    storeAuth({ ...g.data, version: 0 })
    return true
  }
  return false
}

export function authHeader(): Record<string, string> {
  return auth ? { authorization: `Bearer ${auth.token}` } : {}
}

export function authToken(): string | null {
  return auth?.token ?? null
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
      if (!auth) storeAuth({ ...g.data, version: 0 })
      log('sync.guest', { playerId: g.data.playerId })
    }
    let me = await api<Me>('GET', '/v1/me')
    if (me.status === 401) {
      if (!(await reauth())) return
      me = await api<Me>('GET', '/v1/me')
    }
    if (me.status === 200) useProfile.getState().set({ loaded: true, username: me.data.username ?? null, friendCode: me.data.friendCode ?? null })
    if (me.status === 200 && me.data.token) storeAuth({ ...(auth as Auth), token: me.data.token })
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
  if (!auth || inflight || signedOut || suspended) return
  inflight = true
  try {
    const local = snapshot()
    const r = await api<{ version: number; save?: Record<string, unknown>; clamped?: string[] }>('PUT', '/v1/save', { baseVersion: auth.version, save: local })
    if (r.status === 200 && r.data.clamped && r.data.save) adopt(r.data.save, r.data.version)
    else if (r.status === 200) storeAuth({ ...auth, version: r.data.version })
    else if (r.status === 409 && r.data.save) {
      if (((r.data.save.xp as number) ?? 0) > local.xp) adopt(r.data.save, r.data.version)
      else {
        storeAuth({ ...auth, version: r.data.version })
        inflight = false
        return push()
      }
    } else if (r.status === 401) {
      inflight = false
      if (await reauth()) return push()
      return
    } else log('sync.push-failed', { status: r.status })
  } catch (e) {
    log('sync.offline', { error: String(e) })
  } finally {
    inflight = false
  }
}

export function suspendSync(reason: string): void {
  suspended = true
  clearTimeout(timer)
  if (auth) void api('POST', '/v1/security/flag', { reason }).catch(() => undefined)
}

export async function flushSave(): Promise<void> {
  clearTimeout(timer)
  await push()
}

export function applyPurchase(version: number, coins: number, items: string[]): void {
  applyingRemote = true
  useSave.setState({ coins })
  useSave.getState().setEntitlements(items)
  applyingRemote = false
  if (auth) storeAuth({ ...auth, version })
}

export async function recover(code: string): Promise<boolean> {
  const r = await api<{ token: string; playerId: string }>('POST', '/v1/auth/recover', { code })
  if (r.status !== 200) return false
  signedOut = false
  useProfile.getState().set({ signedOut: false })
  storeAuth({ token: r.data.token, playerId: r.data.playerId, recoveryCode: code.toUpperCase(), version: 0 })
  const me = await api<Me>('GET', '/v1/me')
  if (me.status === 200) {
    adopt(me.data.save, me.data.version)
    useProfile.getState().set({ loaded: true, username: me.data.username ?? null, friendCode: me.data.friendCode ?? null })
  }
  return true
}

export type UsernameReason = 'short' | 'long' | 'start' | 'chars' | 'blocked' | 'taken'

export async function checkUsername(username: string): Promise<{ available: boolean; reason?: UsernameReason } | null> {
  const r = await api<{ available: boolean; reason?: UsernameReason }>('GET', `/v1/username/check?username=${encodeURIComponent(username)}`).catch(() => null)
  return r && r.status === 200 ? r.data : null
}

export async function claimUsername(username: string): Promise<{ ok: true; username: string } | { ok: false; reason: UsernameReason | 'offline' }> {
  const r = await api<{ username?: string; error?: string; reason?: UsernameReason }>('POST', '/v1/username', { username }).catch(() => null)
  if (!r) return { ok: false, reason: 'offline' }
  if (r.status === 200 && r.data.username) {
    useProfile.getState().set({ username: r.data.username })
    return { ok: true, username: r.data.username }
  }
  return { ok: false, reason: r.status === 409 ? 'taken' : r.data.reason ?? 'offline' }
}

export async function fetchInvites(): Promise<Invite[] | null> {
  if (!auth) return null
  const r = await api<{ challenges: Invite[] }>('GET', '/v1/challenges').catch(() => null)
  return r && r.status === 200 ? r.data.challenges : null
}

export interface ServerMatch { id: string; at: number; opponent: string; opponentBeast: string | null; beast: string | null; scores: [number, number]; won: boolean; rounds: { winner: 0 | 1 | null; finish: string }[] }

export async function fetchHistory(): Promise<ServerMatch[] | null> {
  if (!auth) return null
  const r = await api<{ matches: ServerMatch[] }>('GET', '/v1/history').catch(() => null)
  return r && r.status === 200 ? r.data.matches : null
}

export async function declineInvite(from: string): Promise<void> {
  await api('POST', '/v1/challenges/decline', { from }).catch(() => undefined)
}
