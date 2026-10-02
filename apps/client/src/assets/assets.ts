import { SRGBColorSpace, Texture, TextureLoader } from 'three'
import manifest from './manifest.json'

export type AssetId = keyof typeof manifest
const entries = manifest as Record<string, { url: string; w: number; h: number }>
const loader = new TextureLoader()
const cache = new Map<string, Promise<Texture>>()

export function assetUrl(id: string): string {
  const e = entries[id]
  if (!e) throw new Error(`unknown asset ${id}`)
  return e.url
}

export function hasAsset(id: string): boolean {
  return id in entries
}

export function texture(id: string): Promise<Texture> {
  let p = cache.get(id)
  if (!p) {
    p = loader.loadAsync(assetUrl(id)).then(t => {
      t.colorSpace = SRGBColorSpace
      t.anisotropy = 4
      return t
    })
    cache.set(id, p)
  }
  return p
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
