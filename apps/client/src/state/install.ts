import { create } from 'zustand'
import { log } from '../telemetry'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type IosBrowser = 'safari' | 'chrome' | 'other' | 'inapp'

const SNOOZE_KEY = 'spirit-install-snooze'
const SNOOZE_MS = 7 * 86400_000

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
const iosBrowser: IosBrowser | null = !ios ? null
  : /FBAN|FBAV|Instagram|Line\/|Snapchat|GSA\/|LinkedInApp|WhatsApp/i.test(ua) ? 'inapp'
  : /CriOS/.test(ua) ? 'chrome'
  : /FxiOS|EdgiOS|OPiOS/.test(ua) ? 'other'
  : /Safari\//.test(ua) ? 'safari' : 'inapp'

const standalone = () => typeof window !== 'undefined' && ((navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)

function snoozed(): boolean {
  try { return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) ?? 0) } catch { return false }
}

interface InstallState {
  prompt: InstallPromptEvent | null
  installed: boolean
  hidden: boolean
  guide: boolean
  iosBrowser: IosBrowser | null
  install(): Promise<void>
  snooze(): void
  openGuide(): void
  closeGuide(): void
}

export const useInstall = create<InstallState>((set, get) => ({
  prompt: null,
  installed: standalone(),
  hidden: snoozed(),
  guide: false,
  iosBrowser,
  async install() {
    const e = get().prompt
    if (!e) return
    set({ prompt: null })
    await e.prompt()
    const { outcome } = await e.userChoice
    log('install.choice', { outcome })
    if (outcome === 'dismissed') set({ hidden: true })
  },
  snooze() {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)) } catch { }
    set({ hidden: true, guide: false })
  },
  openGuide: () => set({ guide: true }),
  closeGuide: () => set({ guide: false }),
}))

export const canOfferInstall = (s: InstallState): 'android' | 'ios' | null =>
  s.installed || s.hidden ? null : s.prompt ? 'android' : s.iosBrowser ? 'ios' : null

export function captureInstallEvents(): void {
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    useInstall.setState({ prompt: e as InstallPromptEvent })
  })
  addEventListener('appinstalled', () => {
    log('install.done')
    useInstall.setState({ installed: true, prompt: null, guide: false })
  })
}
