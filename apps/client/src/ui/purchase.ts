import { useSave } from '../state/save'
import { authHeader } from '../state/sync'
import { log } from '../telemetry'

interface Order { provider: 'razorpay' | 'dev'; keyId: string | null; orderId: string; amount: number; currency: string; name: string }
interface Paid { paymentId: string; signature: string }
type RazorpayCtor = new (o: Record<string, unknown>) => { open(): void; on(e: string, fn: (r: unknown) => void): void }

const post = async <T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> => {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader() }, body: JSON.stringify(body) })
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T }
}

export async function refreshEntitlements(): Promise<{ items: string[]; provider: string } | null> {
  await retryPendingPayment()
  try {
    const res = await fetch('/v1/entitlements', { headers: authHeader() })
    if (!res.ok) return null
    const data = (await res.json()) as { items: string[]; provider: string }
    useSave.getState().setEntitlements(data.items)
    return data
  } catch {
    return null
  }
}

let checkout: Promise<RazorpayCtor> | null = null
const loadCheckout = () =>
  (checkout ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve((window as unknown as { Razorpay: RazorpayCtor }).Razorpay)
    s.onerror = () => { checkout = null; reject(new Error('checkout failed to load')) }
    document.head.appendChild(s)
  }))

export type BuyResult = 'bought' | 'cancelled' | 'unavailable' | 'failed' | 'pending'
const PENDING = 'spirit.pendingPayment'

export async function retryPendingPayment(): Promise<void> {
  let pending: { orderId: string; paymentId: string; signature: string } | null = null
  try { pending = JSON.parse(localStorage.getItem(PENDING) ?? 'null') } catch { pending = null }
  if (!pending) return
  const v = await post<{ items: string[] }>('/v1/store/verify', pending).catch(() => null)
  if (!v) return
  if (v.ok) useSave.getState().setEntitlements(v.data.items)
  if (v.ok || v.status === 404 || v.status === 400) {
    try { localStorage.removeItem(PENDING) } catch { void 0 }
  }
}

export async function buy(sku: string): Promise<BuyResult> {
  try {
    const o = await post<Order & { error?: string }>('/v1/store/order', { sku })
    if (o.status === 503) return 'unavailable'
    if (!o.ok) return 'failed'
    let paid: Paid | null = null
    if (o.data.provider === 'dev') {
      const d = await post<Paid>('/v1/store/dev/pay', { orderId: o.data.orderId })
      paid = d.ok ? d.data : null
    } else {
      const Razorpay = await loadCheckout()
      paid = await new Promise<Paid | null>(resolve => {
        const rz = new Razorpay({
          key: o.data.keyId, order_id: o.data.orderId, amount: o.data.amount, currency: o.data.currency, name: 'Spirit Spin', description: o.data.name,
          theme: { color: '#3be6ff' },
          handler: (r: { razorpay_payment_id: string; razorpay_signature: string }) => resolve({ paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
          modal: { ondismiss: () => resolve(null) },
        })
        rz.open()
      })
    }
    if (!paid) return 'cancelled'
    const pending = { orderId: o.data.orderId, ...paid }
    try { localStorage.setItem(PENDING, JSON.stringify(pending)) } catch { void 0 }
    const v = await post<{ items: string[] }>('/v1/store/verify', pending).catch(() => ({ ok: false, status: 0, data: { items: [] } }))
    if (!v.ok) return v.status === 0 ? 'pending' : 'failed'
    try { localStorage.removeItem(PENDING) } catch { void 0 }
    useSave.getState().setEntitlements(v.data.items)
    log('store.bought', { sku })
    return 'bought'
  } catch (e) {
    log('store.error', { sku, error: String(e).slice(0, 80) })
    return 'failed'
  }
}
