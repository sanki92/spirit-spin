import type { Sound, SoundId } from '../audio/sound'

const CLICKABLE = 'button, [role="button"], [role="tab"], [role="radio"], [role="switch"], a[href], input[type="checkbox"]'

const soundFor = (el: Element): SoundId =>
  el.matches('.h3-claim, .h2-claim, .claim') ? 'reward'
    : el.matches('[aria-label="Back"], [aria-label="Close"], .stadium-back') ? 'uiBack'
      : el.matches('[role="tab"]') ? 'uiTab'
        : el.matches('[role="switch"], input[type="checkbox"]') ? 'uiToggle'
          : 'ui'

export function installClickSound(sound: Sound): void {
  void sound.load(['ui', 'uiBack', 'uiTab', 'uiToggle', 'reward'])
  document.addEventListener('click', e => {
    const el = (e.target as Element | null)?.closest?.(CLICKABLE)
    if (!el || el.matches(':disabled, [aria-disabled="true"], [data-silent]') || (el.closest('.battle-screen') && !el.closest('.lesson, .lesson-skip'))) return
    sound.unlock()
    sound.play(soundFor(el), { volume: 0.8, bus: 'ui', rate: 0.98 + Math.random() * 0.04 })
  }, { capture: true })
}
