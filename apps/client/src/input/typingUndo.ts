interface Field { tagName: string; type?: string; value: string }
interface Listens { addEventListener(type: string, fn: (e: { target?: unknown; key?: string }) => void, capture: boolean): void }

const TEXT = new Set(['text', 'search', 'email', 'url', 'tel', 'password', ''])

export function isTextField(el: unknown): el is Field {
  if (!el || typeof el !== 'object') return false
  const f = el as Partial<Field>
  if (f.tagName === 'TEXTAREA') return true
  return f.tagName === 'INPUT' && TEXT.has(f.type ?? '')
}

export function forgetTyping(el: Field): void {
  const v = el.value
  if (!v) return
  el.value = ''
  el.value = v
}

export function installForgetTyping(doc: Listens): void {
  doc.addEventListener('focusout', e => { if (isTextField(e.target)) forgetTyping(e.target) }, true)
  doc.addEventListener('keydown', e => { if (e.key === 'Enter' && isTextField(e.target)) forgetTyping(e.target) }, true)
}

export function dropFocus(doc: { activeElement: unknown }): void {
  const a = doc.activeElement as { blur?: () => void } | null
  if (isTextField(a)) a.blur?.()
}
