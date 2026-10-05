import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, utimesSync } from 'node:fs'
import { join } from 'node:path'

const HASHED = /-[A-Za-z0-9_-]{8,}\.(js|css)$/

export function archiveBuild(dist: string, archive: string, keepDays = 30): { added: number; pruned: number } {
  const src = join(dist, 'assets')
  const dst = join(archive, 'assets')
  mkdirSync(dst, { recursive: true })
  const now = new Date()
  const current = new Set(existsSync(src) ? readdirSync(src).filter(f => HASHED.test(f)) : [])
  let added = 0, pruned = 0
  for (const f of current) {
    const to = join(dst, f)
    if (!existsSync(to)) { copyFileSync(join(src, f), to); added++ }
    utimesSync(to, now, now)
  }
  const cutoff = now.getTime() - keepDays * 86400_000
  for (const f of readdirSync(dst)) {
    if (current.has(f)) continue
    const p = join(dst, f)
    if (statSync(p).mtimeMs < cutoff) { unlinkSync(p); pruned++ }
  }
  return { added, pruned }
}
