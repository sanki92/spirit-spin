import { describe, expect, it } from 'vitest'
import { clientIp, fromCloudflare } from './clientip'

describe('real player IP behind Cloudflare', () => {
  it('uses the Cloudflare header only when the request really came from a Cloudflare edge', () => {
    expect(clientIp({ ip: '172.70.1.5', headers: { 'cf-connecting-ip': '49.36.0.1' } })).toBe('49.36.0.1')
    expect(clientIp({ ip: '2606:4700::1', headers: { 'cf-connecting-ip': '2401:4900::7' } })).toBe('2401:4900::7')
  })

  it('ignores a forged header from anyone else, and junk values', () => {
    expect(clientIp({ ip: '49.36.0.1', headers: { 'cf-connecting-ip': '1.2.3.4' } })).toBe('49.36.0.1')
    expect(clientIp({ ip: '172.70.1.5', headers: { 'cf-connecting-ip': 'not-an-ip' } })).toBe('172.70.1.5')
    expect(clientIp({ ip: '172.70.1.5', headers: {} })).toBe('172.70.1.5')
  })

  it('recognises Cloudflare ranges and nothing else', () => {
    expect(fromCloudflare('104.16.0.1')).toBe(true)
    expect(fromCloudflare('::ffff:162.158.4.4')).toBe(true)
    expect(fromCloudflare('198.51.100.218')).toBe(false)
    expect(fromCloudflare('127.0.0.1')).toBe(false)
  })
})
