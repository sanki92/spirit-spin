import { appendFileSync } from 'node:fs'
import { Bot, BUILDS, tokens } from './rtbot'
import type { ServerMsg } from '../packages/core/src/index'

const LOG = `.local/device-logs/${new Date().toISOString().slice(0, 10)}.jsonl`
const log = (type: string, data: unknown) => appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ip: '127.0.0.1', s: 'spar', type, data }) + '\n')

const bot = new Bot('Sparring Bot', BUILDS[1]!)
const [token] = await tokens(1)
await bot.connect(token!)
bot.send({ k: 'create', build: bot.build })
const room = (await bot.wait('room')) as Extract<ServerMsg, { k: 'room' }>
console.log(`ROOM ${room.code}`)
await bot.wait('peer')
bot.send({ k: 'ready' })
let round = 0
const stats = (type: string) => {
  const d = bot.driver
  if (!d) return
  const s = d.session
  log(type, { round, transport: bot.edge ? 'ws' : 'main', frame: s.frame, confirmed: s.confirmed.frame, depth: s.depth, ...s.stats, scale: d.clock.scale, margin: 0, target: Math.round(d.clock.target), delay: s.delay, rtt: Math.round(bot.rtt), jitter: 0 })
}
bot.ws.on('message', (raw, bin) => {
  if (bin) return
  const m = JSON.parse(String(raw)) as ServerMsg
  if (m.k === 'start') { round = m.round; log('net.start', { round, transport: m.edge ? 'ws' : 'main', rtt: Math.round(bot.rtt), delay: bot.driver?.session.delay }) }
  if (m.k === 'end') stats('net.round')
})
const pump = setInterval(() => bot.pump(), 4)
const tick = setInterval(() => stats('net.stats'), 5000)
const end = await bot.done
clearInterval(pump)
clearInterval(tick)
console.log('MATCH OVER', JSON.stringify(end).slice(0, 200))
bot.close()
process.exit(0)
