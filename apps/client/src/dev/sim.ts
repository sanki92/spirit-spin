export function installSim(): void {
  const st = { g: { x: 0, y: 7, z: 6.5 }, lin: 0, auto: true, peak: 28, ms: 140, delay: 40 }
  const w = window as unknown as Record<string, unknown>
  w.__sim = st
  Object.assign(DeviceMotionEvent, { requestPermission: async () => 'granted' })
  setInterval(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
    acceleration: { x: (Math.random() - 0.5) * 0.3, y: st.lin + (Math.random() - 0.5) * 0.3, z: (Math.random() - 0.5) * 0.3 },
    accelerationIncludingGravity: { x: st.g.x, y: st.g.y + st.lin, z: st.g.z },
    rotationRate: { alpha: 0, beta: 0, gamma: 0 }, interval: 16.7,
  })), 16.7)
  const rip = () => {
    const t0 = performance.now()
    const id = setInterval(() => {
      const u = performance.now() - t0
      st.lin = u < st.ms ? -st.peak * Math.sin((Math.PI * u) / st.ms) : u < st.ms + 110 ? st.peak * 0.8 * Math.sin((Math.PI * (u - st.ms)) / 110) : 0
      if (u > st.ms + 120) { st.lin = 0; clearInterval(id) }
    }, 8)
  }
  let armed = true
  setInterval(() => {
    const el = document.querySelector('.countdown')
    const label = el && (el.getAttribute('alt') || el.textContent)
    if (label === 'LAUNCH' && armed && st.auto) { armed = false; setTimeout(rip, st.delay); setTimeout(() => { armed = true }, 2000) }
  }, 5)
  window.addEventListener('message', async e => {
    const d = e.data as { __eval?: string; id?: number }
    if (typeof d?.__eval !== 'string' || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(e.origin)) return
    let value: unknown
    try { value = await new Function(`return (async () => { ${d.__eval} })()`)() } catch (err) { value = `ERR ${String(err)}` }
    ;(e.source as Window | null)?.postMessage({ __evalResult: true, id: d.id, value: JSON.stringify(value ?? null) }, { targetOrigin: e.origin })
  })
}
