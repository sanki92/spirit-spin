import { WebSocketServer, WebSocket } from 'ws'

const P = { lat: +(process.env.LAT ?? 150), jit: +(process.env.JIT ?? 30), loss: +(process.env.LOSS ?? 0), every: +(process.env.SPIKE_EVERY ?? 0), spike: +(process.env.SPIKE_MS ?? 300) }
const target = process.env.TARGET ?? 'ws://127.0.0.1:8787'
const port = +(process.env.PORT ?? 8788)
const t0 = Date.now()
const delay = () => {
  const now = Date.now() - t0
  const ph = P.every > 0 ? now % P.every : Infinity
  return P.lat / 2 + Math.random() * (P.jit / 2) + (ph < P.spike ? P.spike - ph : 0) + (Math.random() < P.loss ? 200 : 0)
}
const pipe = (from, to, ready) => {
  let last = 0
  from.on('message', (data, isBinary) => {
    const at = Math.max(last, Date.now() + delay())
    last = at
    setTimeout(() => void ready.then(() => { if (to.readyState === WebSocket.OPEN) to.send(data, { binary: isBinary }) }), at - Date.now())
  })
}
new WebSocketServer({ port }).on('connection', (client, req) => {
  const up = new WebSocket(target + req.url)
  const opened = new Promise(r => up.once('open', r))
  pipe(client, up, opened)
  pipe(up, client, Promise.resolve())
  const end = () => { client.close(); up.close() }
  for (const s of [client, up]) { s.on('close', end); s.on('error', end) }
})
console.log(`netproxy :${port} -> ${target}`, P)
