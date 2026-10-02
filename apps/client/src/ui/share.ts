import { assetUrl, hasAsset } from '../assets/assets'

const load = (id: string) =>
  new Promise<HTMLImageElement | null>(resolve => {
    if (!hasAsset(id)) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = assetUrl(id)
  })

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height)
  ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s)
}

function fit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, maxW: number, maxH: number) {
  const s = Math.min(maxW / img.width, maxH / img.height)
  ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s)
}

export interface ShareCard { won: boolean; score: string; beastArt: string; lines: string[]; color: string }

export async function renderShareCard(c: ShareCard): Promise<Blob | null> {
  await Promise.all([document.fonts?.load("88px 'Bebas Neue'"), document.fonts?.load("600 40px 'Rajdhani'")]).catch(() => undefined)
  const W = 1080, H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const [bg, logo, banner, beast] = await Promise.all([load('backgrounds/share'), load('ui/logo'), load(c.won ? 'ui/banner-victory' : 'ui/banner-defeat'), load(`${c.beastArt}/summon`)])
  ctx.fillStyle = '#070b1f'
  ctx.fillRect(0, 0, W, H)
  if (bg) cover(ctx, bg, W, H)
  const shade = ctx.createLinearGradient(0, 0, 0, H)
  shade.addColorStop(0, 'rgba(7,11,31,0.35)')
  shade.addColorStop(0.55, 'rgba(7,11,31,0.55)')
  shade.addColorStop(1, 'rgba(7,11,31,0.95)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 640, 40, W / 2, 640, 520)
  glow.addColorStop(0, `${c.color}66`)
  glow.addColorStop(1, `${c.color}00`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  if (beast) fit(ctx, beast, W / 2, 640, 900, 780)
  if (logo) fit(ctx, logo, W / 2, 130, 560, 220)
  if (banner) fit(ctx, banner, W / 2, 1000, 1000, 340)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e6ecff'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 12
  ctx.font = "104px 'Bebas Neue', sans-serif"
  ctx.fillText(c.score, W / 2, 1170)
  ctx.font = "600 40px 'Rajdhani', sans-serif"
  c.lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, 1235 + i * 50))
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'))
}

export async function shareCard(c: ShareCard): Promise<'shared' | 'downloaded' | 'failed'> {
  const blob = await renderShareCard(c)
  if (!blob) return 'failed'
  const file = new File([blob], 'spirit-spin.png', { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Spirit Spin', text: c.score })
      return 'shared'
    } catch {
      return 'failed'
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'spirit-spin.png'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return 'downloaded'
}
