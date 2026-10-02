import audioManifest from '../assets/audio.json'

export type SoundId = keyof typeof audioManifest

interface Hum { src: AudioBufferSourceNode; gain: GainNode }

export class Sound {
  readonly ctx: AudioContext
  private master: GainNode
  private buffers = new Map<string, AudioBuffer[]>()
  private hums: [Hum | null, Hum | null] = [null, null]
  muted = false

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(this.ctx.destination)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      const state = this.ctx.state as AudioContextState | 'interrupted'
      if (state !== 'running') void this.ctx.resume().catch(() => undefined)
    })
  }

  async loadAll(): Promise<void> {
    await Promise.all(
      Object.entries(audioManifest as Record<string, string[]>).map(async ([id, urls]) => {
        const decoded = await Promise.all(
          urls.map(async url => {
            try {
              const res = await fetch(url)
              return res.ok ? await this.ctx.decodeAudioData(await res.arrayBuffer()) : null
            } catch {
              return null
            }
          }),
        )
        const ok = decoded.filter((b): b is AudioBuffer => b !== null)
        if (ok.length) this.buffers.set(id, ok)
      }),
    )
  }

  play(id: SoundId, opts: { volume?: number; rate?: number; at?: number } = {}): void {
    const list = this.buffers.get(id)
    if (!list || this.muted) return
    const src = this.ctx.createBufferSource()
    src.buffer = list[Math.floor(Math.random() * list.length)] as AudioBuffer
    src.playbackRate.value = opts.rate ?? 1
    const g = this.ctx.createGain()
    g.gain.value = opts.volume ?? 1
    src.connect(g).connect(this.master)
    src.start(Math.max(this.ctx.currentTime, opts.at ?? 0))
  }

  hum(side: 0 | 1, spin: number): void {
    const buf = this.buffers.get('hum')?.[0]
    if (!buf) return
    let h = this.hums[side]
    if (!h && spin > 0.02) {
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      src.connect(gain).connect(this.master)
      src.start()
      h = { src, gain }
      this.hums[side] = h
    }
    if (!h) return
    const t = this.ctx.currentTime
    h.src.playbackRate.setTargetAtTime(0.45 + Math.max(0, spin) * 0.9 + side * 0.07, t, 0.05)
    h.gain.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.22, Math.max(0, spin) * 0.25), t, 0.08)
  }

  private voices = new Map<string, Promise<AudioBuffer | null>>()
  private speaking: AudioBufferSourceNode | null = null

  voice(id: string, volume = 1.8): void {
    if (this.muted) return
    let p = this.voices.get(id)
    if (!p) {
      p = fetch(`/assets/audio/vo/${id}.mp3`).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? this.ctx.decodeAudioData(b) : null)).catch(() => null)
      this.voices.set(id, p)
    }
    void p.then(buf => {
      if (!buf || this.muted) return
      try { this.speaking?.stop() } catch { this.speaking = null }
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      const g = this.ctx.createGain()
      g.gain.value = volume
      src.connect(g).connect(this.master)
      src.start()
      this.speaking = src
    })
  }

  stopHums(): void {
    for (const h of this.hums) if (h) h.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1)
  }

  perfToAudio(perfMs: number): number {
    return this.ctx.currentTime + (perfMs - performance.now()) / 1000
  }
}
