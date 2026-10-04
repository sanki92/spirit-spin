type Pct = { p50: number | null; p95: number | null; max: number | null }

const sum = (v: unknown) => (Array.isArray(v) ? v.reduce((a: number, x) => a + (Number(x) || 0), 0) : Number(v) || 0)
const low = (v: unknown) => (Array.isArray(v) ? Math.min(...v.map(Number)) : Number(v))
const pct = (xs: number[]): Pct => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  const at = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : null)
  return { p50: at(0.5), p95: at(0.95), max: s.length ? s[s.length - 1]! : null }
}
const esc = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export class NetLog {
  readonly counts = { rounds: 0, desyncs: 0, fallbacks: 0, streamDrops: 0, lost: 0 }
  private list: Record<string, unknown>[] = []

  add(o: Record<string, unknown>): void {
    switch (o.msg) {
      case 'net.round': this.counts.rounds++; break
      case 'net.desync': this.counts.desyncs++; break
      case 'edge.fallback': this.counts.fallbacks++; return
      case 'edge.stream-end': this.counts.streamDrops++; return
      case 'edge.lost': this.counts.lost++; return
      default: return
    }
    this.list.push({ at: Date.now(), ...o })
    if (this.list.length > 500) this.list.shift()
  }

  rows(): Record<string, unknown>[] { return this.list }

  summary() {
    const r = this.list.filter(x => x.msg === 'net.round')
    const byMode: Record<string, number> = {}
    for (const x of r) byMode[String(x.mode)] = (byMode[String(x.mode)] ?? 0) + 1
    return { counts: { ...this.counts }, rounds: r.length, byMode, late: pct(r.map(x => sum(x.late))), missing: pct(r.map(x => sum(x.missing))), margin: pct(r.map(x => low(x.margins))), frames: pct(r.map(x => Number(x.frames))) }
  }

  html(edgeMetrics: string | null): string {
    const s = this.summary()
    const cell = (p: Pct) => `${p.p50 ?? '-'} / ${p.p95 ?? '-'} / ${p.max ?? '-'}`
    const rows = this.list.slice(-60).reverse().map(x => `<tr class="${x.msg === 'net.desync' ? 'bad' : ''}"><td>${esc(new Date(Number(x.at)).toLocaleTimeString())}</td><td>${esc(x.code ?? '')}</td><td>${esc(x.msg)}</td><td>${esc(x.mode ?? '')}</td><td>${esc(x.round ?? '')}</td><td>${esc(x.frames ?? x.frame ?? '')}</td><td>${esc(JSON.stringify(x.late ?? ''))}</td><td>${esc(JSON.stringify(x.missing ?? ''))}</td><td>${esc(JSON.stringify(x.margins ?? ''))}</td></tr>`).join('')
    const edge = edgeMetrics ? `<h2>Edge</h2><pre>${esc(edgeMetrics.split('\n').filter(l => l.startsWith('edge_')).join('\n'))}</pre>` : ''
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>Netcode</title>
<style>:root{color-scheme:dark}body{font:14px system-ui,sans-serif;margin:16px;background:#0a0f24;color:#e8ecff}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}td,th{padding:4px 8px;border-bottom:1px solid #223;text-align:left}tr.bad{background:#5a1020}.k{display:inline-block;margin:0 20px 10px 0}.k b{font-size:22px;display:block}pre{white-space:pre-wrap}</style>
<h1>Netcode</h1>
<div><span class="k"><b>${s.counts.rounds}</b>rounds</span><span class="k"><b>${s.counts.desyncs}</b>desyncs</span><span class="k"><b>${s.counts.fallbacks}</b>edge fallbacks</span><span class="k"><b>${s.counts.streamDrops}</b>stream drops</span><span class="k"><b>${s.counts.lost}</b>edge lost</span></div>
<p>p50 / p95 / max: late inputs ${cell(s.late)}; missing inputs ${cell(s.missing)}; worst margin ms ${cell(s.margin)}; frames ${cell(s.frames)}; modes ${esc(JSON.stringify(s.byMode))}</p>
<table><tr><th>time</th><th>room</th><th>event</th><th>mode</th><th>round</th><th>frames</th><th>late</th><th>missing</th><th>margins</th></tr>${rows}</table>${edge}`
  }
}
