import manifest from './manifest.json'

export type AssetId = keyof typeof manifest
const entries = manifest as Record<string, { url: string; w: number; h: number }>

export function assetUrl(id: string): string {
  const e = entries[id]
  if (!e) throw new Error(`unknown asset ${id}`)
  return e.url
}

export function hasAsset(id: string): boolean {
  return id in entries
}

export function preloadImages(ids: string[]): Promise<void[]> {
  return Promise.all(
    ids.filter(hasAsset).map(
      id =>
        new Promise<void>(resolve => {
          const img = new Image()
          img.onload = img.onerror = () => resolve()
          img.src = assetUrl(id)
        }),
    ),
  )
}

export function warmImages(ids: string[], concurrency = 4): void {
  const queue = [...new Set(ids)].filter(hasAsset)
  const next = (): void => {
    const id = queue.shift()
    if (!id) return
    const img = new Image()
    img.decoding = 'async'
    img.onload = img.onerror = () => next()
    img.src = assetUrl(id)
  }
  const idle = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 300))
  idle(() => { for (let i = 0; i < concurrency; i++) next() })
}
