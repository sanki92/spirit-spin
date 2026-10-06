import type { Sound } from '../audio/sound'

const CLICKABLE = 'button, [role="button"], [role="tab"], [role="radio"], a[href]'

export function installClickSound(sound: Sound): void {
  document.addEventListener('click', e => {
    const el = (e.target as Element | null)?.closest?.(CLICKABLE)
    if (!el || el.matches(':disabled, [aria-disabled="true"], [data-silent]') || el.closest('.battle-screen')) return
    sound.play('ui', { volume: 0.45, rate: 0.97 + Math.random() * 0.06 })
  }, { capture: true })
}
