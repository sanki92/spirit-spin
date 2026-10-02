import { describe, expect, it } from 'vitest'
import { detectDrop } from './safety'

const series = (mags: number[]) => mags.map((mag, i) => ({ t: i * 16.7, mag }))
describe('detectDrop', () => {
  it('normal handling is none', () => expect(detectDrop(series([9.8, 10.5, 25, 9.6, 9.9]))).toBe('none'))
  it('>=100 ms near-zero gravity is freefall', () => expect(detectDrop(series([9.8, 1, 0.5, 0.8, 1.2, 0.3, 0.9, 1.1, 9.8]))).toBe('freefall'))
  it('brief dip under 100 ms is not freefall', () => expect(detectDrop(series([9.8, 1, 1, 9.8]))).toBe('none'))
  it('huge spike is impact', () => expect(detectDrop(series([9.8, 75, 9.8]))).toBe('impact'))
})
