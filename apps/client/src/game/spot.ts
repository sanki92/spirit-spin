export interface Box { left: number; top: number; width: number; height: number }

export function unionBox(a: Box, b: Box, pad: number, screen: { w: number; h: number }): Box {
  const l = Math.max(0, Math.min(a.left, b.left) - pad)
  const t = Math.max(0, Math.min(a.top, b.top) - pad)
  const r = Math.min(screen.w, Math.max(a.left + a.width, b.left + b.width) + pad)
  const btm = Math.min(screen.h, Math.max(a.top + a.height, b.top + b.height) + pad)
  return { left: l, top: t, width: Math.max(0, r - l), height: Math.max(0, btm - t) }
}

export const cardSide = (b: Box, screenH: number): 'above' | 'below' => (b.top + b.height / 2 < screenH / 2 ? 'below' : 'above')

const CARD_GAP = 22
const CARD_H = 120

export function cardPlacement(cut: Box, screenH: number, skipBottom: number): { top: number } | { bottom: number } {
  if (cardSide(cut, screenH) === 'below') return { top: Math.max(cut.top + cut.height + CARD_GAP, skipBottom) }
  if (cut.top - CARD_GAP - CARD_H < skipBottom) return { top: skipBottom }
  return { bottom: screenH - cut.top + CARD_GAP }
}
