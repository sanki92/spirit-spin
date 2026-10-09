import { describe, expect, it } from 'vitest'
import type { RipFail, RipResult } from '@spirit/core'
import { practiceVerdict, timingNote } from './practice'

const rip = (quality: RipResult['quality'], overspin = false) => ({ ok: true, quality, overspin }) as RipResult
const fail = (reason: RipFail['reason']): RipFail => ({ ok: false, reason })

describe('swipe practice in training', () => {
  it('how: GOOD or better without overspin advances, anything else retries until the third try', () => {
    expect(practiceVerdict('how', rip('GOOD'), 1)).toBe('advance')
    expect(practiceVerdict('how', rip('PERFECT'), 1)).toBe('advance')
    expect(practiceVerdict('how', rip('WEAK'), 1)).toBe('retry')
    expect(practiceVerdict('how', rip('GREAT', true), 2)).toBe('retry')
    expect(practiceVerdict('how', fail('no-pull'), 2)).toBe('retry')
    expect(practiceVerdict('how', fail('no-pull'), 3)).toBe('advance')
  })

  it('when: any timed rip advances, a miss retries until the third try', () => {
    expect(practiceVerdict('when', rip('WEAK'), 1)).toBe('advance')
    expect(practiceVerdict('when', fail('too-early'), 1)).toBe('retry')
    expect(practiceVerdict('when', fail('too-late'), 2)).toBe('retry')
    expect(practiceVerdict('when', fail('no-pull'), 3)).toBe('advance')
  })

  it('explains false starts and late flicks', () => {
    expect(timingNote(fail('too-early')).title).toBe('False start')
    expect(timingNote(fail('too-late')).title).toBe('Too late')
    expect(timingNote(fail('no-pull')).title).toBe('Flick on LAUNCH')
  })
})

describe('scripted practice run', () => {
  it('weak, weak, good advances on the third how try; early then timed advances when', () => {
    const how = [rip('WEAK'), rip('WEAK'), rip('GOOD')].map((r, i) => practiceVerdict('how', r, i + 1))
    expect(how).toEqual(['retry', 'retry', 'advance'])
    const when = [fail('too-early'), rip('WEAK')].map((r, i) => practiceVerdict('when', r, i + 1))
    expect(when).toEqual(['retry', 'advance'])
  })
})
