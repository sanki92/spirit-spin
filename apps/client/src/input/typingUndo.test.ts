import { describe, expect, it } from 'vitest'
import { forgetTyping, installForgetTyping, isTextField } from './typingUndo'

function field(tagName: string, type = 'text', value = 'qd6w') {
  const sets: string[] = []
  let v = value
  return {
    tagName, type, sets,
    get value() { return v },
    set value(x: string) { sets.push(x); v = x },
  }
}

function fakeDoc() {
  type Ev = { target?: unknown; key?: string }
  const handlers: Record<string, (e: Ev) => void> = {}
  return { handlers, addEventListener: (k: string, fn: (e: Ev) => void, capture: boolean) => { expect(capture).toBe(true); handlers[k] = fn } }
}

describe('forget typing so a shake has nothing to undo', () => {
  it('sets the value from script twice and ends on the original', () => {
    const f = field('INPUT')
    forgetTyping(f)
    expect(f.sets).toEqual(['', 'qd6w'])
    expect(f.value).toBe('qd6w')
  })

  it('an empty field is left alone', () => {
    const f = field('INPUT', 'text', '')
    forgetTyping(f)
    expect(f.sets).toEqual([])
  })

  it('only text-like fields count', () => {
    expect(isTextField(field('INPUT', 'text'))).toBe(true)
    expect(isTextField(field('INPUT', 'search'))).toBe(true)
    expect(isTextField(field('INPUT', 'email'))).toBe(true)
    expect(isTextField(field('TEXTAREA', ''))).toBe(true)
    expect(isTextField(field('INPUT', 'checkbox'))).toBe(false)
    expect(isTextField(field('INPUT', 'range'))).toBe(false)
    expect(isTextField(field('BUTTON', 'submit'))).toBe(false)
    expect(isTextField(null)).toBe(false)
  })

  it('clears on leaving a field and on Enter, not on other keys', () => {
    const d = fakeDoc()
    installForgetTyping(d)
    const f = field('INPUT')
    d.handlers.focusout!({ target: f })
    expect(f.sets).toEqual(['', 'qd6w'])
    d.handlers.keydown!({ target: f, key: 'a' })
    expect(f.sets).toHaveLength(2)
    d.handlers.keydown!({ target: f, key: 'Enter' })
    expect(f.sets).toHaveLength(4)
    const box = field('INPUT', 'checkbox', 'on')
    d.handlers.focusout!({ target: box })
    expect(box.sets).toEqual([])
  })
})
