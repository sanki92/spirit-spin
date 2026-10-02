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
