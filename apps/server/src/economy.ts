const RULES = {
  coins: { start: 150, burst: 6000, perMin: 120 },
  shards: { start: 0, burst: 400, perMin: 10 },
  xp: { start: 0, burst: 3000, perMin: 120 },
} as const

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0)

export function limitEconomy(prev: Record<string, unknown>, next: Record<string, unknown>, prevAt: number, now: number): { save: Record<string, unknown>; clamped: string[] } {
  const minutes = Math.max(0, (now - prevAt) / 60_000)
  const fresh = Object.keys(prev).length === 0
  const out = { ...next }
  const clamped: string[] = []
  for (const [key, r] of Object.entries(RULES)) {
    const base = fresh ? r.start : num(prev[key])
    const max = Math.floor(base + r.burst + r.perMin * minutes)
    if (num(next[key]) > max) {
      out[key] = max
      clamped.push(key)
    }
  }
  return { save: out, clamped }
}
