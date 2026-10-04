import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('config', () => {
  it('the dashboard key must be 16+ chars', () => {
    expect(() => loadConfig({ NET_DASH_KEY: 'short', JWT_SECRET: 'j'.repeat(32) })).toThrow()
    expect(loadConfig({ NET_DASH_KEY: 'k'.repeat(16), JWT_SECRET: 'j'.repeat(32) }).netDashKey).toBe('k'.repeat(16))
    expect(loadConfig({ JWT_SECRET: 'j'.repeat(32) }).netDashKey).toBeUndefined()
  })

  it('edge mode needs a 16+ char shared secret and fills public url defaults', () => {
    expect(() => loadConfig({ RT_EDGE_GRPC: '127.0.0.1:4435', RT_EDGE_SECRET: 'short', JWT_SECRET: 'j'.repeat(32) })).toThrow(/RT_EDGE_SECRET/)
    const c = loadConfig({ RT_EDGE_GRPC: '127.0.0.1:4435', RT_EDGE_SECRET: 's'.repeat(20), JWT_SECRET: 'j'.repeat(32) })
    expect(c.edge).toEqual({ grpc: '127.0.0.1:4435', secret: 's'.repeat(20), wt: 'https://{host}:4433/wt', ws: '/edge/ws' })
    expect(loadConfig({ JWT_SECRET: 'j'.repeat(32) }).edge).toBeNull()
  })
})
