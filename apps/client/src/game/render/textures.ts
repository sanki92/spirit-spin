import { SRGBColorSpace, Texture, TextureLoader } from 'three'
import { assetUrl } from '../../assets/assets'

const loader = new TextureLoader()
const cache = new Map<string, Promise<Texture>>()

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
