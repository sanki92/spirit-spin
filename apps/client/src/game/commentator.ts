import type { Sound } from '../audio/sound'
import { useHud } from '../state/hud'
import bank from './commentary.json'

export type Cue = keyof typeof bank
export type Face = 'hyped' | 'laughing' | 'pointing' | 'serious' | 'shocked' | 'thumbs-up'

export class Announcer {
  private last = 0
  private lastClash = 0
  private turn = new Map<Cue, number>()
  private timer = 0

  constructor(private sound: Sound, private enabled: () => boolean) {}

  preload(): void {
    if (this.enabled()) this.sound.preloadVoices(Object.values(bank).flatMap(lines => lines.map(l => l.id)))
  }

  say(cue: Cue, force = false): void {
    if (!this.enabled()) return
    const now = performance.now()
    if (!force && now - this.last < 1800) return
    if (cue === 'clash') {
      if (now - this.lastClash < 6000) return
      this.lastClash = now
    }
    const lines = bank[cue]
    const i = this.turn.get(cue) ?? Math.floor(Math.random() * lines.length)
    this.turn.set(cue, (i + 1) % lines.length)
    const line = lines[i % lines.length]!
    this.last = now
    useHud.getState().set({ announcer: { id: line.id, text: line.text, face: line.face as Face } })
    this.sound.voice(line.id)
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => {
      if (useHud.getState().announcer?.id === line.id) useHud.getState().set({ announcer: null })
    }, Math.max(1600, line.text.length * 55))
  }

  stop(): void {
    clearTimeout(this.timer)
    this.sound.stopVoice()
    useHud.getState().set({ announcer: null })
  }

  dispose(): void {
    this.stop()
  }
}
