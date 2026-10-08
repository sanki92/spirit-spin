const TINT: Record<string, number> = {
  'voltfang/storm': 0xffd84a,
  'voltfang/phantom': 0xa99cff,
  'aegiron/titan': 0xe2d36a,
  'aegiron/sage': 0x7dffc8,
  'nagara/tide': 0x62c8ff,
  'nagara/eclipse': 0x8a5cff,
  'agnyx/solar': 0xfff0a0,
  'agnyx/inferno': 0xff3a1a,
  'zephyra/gale': 0xd8fff2,
  'zephyra/eye': 0xc9b46a,
  'umbrax/nightfang': 0xff2fa8,
  'umbrax/sovereign': 0xdfe4ff,
}

export const FORM_ART = Object.keys(TINT).map(k => k.replace('/', '/awakened-')).map(k => `beasts/${k}`)

export const formTint = (art: string): number | null => {
  const m = /^beasts\/([a-z]+)\/awakened-([a-z]+)$/.exec(art)
  return (m && TINT[`${m[1]}/${m[2]}`]) ?? null
}

export const tintHex = (tint: number | null, fallback: string): string => (tint === null ? fallback : `#${tint.toString(16).padStart(6, '0')}`)
