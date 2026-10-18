import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const NOISE = /"msg":"(incoming request|request completed)"/

export function actionLog(dir: string, keepDays = 14, now = () => Date.now()) {
  mkdirSync(dir, { recursive: true })
  let day = ''
  const prune = () => {
    const cutoff = new Date(now() - keepDays * 86_400_000).toISOString().slice(0, 10)
    for (const f of readdirSync(dir)) if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) < cutoff) rmSync(join(dir, f), { force: true })
  }
  const append = (line: string) => {
    const d = new Date(now()).toISOString().slice(0, 10)
    if (d !== day) { day = d; prune() }
    // sync append per line, fine at a few lines/sec; switch to a buffered stream if traffic grows
    try { appendFileSync(join(dir, `${d}.jsonl`), line.endsWith('\n') ? line : line + '\n') } catch { return }
  }
  return {
    server: { write(s: string) { process.stdout.write(s); if (!NOISE.test(s)) append(s) } },
    add(o: Record<string, unknown>) { append(JSON.stringify({ time: now(), ...o })) },
  }
}

export type ActionLog = ReturnType<typeof actionLog>
