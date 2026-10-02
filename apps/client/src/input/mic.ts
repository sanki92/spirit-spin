export class ShoutDetector {
  private analyser: AnalyserNode | null = null
  private buf = new Float32Array(1024)
  private baseline = 0.02
  private above = 0
  level = 0

  attach(ctx: AudioContext, stream: MediaStream): void {
    const src = ctx.createMediaStreamSource(stream)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    src.connect(this.analyser)
  }

  get ready(): boolean {
    return this.analyser !== null
  }

  update(dtMs: number): boolean {
    if (!this.analyser) return false
    this.analyser.getFloatTimeDomainData(this.buf)
    let sum = 0
    for (let i = 0; i < this.buf.length; i++) sum += (this.buf[i] as number) ** 2
    const rms = Math.sqrt(sum / this.buf.length)
    const threshold = Math.max(this.baseline * 4, 0.06)
    this.level = Math.min(1, rms / (threshold * 1.6))
    if (rms > threshold) this.above += dtMs
    else {
      this.above = 0
      this.baseline += (rms - this.baseline) * 0.02
    }
    if (this.above >= 400) {
      this.above = 0
      return true
    }
    return false
  }
}
