interface Field { tagName: string; type?: string; value: string }
interface TypingEvent { target?: unknown; key?: string; isComposing?: boolean }
interface Listens { activeElement?: unknown; addEventListener(type: string, fn: (e: TypingEvent) => void, capture: boolean): void }
interface Scratch { value: string; setAttribute(k: string, v: string): void; style: Record<string, string> | CSSStyleDeclaration; remove(): void }
interface PageDoc { activeElement: unknown; createElement?(tag: 'input'): Scratch; body?: { appendChild(x: never): unknown } | null }

const TEXT = new Set(['text', 'search', 'email', 'url', 'tel', 'password', ''])

export function isTextField(el: unknown): el is Field {
  if (!el || typeof el !== 'object') return false
  const f = el as Partial<Field>
  if (f.tagName === 'TEXTAREA') return true
  return f.tagName === 'INPUT' && TEXT.has(f.type ?? '')
}

export function forgetTyping(el: Field): void {
  const v = el.value
  el.value = v ? '' : ' '
  el.value = v
}

export function installForgetTyping(doc: Listens): void {
  doc.addEventListener('focusout', e => { if (isTextField(e.target)) forgetTyping(e.target) }, true)
  doc.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && isTextField(e.target)) forgetTyping(e.target) }, true)
  doc.addEventListener('pointerdown', e => {
    const a = doc.activeElement
    if (a !== e.target && isTextField(a)) forgetTyping(a)
  }, true)
  doc.addEventListener('submit', e => {
    const form = e.target as { querySelectorAll?: (q: string) => ArrayLike<unknown> } | undefined
    const all = form?.querySelectorAll?.('input, textarea')
    if (all) for (let i = 0; i < all.length; i++) { const f = all[i]; if (isTextField(f)) forgetTyping(f) }
  }, true)
}

export function dropFocus(doc: PageDoc): void {
  const a = doc.activeElement as { blur?: () => void } | null
  if (isTextField(a)) a.blur?.()
  if (!doc.createElement || !doc.body) return
  const s = doc.createElement('input')
  s.setAttribute('aria-hidden', 'true')
  Object.assign(s.style, { position: 'fixed', left: '-9999px', top: '0', opacity: '0' })
  doc.body.appendChild(s as never)
  s.value = 'x'
  s.value = ''
  s.remove()
}
