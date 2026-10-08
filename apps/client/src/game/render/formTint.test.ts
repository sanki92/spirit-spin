import { describe, expect, it } from 'vitest'
import { FORM_ART, formTint } from './formTint'

describe('awakened form tint', () => {
  it('has a colour for each of the 12 forms', () => {
    expect(FORM_ART.length).toBe(12)
    const seen = new Set<number>()
    for (const art of FORM_ART) { const c = formTint(art); expect(c, art).not.toBeNull(); seen.add(c!) }
    expect(seen.size).toBe(12)
  })
  it('is null for base art and unknown forms', () => {
    expect(formTint('beasts/voltfang')).toBeNull()
    expect(formTint('beasts/umbrax/awakened-nope')).toBeNull()
    expect(formTint('')).toBeNull()
  })
})
