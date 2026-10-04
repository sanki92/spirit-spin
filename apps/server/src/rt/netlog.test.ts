import { describe, expect, it } from 'vitest'
import { NetLog } from './netlog'

describe('netlog', () => {
  it('counts events, keeps the last 500 rows, summarises percentiles', () => {
    const n = new NetLog()
    for (let i = 0; i < 600; i++) n.add({ msg: 'net.round', mode: i % 2 ? 'edge' : 'node', frames: 2400, late: [i % 3, 0], missing: [0, i % 5], margins: [10 + (i % 7), 12] })
    n.add({ msg: 'net.desync', round: 3, side: 1, frame: 120 })
    n.add({ msg: 'edge.fallback' })
    n.add({ msg: 'edge.stream-end' })
    n.add({ msg: 'edge.lost' })
    n.add({ msg: 'something.else' })
    expect(n.counts).toEqual({ rounds: 600, desyncs: 1, fallbacks: 1, streamDrops: 1, lost: 1 })
    expect(n.rows()).toHaveLength(500)
    const s = n.summary()
    expect(s.byMode).toEqual({ edge: 250, node: 249 })
    expect(s.late.max).toBe(2)
    expect(s.missing.max).toBe(4)
    expect(s.margin.p50).toBeGreaterThanOrEqual(10)
    expect(n.html('edge_matches 3')).toContain('edge_matches 3')
    expect(n.html(null)).toContain('<table')
  })

  it('escapes untrusted values in the page', () => {
    const n = new NetLog()
    n.add({ msg: 'net.round', code: '<script>x</script>', mode: 'node' })
    expect(n.html(null)).not.toContain('<script>x')
    expect(n.html('edge_x 1\n<img src=x>')).not.toContain('<img')
  })
})
