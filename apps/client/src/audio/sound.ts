import audioManifest from '../assets/audio.json'
import voiceFiles from '../assets/voice.json'

export type SoundId = keyof typeof audioManifest
export type Bus = 'sfx' | 'voice' | 'crowd' | 'ui'
export type CrowdLevel = 0 | 1 | 2

interface Hum { src: AudioBufferSourceNode; gain: GainNode }

const BUS_GAIN: Record<Bus, number> = { sfx: 0.8, voice: 1, crowd: 0.7, ui: 0.6 }
const BEDS = ['crowdCalm', 'crowdExcited', 'crowdRoar'] as const
const LOOP_PAD = 0.03
const voiceUrl = (id: string) => (voiceFiles as Record<string, string>)[id] ?? `/assets/audio/vo/${id}.mp3`
const CROWD_FX = new Set(['cheer', 'ooh', 'gasp', 'aww', 'roar', 'applause', 'chant'])

export class Sound {
  readonly ctx: AudioContext
  private master: GainNode
  private bus: Record<Bus, GainNode>
  private buffers = new Map<string, AudioBuffer[]>()
  private hums: [Hum | null, Hum | null] = [null, null]
  private beds: GainNode[] = []
  private bedSrcs: AudioBufferSourceNode[] = []
  private ducks = 0
  private mute = false

  get muted(): boolean {
    return this.mute
  }

  set muted(v: boolean) {
    this.mute = v
    this.master.gain.setTargetAtTime(v ? 0 : 0.9, this.ctx.currentTime, 0.05)
  }

