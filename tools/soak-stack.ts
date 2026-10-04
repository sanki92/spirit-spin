import { rmSync } from 'node:fs'
import { API, Bot, BUILDS, POOL, StaleTokens, tokens } from './rtbot'
import type { ServerMsg } from '../packages/core/src/index'

const MATCHES = Number(process.env.MATCHES ?? 20)
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 240000)

type Summary = { summary: { counts: { rounds: number; desyncs: number; fallbacks: number; lost: number; streamDrops: number }; byMode: Record<string, number> } }

async function match(i: number, pool: string[]): Promise<string> {
  const a = new Bot(`A${i}`, BUILDS[0]!), b = new Bot(`B${i}`, BUILDS[1]!)
  await a.connect(pool[2 * i]!)
  await b.connect(pool[2 * i + 1]!)
  a.send({ k: 'create', build: a.build })
  const room = (await a.wait('room')) as Extract<ServerMsg, { k: 'room' }>
  b.send({ k: 'join', code: room.code, build: b.build })
  await b.wait('room')
  a.send({ k: 'ready' })
  b.send({ k: 'ready' })
  const timer = setInterval(() => { a.pump(); b.pump() }, 4)
  const timeout = new Promise<ServerMsg>(r => setTimeout(() => r({ k: 'error', code: 'no-room' }), TIMEOUT_MS))
  const [ea, eb] = await Promise.all([Promise.race([a.done, timeout]), Promise.race([b.done, timeout])])
  clearInterval(timer)
  a.close()
  b.close()
  return `${i}: ${ea.k}/${eb.k} ${ea.k === 'end' ? (ea as Extract<ServerMsg, { k: 'end' }>).scores.join('-') : ''}`
}

const dash = async () => (await (await fetch(`${API}/__dev/net.json`)).json()) as Summary
const pool = await tokens(MATCHES * 2)
const before = await dash()
const results = await Promise.all(Array.from({ length: MATCHES }, (_, i) => new Promise<string>(r => setTimeout(r, i * 150)).then(() => match(i, pool)))).catch(e => {
  if (!(e instanceof StaleTokens)) throw e
  rmSync(POOL, { force: true })
  console.error(`the server rejected pooled tokens (new JWT secret?); removed ${POOL}, run again`)
  process.exit(1)
})
for (const r of results) console.log(r)
await new Promise(r => setTimeout(r, 1500))
const after = await dash()
const c0 = before.summary.counts, c1 = after.summary.counts
const out = { matches: MATCHES, finished: results.filter(r => r.includes('end/end')).length, rounds: c1.rounds - c0.rounds, desyncs: c1.desyncs - c0.desyncs, fallbacks: c1.fallbacks - c0.fallbacks, lost: c1.lost - c0.lost, streamDrops: c1.streamDrops - c0.streamDrops, byMode: after.summary.byMode }
console.log(JSON.stringify(out))
const EDGE_ONLY = process.env.EDGE === '1'
process.exit(out.desyncs === 0 && out.finished === MATCHES && out.lost === 0 && (!EDGE_ONLY || out.fallbacks === 0) ? 0 : 1)
