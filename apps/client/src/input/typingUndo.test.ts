import { describe, expect, it } from 'vitest'
import { dropFocus, editText, installNoUndoTyping, isTextField } from './typingUndo'

function field(tagName: string, type = 'text', value = 'QD', at = value.length) {
  const fired: string[] = []
  return {
    tagName, type, value, maxLength: -1, selectionStart: at as number | null, selectionEnd: at as number | null, fired,
    setSelectionRange(a: number, b: number) { this.selectionStart = a; this.selectionEnd = b },
    dispatchEvent(e: { type: string }) { fired.push(e.type); return true },
  }
}

function beforeinput(target: unknown, inputType: string, data: string | null = null, isComposing = false, cancelable = true) {
  const e = { target, inputType, data, isComposing, cancelable, defaultPrevented: false, dataTransfer: null, prevented: false, preventDefault() { this.prevented = true } }
  return e
}

function install() {
  let fn: ((e: ReturnType<typeof beforeinput>) => void) | null = null
  installNoUndoTyping({ addEventListener: (k: string, f: never, capture: boolean) => { expect(k).toBe('beforeinput'); expect(capture).toBe(true); fn = f } })
  return (e: ReturnType<typeof beforeinput>) => fn!(e)
}

describe('typing that leaves nothing for a shake to undo', () => {
  it('applies keyboard edits as text changes', () => {
    expect(editText('QD', 2, 2, 'insertText', 'X', -1)).toEqual({ value: 'QDX', caret: 3 })
    expect(editText('QDX', 1, 1, 'insertText', '6', -1)).toEqual({ value: 'Q6DX', caret: 2 })
    expect(editText('QDXW', 1, 3, 'insertText', 'Z', -1)).toEqual({ value: 'QZW', caret: 2 })
    expect(editText('QDX', 3, 3, 'deleteContentBackward', null, -1)).toEqual({ value: 'QD', caret: 2 })
    expect(editText('QDX', 0, 0, 'deleteContentBackward', null, -1)).toEqual({ value: 'QDX', caret: 0 })
    expect(editText('QDXW', 1, 3, 'deleteContentBackward', null, -1)).toEqual({ value: 'QW', caret: 1 })
    expect(editText('QDX', 1, 1, 'deleteContentForward', null, -1)).toEqual({ value: 'QX', caret: 1 })
    expect(editText('hi there', 8, 8, 'deleteWordBackward', null, -1)).toEqual({ value: 'hi ', caret: 3 })
    expect(editText('hi there', 5, 5, 'deleteSoftLineBackward', null, -1)).toEqual({ value: 'ere', caret: 0 })
    expect(editText('ab', 2, 2, 'insertFromPaste', 'cdef', -1)).toEqual({ value: 'abcdef', caret: 6 })
  })

  it('keeps the field length limit and drops a whole emoji on backspace', () => {
    expect(editText('QD6', 3, 3, 'insertFromPaste', 'WXYZ', 4)).toEqual({ value: 'QD6W', caret: 4 })
    expect(editText('QD6W', 4, 4, 'insertText', 'X', 4)).toEqual({ value: 'QD6W', caret: 4 })
    expect(editText('a😀', 3, 3, 'deleteContentBackward', null, -1)).toEqual({ value: 'a', caret: 1 })
  })

  it('never cuts a character in half at the length limit', () => {
    expect(editText('QD6', 3, 3, 'insertFromPaste', '😀', 4)).toEqual({ value: 'QD6', caret: 3 })
    expect(editText('Q', 1, 1, 'insertFromPaste', '😀😀', 4)).toEqual({ value: 'Q😀', caret: 3 })
  })

  it('backspace removes a whole flag, skin-toned or joined emoji', () => {
    expect(editText('Cup 🇮🇳', 8, 8, 'deleteContentBackward', null, -1)).toEqual({ value: 'Cup ', caret: 4 })
    expect(editText('ok 👍🏽', 7, 7, 'deleteContentBackward', null, -1)).toEqual({ value: 'ok ', caret: 3 })
    expect(editText('👨‍👩‍👧x', 8, 8, 'deleteContentBackward', null, -1)).toEqual({ value: 'x', caret: 0 })
    expect(editText('é!', 0, 0, 'deleteContentForward', null, -1)).toEqual({ value: '!', caret: 0 })
  })

  it('a multi-line paste into a single-line field turns newlines into spaces', () => {
    expect(editText('XY', 1, 1, 'insertFromPaste', 'ab\ncd', -1, true)).toEqual({ value: 'Xab cdY', caret: 6 })
    expect(editText('XY', 1, 1, 'insertFromPaste', 'ab\r\ncd', 5, true)).toEqual({ value: 'Xab Y', caret: 4 })
  })

  it('leaves edits it cannot apply to the browser', () => {
    expect(editText('QD', 2, 2, 'insertCompositionText', 'X', -1)).toBeNull()
    expect(editText('QD', 2, 2, 'historyUndo', null, -1)).toBeNull()
    expect(editText('QD', 2, 2, 'insertText', null, -1)).toBeNull()
  })

  it('cancels the browser edit and sets the value from script', () => {
    const on = install()
    const f = field('INPUT')
    const e = beforeinput(f, 'insertText', 'X')
    on(e)
    expect(e.prevented).toBe(true)
    expect(f.value).toBe('QDX')
    expect(f.selectionStart).toBe(3)
    expect(f.fired).toEqual(['input'])
  })

  it('leaves an edit the browser will not cancel, or one already cancelled', () => {
    const on = install()
    const a = field('INPUT'), b = field('INPUT')
    const stuck = beforeinput(a, 'insertText', 'X', false, false)
    on(stuck)
    expect(a.value).toBe('QD')
    expect(a.fired).toEqual([])
    const done = { ...beforeinput(b, 'insertText', 'X'), defaultPrevented: true }
    on(done)
    expect(b.value).toBe('QD')
  })

  it('a single-line field gets spaces for pasted newlines from the listener too', () => {
    const on = install()
    const f = field('INPUT', 'text', 'XY', 1)
    on(beforeinput(f, 'insertFromPaste', 'a\nb'))
    expect(f.value).toBe('Xa bY')
  })

  it('lets composing input, non-text fields and fields without a caret through', () => {
    const on = install()
    const composing = field('INPUT'), box = field('INPUT', 'checkbox', 'on'), email = field('INPUT', 'email', 'a@b', 3)
    email.selectionStart = null
    const locked = { ...field('INPUT'), readOnly: true }
    on(beforeinput(locked, 'insertText', 'X'))
    expect(locked.fired).toEqual([])
    for (const [t, ev] of [[composing, beforeinput(composing, 'insertText', 'X', true)], [box, beforeinput(box, 'insertText', 'X')], [email, beforeinput(email, 'insertText', 'X')]] as const) {
      on(ev)
      expect(ev.prevented).toBe(false)
      expect(t.fired).toEqual([])
    }
  })

  it('only text-like fields count', () => {
    expect(isTextField(field('INPUT', 'text'))).toBe(true)
    expect(isTextField(field('INPUT', 'search'))).toBe(true)
    expect(isTextField(field('TEXTAREA', ''))).toBe(true)
    expect(isTextField(field('INPUT', 'checkbox'))).toBe(false)
    expect(isTextField(field('BUTTON', 'submit'))).toBe(false)
    expect(isTextField(null)).toBe(false)
  })

  it('opening a battle drops focus from a text field', () => {
    let blurred = 0
    dropFocus({ activeElement: { ...field('INPUT'), blur: () => { blurred++ } } })
    expect(blurred).toBe(1)
    dropFocus({ activeElement: { tagName: 'BUTTON', blur: () => { blurred++ } } })
    expect(blurred).toBe(1)
  })
})
