import { describe, expect, it, vi } from 'vitest'

const feeds: { stopped: boolean }[] = []
vi.mock('./audio/sound', () => ({ Sound: class { ctx = {} } }))
vi.mock('./input/mic', () => ({ ShoutDetector: class {} }))
vi.mock('./telemetry', () => ({ log: () => undefined }))
vi.mock('./input/sensors', () => ({ SensorFeed: class { stopped = false; constructor() { feeds.push(this) } start() {} stop() { this.stopped = true } } }))
vi.mock('./input/permissions', () => ({ requestAll: async () => ({ motion: false, mic: Promise.resolve(null), audio: {} }), requestMotion: async () => true, waitForMotion: async () => true }))

describe('review fixes: re-enabling motion never leaves a second feed running', () => {
  it('turning motion on twice keeps exactly one live feed', async () => {
    const { Runtime } = await import('./runtime')
    const rt = new Runtime()
    expect(await rt.enableMotion()).toBe(true)
    expect(await rt.enableMotion()).toBe(true)
    expect(feeds).toHaveLength(2)
    expect(feeds[0]!.stopped).toBe(true)
    expect(feeds[1]!.stopped).toBe(false)
    expect(rt.sensors).toBe(feeds[1])
  })
})
