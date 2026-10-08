import { describe, expect, it } from 'vitest'
import { dropFocus, forgetTyping, installForgetTyping, isTextField } from './typingUndo'

function field(tagName: string, type = 'text', value = 'qd6w') {
  const sets: string[] = []
  let v = value
  return {
    tagName, type, sets,
    get value() { return v },
    set value(x: string) { sets.push(x); v = x },
  }
}

type Ev = { target?: unknown; key?: string; isComposing?: boolean }
function fakeDoc(active: unknown = null) {
  const handlers: Record<string, (e: Ev) => void> = {}
  return { handlers, activeElement: active, addEventListener: (k: string, fn: (e: Ev) => void, capture: boolean) => { expect(capture).toBe(true); handlers[k] = fn } }
}

describe('forget typing so a shake has nothing to undo', () => {
  it('sets the value from script twice and ends on the original', () => {
    const f = field('INPUT')
    forgetTyping(f)
    expect(f.sets).toEqual(['', 'qd6w'])
    expect(f.value).toBe('qd6w')
  })

  it('a field the user emptied is still reset from script', () => {
    const f = field('INPUT', 'text', '')
    forgetTyping(f)
    expect(f.sets).toEqual([' ', ''])
    expect(f.value).toBe('')
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

  it('tapping a button while a field is focused forgets that field', () => {
    const f = field('INPUT')
    const d = fakeDoc(f)
    installForgetTyping(d)
    d.handlers.pointerdown!({ target: { tagName: 'BUTTON' } })
    expect(f.sets).toEqual(['', 'qd6w'])
    d.handlers.pointerdown!({ target: f })
    expect(f.sets).toHaveLength(2)
  })

  it('submitting a form forgets every text field in it', () => {
    const a = field('INPUT'), b = field('TEXTAREA', ''), c = field('INPUT', 'checkbox', 'on')
    const d = fakeDoc()
    installForgetTyping(d)
    d.handlers.submit!({ target: { tagName: 'FORM', querySelectorAll: () => [a, b, c] } })
    expect(a.sets).toEqual(['', 'qd6w'])
    expect(b.sets).toEqual(['', 'qd6w'])
    expect(c.sets).toEqual([])
  })

  it('Enter while an input method is composing is left alone', () => {
    const d = fakeDoc()
    installForgetTyping(d)
    const f = field('INPUT')
    d.handlers.keydown!({ target: f, key: 'Enter', isComposing: true })
    expect(f.sets).toEqual([])
  })

  it('opening a battle blurs a focused field and wipes page typing history with a scratch field', () => {
    let blurred = 0, removed = 0
    const active = { ...field('INPUT'), blur: () => { blurred++ } }
    const scratch = field('INPUT', 'text', '')
    const appended: unknown[] = []
    const doc = {
      activeElement: active,
      createElement: () => Object.assign(scratch, { remove: () => { removed++ }, style: {} as Record<string, string>, setAttribute: () => undefined }),
      body: { appendChild: (x: unknown) => { appended.push(x) } },
    }
    dropFocus(doc)
    expect(blurred).toBe(1)
    expect(appended).toEqual([scratch])
    expect(scratch.sets).toEqual(['x', ''])
    expect(removed).toBe(1)
  })
})
