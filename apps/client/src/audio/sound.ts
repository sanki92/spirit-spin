export type SoundId =
  | 'tick' | 'launch' | 'rip' | 'clash' | 'clashHeavy' | 'wall' | 'ringout' | 'shatter' | 'spirit' | 'spinDown'
  | 'finish' | 'victory' | 'defeat' | 'ui' | 'callout' | 'hesitate'

export class Sound {
  readonly ctx: AudioContext
  private master: GainNode
  private buffers = new Map<string, AudioBuffer>()
  private musicNode: AudioBufferSourceNode | null = null
  muted = false

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(this.ctx.destination)
  }

  async load(map: Record<string, string>): Promise<void> {
    await Promise.all(
      Object.entries(map).map(async ([id, url]) => {
        try {
          const res = await fetch(url)
          if (!res.ok) return
          this.buffers.set(id, await this.ctx.decodeAudioData(await res.arrayBuffer()))
        } catch {
          return
        }
      }),
    )
  }

  play(id: SoundId | string, opts: { volume?: number; rate?: number; at?: number } = {}): void {
    const buf = this.buffers.get(id)
    if (!buf || this.muted) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = opts.rate ?? 1
    const g = this.ctx.createGain()
    g.gain.value = opts.volume ?? 1
    src.connect(g).connect(this.master)
    src.start(opts.at ?? 0)
  }

  music(id: string, volume = 0.35): void {
    this.musicNode?.stop()
    const buf = this.buffers.get(id)
    if (!buf) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const g = this.ctx.createGain()
    g.gain.value = volume
    src.connect(g).connect(this.master)
    src.start()
    this.musicNode = src
  }

  nowMs(): number {
    return this.ctx.currentTime * 1000
  }

  perfToAudio(perfMs: number): number {
    return this.ctx.currentTime + (perfMs - performance.now()) / 1000
  }
}