  constructor() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx({ latencyHint: 'interactive' })
    const limiter = this.ctx.createDynamicsCompressor()
    limiter.threshold.value = -3
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.1
    limiter.connect(this.ctx.destination)
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(limiter)
    this.bus = Object.fromEntries((Object.keys(BUS_GAIN) as Bus[]).map(b => {
      const g = this.ctx.createGain()
      g.gain.value = BUS_GAIN[b]
      g.connect(this.master)
      return [b, g]
    })) as Record<Bus, GainNode>
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      const state = this.ctx.state as AudioContextState | 'interrupted'
      if (state !== 'running') void this.ctx.resume().catch(() => undefined)
    })
  }

  unlock(): void {
    if ((this.ctx.state as AudioContextState | 'interrupted') !== 'running') void this.ctx.resume().catch(() => undefined)
  }

  loadAll(): Promise<void> {
    const ids = Object.keys(audioManifest) as SoundId[]
    const late = (id: string) => id.startsWith('crowd') || CROWD_FX.has(id)
    void this.load(ids.filter(late))
    return this.load(ids.filter(id => !late(id)))
  }

  async load(ids: SoundId[]): Promise<void> {
    const manifest = audioManifest as Record<string, string[]>
    await Promise.all(
      ids.filter(id => !this.buffers.has(id)).map(async id => {
        const urls = manifest[id] ?? []
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

  has(id: SoundId): boolean {
    return this.buffers.has(id)
  }

  play(id: SoundId, opts: { volume?: number; rate?: number; at?: number; bus?: Bus } = {}): AudioBufferSourceNode | null {
    const list = this.buffers.get(id)
    if (!list || this.muted) return null
    const bus = opts.bus ?? 'sfx'
    const src = this.ctx.createBufferSource()
    src.buffer = list[Math.floor(Math.random() * list.length)] as AudioBuffer
    src.playbackRate.value = opts.rate ?? (bus === 'sfx' ? 0.96 + Math.random() * 0.08 : 1)
    const g = this.ctx.createGain()
    g.gain.value = opts.volume ?? 1
    src.connect(g).connect(this.bus[bus])
    src.start(Math.max(this.ctx.currentTime, opts.at ?? 0))
    if (bus === 'voice') this.duck(src)
    return src
  }

  react(id: SoundId, volume = 1): void {
    const at = this.ctx.currentTime + 0.1 + Math.random() * 0.2
    this.play(id, { volume, at, bus: 'crowd', rate: 0.97 + Math.random() * 0.06 })
  }

  crowd(level: CrowdLevel | null): void {
    if (level !== null && !this.beds.length && BEDS.every(b => this.buffers.has(b))) {
      for (const b of BEDS) {
        const buf = this.buffers.get(b)![0]!
        const src = this.ctx.createBufferSource()
        src.buffer = buf
        src.loop = true
        src.loopStart = LOOP_PAD
        src.loopEnd = buf.duration - LOOP_PAD
        const g = this.ctx.createGain()
        g.gain.value = 0
        src.connect(g).connect(this.bus.crowd)
        src.start(0, Math.random() * (buf.duration - 1))
        this.beds.push(g)
        this.bedSrcs.push(src)
      }
    }
    const t = this.ctx.currentTime
    this.beds.forEach((g, i) => g.gain.setTargetAtTime(level === i ? 1 : 0, t, level === null ? 0.4 : 0.6))
    if (level === null && this.bedSrcs.length) {
      const srcs = this.bedSrcs
      this.beds = []
      this.bedSrcs = []
      for (const s of srcs) s.stop(t + 2)
    }
  }

  private duck(src: AudioBufferSourceNode): void {
    const g = this.bus.crowd.gain, t = this.ctx.currentTime
    if (this.ducks++ === 0) g.setTargetAtTime(BUS_GAIN.crowd * 0.4, t, 0.08)
    src.addEventListener('ended', () => {
      if (--this.ducks === 0) g.setTargetAtTime(BUS_GAIN.crowd, this.ctx.currentTime, 0.3)
    })
  }

  hum(side: 0 | 1, spin: number): void {
    const buf = this.buffers.get('hum')?.[0]
    if (!buf) return
    let h = this.hums[side]
    if (!h && spin > 0.02) {
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.loopStart = LOOP_PAD
      src.loopEnd = buf.duration - LOOP_PAD
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      src.connect(gain).connect(this.bus.sfx)
      src.start(0, Math.random() * (buf.duration - 0.5))
      h = { src, gain }
      this.hums[side] = h
    }
    if (!h) return
    const t = this.ctx.currentTime
    if (spin <= 0.02) {
      h.gain.gain.setTargetAtTime(0, t, 0.03)
      return
    }
    h.src.playbackRate.setTargetAtTime(0.7 + spin * 0.5 + side * 0.06, t, 0.08)
    h.gain.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.3, spin * 0.32), t, 0.08)
  }

  private voices = new Map<string, Promise<AudioBuffer | null>>()
  private speaking: { src: AudioBufferSourceNode; gain: GainNode } | null = null
  private voiceGen = 0
  private voiceEnd = 0

  voiceLeftMs(): number {
    return this.speaking ? Math.max(0, this.voiceEnd - this.ctx.currentTime) * 1000 : 0
  }

  stopVoice(): void {
    this.voiceGen++
    this.hush()
  }

  private hush(): void {
    const s = this.speaking
    this.speaking = null
    if (!s) return
    const t = this.ctx.currentTime
    s.gain.gain.setTargetAtTime(0, t, 0.02)
    try { s.src.stop(t + 0.1) } catch { return }
  }

  voice(id: string, volume = 1): void {
    if (this.muted) return
    let p = this.voices.get(id)
    if (!p) {
      p = fetch(voiceUrl(id)).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? this.ctx.decodeAudioData(b) : null)).catch(() => null)
      this.voices.set(id, p)
    }
    const gen = this.voiceGen
    void p.then(buf => {
      if (!buf || this.muted || gen !== this.voiceGen) return
      this.hush()
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      const gain = this.ctx.createGain()
      gain.gain.value = volume
      src.connect(gain).connect(this.bus.voice)
      src.start()
      this.duck(src)
      this.speaking = { src, gain }
      this.voiceEnd = this.ctx.currentTime + buf.duration
      src.addEventListener('ended', () => { if (this.speaking?.src === src) this.speaking = null })
    })
  }

  preloadVoices(ids: string[]): void {
    for (const id of ids) if (!this.voices.has(id)) this.voices.set(id, fetch(voiceUrl(id)).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? this.ctx.decodeAudioData(b) : null)).catch(() => null))
  }

  stopHums(): void {
    for (const h of this.hums) if (h) h.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
  }

  perfToAudio(perfMs: number): number {
    return this.ctx.currentTime + (perfMs - performance.now()) / 1000
  }
}
