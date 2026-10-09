interface Field { tagName: string; type?: string; value: string; maxLength?: number; readOnly?: boolean; disabled?: boolean; selectionStart?: number | null; selectionEnd?: number | null; setSelectionRange?(a: number, b: number): void; dispatchEvent?(e: Event): boolean }
interface TypingEvent { target?: unknown; inputType?: string; data?: string | null; isComposing?: boolean; cancelable?: boolean; defaultPrevented?: boolean; dataTransfer?: { getData(t: string): string } | null; preventDefault(): void }
interface Listens { addEventListener(type: 'beforeinput', fn: (e: TypingEvent) => void, capture: boolean): void }

const TEXT = new Set(['text', 'search', 'email', 'url', 'tel', 'password', ''])
const INSERTS = new Set(['insertText', 'insertReplacementText', 'insertFromPaste', 'insertFromDrop'])

export function isTextField(el: unknown): el is Field {
  if (!el || typeof el !== 'object') return false
  const f = el as Partial<Field>
  if (f.tagName === 'TEXTAREA') return true
  return f.tagName === 'INPUT' && TEXT.has(f.type ?? '')
}

const graphemes = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

function chars(s: string): string[] {
  return graphemes ? Array.from(graphemes.segment(s), x => x.segment) : Array.from(s)
}

function fit(s: string, room: number): string {
  let out = ''
  for (const c of chars(s)) {
    if (out.length + c.length > room) break
    out += c
  }
  return out
}

export function editText(v: string, a: number, b: number, type: string, data: string | null, max: number, singleLine = false): { value: string; caret: number } | null {
  if (INSERTS.has(type)) {
    if (data == null) return null
    const text = singleLine ? data.replace(/\r\n|\r|\n/g, ' ') : data
    const add = max >= 0 ? fit(text, Math.max(0, max - (v.length - (b - a)))) : text
    return { value: v.slice(0, a) + add + v.slice(b), caret: a + add.length }
  }
  if (a !== b && type.startsWith('delete')) return { value: v.slice(0, a) + v.slice(b), caret: a }
  if (type === 'deleteContentBackward') {
    const from = a - (chars(v.slice(0, a)).at(-1)?.length ?? 0)
    return { value: v.slice(0, from) + v.slice(a), caret: from }
  }
  if (type === 'deleteContentForward') {
    const to = a + (chars(v.slice(a))[0]?.length ?? 0)
    return { value: v.slice(0, a) + v.slice(to), caret: a }
  }
  if (type === 'deleteWordBackward') {
    const from = a - (/\S*\s*$/.exec(v.slice(0, a))?.[0].length ?? 0)
    return { value: v.slice(0, from) + v.slice(a), caret: from }
  }
  if (type === 'deleteSoftLineBackward' || type === 'deleteHardLineBackward') return { value: v.slice(a), caret: 0 }
  return null
}

function setValue(el: Field, v: string): void {
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
  if (set) set.call(el, v)
  else el.value = v
}

export function installNoUndoTyping(doc: Listens): void {
  doc.addEventListener('beforeinput', e => {
    const el = e.target
    if (e.isComposing || e.cancelable === false || e.defaultPrevented || !isTextField(el) || el.readOnly || el.disabled || el.selectionStart == null || el.selectionEnd == null) return
    const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? null
    const next = editText(el.value, el.selectionStart, el.selectionEnd, e.inputType ?? '', data, el.maxLength ?? -1, el.tagName === 'INPUT')
    if (!next) return
    e.preventDefault()
    setValue(el, next.value)
    el.setSelectionRange?.(next.caret, next.caret)
    el.dispatchEvent?.(new Event('input', { bubbles: true }))
  }, true)
}

export function dropFocus(doc: { activeElement: unknown }): void {
  const a = doc.activeElement as { blur?: () => void } | null
  if (isTextField(a)) a.blur?.()
}
