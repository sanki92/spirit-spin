import type { RttStats, WireMsg } from '@spirit/core'
import { rt } from './rt'

export interface WireLink {
  readonly kind: 'main' | 'wt' | 'ws'
  readonly net: RttStats
  send(m: WireMsg): void
  on(fn: (m: WireMsg) => void): () => void
  serverNow(): number
  close(): void
}

export const mainLink: WireLink = {
  kind: 'main',
  get net() { return rt.net },
  send: m => rt.sendWire(m),
  on: fn => rt.onWire(fn),
  serverNow: () => rt.serverNow(),
  close: () => undefined,
}
