import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = '.local/device-logs'
const file = process.argv[2] ?? readdirSync(dir).map(f => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
const ip = process.env.IP
const since = process.env.SINCE ? Date.parse(process.env.SINCE) : 0
const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(l => { try { const v = JSON.parse(l); return Array.isArray(v) ? v : [v] } catch { return [] } })
  .filter(r => (!ip || String(r.ip ?? '').includes(ip)) && (!since || Date.parse(r.at ?? 0) >= since))
const pick = type => rows.filter(r => r.type === type).map(r => r.data ?? {})
const q = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null }
console.log(`${file}${ip ? ` ip~${ip}` : ''}${since ? ` since ${process.env.SINCE}` : ''}`)
for (const type of ['net.start', 'net.stats', 'net.round']) {
  const ds = pick(type)
  if (!ds.length) continue
  const keys = [...new Set(ds.flatMap(d => Object.keys(d)))].filter(k => ds.some(d => typeof d[k] === 'number'))
  console.log(`${type} (${ds.length} samples)`)
  for (const k of keys) { const xs = ds.map(d => d[k]); console.log(`  ${k.padEnd(14)} p50 ${q(xs, 0.5)}  p95 ${q(xs, 0.95)}  max ${q(xs, 1)}`) }
}
const starts = pick('net.start')
if (starts.some(d => d.transport)) console.log('transports', starts.reduce((m, d) => ({ ...m, [d.transport]: (m[d.transport] ?? 0) + 1 }), {}))
for (const t of ['net.resync', 'net.catchup', 'edge.wt-fail', 'edge.drop', 'edge.open']) { const n = rows.filter(r => r.type === t).length; if (n) console.log(`${t}: ${n}`) }
