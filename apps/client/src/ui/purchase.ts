import { useSave } from '../state/save'
import { applyPurchase, authHeader, flushSave } from '../state/sync'
import { log } from '../telemetry'

export type BuyResult = 'bought' | 'owned' | 'poor' | 'offline' | 'failed'

export async function refreshEntitlements(): Promise<string[] | null> {
  try {
    const res = await fetch('/v1/entitlements', { headers: authHeader() })
    if (!res.ok) return null
    const data = (await res.json()) as { items: string[] }
    useSave.getState().setEntitlements(data.items)
    return data.items
  } catch {
    return null
  }
}

export async function buy(sku: string): Promise<{ result: BuyResult; need?: number }> {
  await flushSave().catch(() => undefined)
  try {
    const res = await fetch('/v1/store/buy', { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader() }, body: JSON.stringify({ sku }) })
    const data = (await res.json().catch(() => ({}))) as { items?: string[]; coins?: number; version?: number; need?: number; error?: string }
    if (res.ok && data.items && typeof data.coins === 'number' && typeof data.version === 'number') {
      applyPurchase(data.version, data.coins, data.items)
      log('store.bought', { sku })
      return { result: 'bought' }
    }
    if (res.status === 409 && data.items) {
      useSave.getState().setEntitlements(data.items)
      return { result: 'owned' }
    }
    if (res.status === 402) return { result: 'poor', need: data.need ?? 0 }
    return { result: 'failed' }
  } catch {
    return { result: 'offline' }
  }
}
