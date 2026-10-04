import { describe, expect, it } from 'vitest'
import { USERNAME, usernameError, usernameKey } from './username'

describe('username rules', () => {
  it('accepts 3 to 16 letters, digits and underscores starting with a letter', () => {
    for (const ok of ['Shanky', 'kaze_99', 'abc', 'A'.repeat(USERNAME.max), 'Spin_Master']) expect(usernameError(ok), ok).toBeNull()
  })
  it('explains what is wrong', () => {
    expect(usernameError('ab')).toBe('short')
    expect(usernameError('a'.repeat(USERNAME.max + 1))).toBe('long')
    expect(usernameError('9lives')).toBe('start')
    expect(usernameError('_hidden')).toBe('start')
    expect(usernameError('bad name')).toBe('chars')
    expect(usernameError('emoji😀x')).toBe('chars')
    expect(usernameError('dots.no')).toBe('chars')
    expect(usernameError('double__under')).toBe('chars')
  })
  it('blocks reserved and offensive names, including disguised ones', () => {
    for (const bad of ['admin', 'Admin_1', 'support', 'SpiritSpin', 'official', 'moderator', 'fuck', 'xFuckx', 'Sh1t_head', 'bitch99']) expect(usernameError(bad), bad).toBe('blocked')
  })
  it('ignores surrounding spaces and compares case-insensitively', () => {
    expect(usernameError('  Shanky  ')).toBeNull()
    expect(usernameKey('  ShAnKy ')).toBe('shanky')
  })
})
