import { SRGBColorSpace, Texture, TextureLoader } from 'three'
import { assetUrl, hasAsset } from '../../assets/assets'
import { loadRelief } from './reliefStore'

const loader = new TextureLoader()
const cache = new Map<string, Promise<Texture>>()

export function texture(id: string): Promise<Texture> {
  let p = cache.get(id)
  if (!p) {
    const part = /^parts\/((?:blade|disc)-.+)$/.exec(id)?.[1]
    const relief = part && hasAsset(`relief/${part}`) ? loadRelief(part, () => fetch(assetUrl(`relief/${part}`)).then(r => r.json())) : null
    p = Promise.all([loader.loadAsync(assetUrl(id)), relief]).then(([t]) => {
      t.colorSpace = SRGBColorSpace
      t.anisotropy = 4
      return t
    })
    cache.set(id, p)
  }
  return p
}
