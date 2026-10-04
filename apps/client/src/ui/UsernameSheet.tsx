import { USERNAME, usernameError } from '@spirit/core'
import { useEffect, useRef, useState } from 'react'
import { useProfile } from '../state/profile'
import { checkUsername, claimUsername, type UsernameReason } from '../state/sync'

const WHY: Record<UsernameReason | 'offline', string> = {
  short: `At least ${USERNAME.min} characters`,
  long: `${USERNAME.max} characters max`,
  start: 'Must start with a letter',
  chars: 'Letters, numbers and single underscores only',
  blocked: "That name isn't allowed",
  taken: 'Already taken. Try another',
  offline: "Can't reach the server. Try again.",
}

export function UsernameSheet({ onClose, required = false }: { onClose: () => void; required?: boolean }) {
  const current = useProfile(p => p.username)
  const [value, setValue] = useState(current ?? '')
  const [status, setStatus] = useState<{ ok: boolean; why?: UsernameReason | 'offline' } | null>(null)
  const [saving, setSaving] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    const name = value.trim()
    if (!name || name === current) return setStatus(null)
    const local = usernameError(name)
    if (local) return setStatus({ ok: false, why: local })
    setStatus(null)
    const t = window.setTimeout(() => {
      void checkUsername(name).then(r => {
        if (input.current?.value.trim() !== name) return
        setStatus(r ? { ok: r.available, ...(r.reason ? { why: r.reason } : {}) } : { ok: false, why: 'offline' })
      })
    }, 350)
    return () => window.clearTimeout(t)
  }, [value, current])
  const save = async () => {
    const name = value.trim()
    if (saving || !status?.ok) return
    setSaving(true)
    const r = await claimUsername(name)
    setSaving(false)
    if (r.ok) onClose()
    else setStatus({ ok: false, why: r.reason })
  }
  return (
    <div className="sheet-backdrop" onClick={required ? undefined : onClose}>
      <form className="sheet username-sheet" role="dialog" aria-modal="true" aria-labelledby="username-title" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); void save() }}>
        <span className="sheet-grip" aria-hidden="true" />
        {!required && <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">✕</button>}
        <h2 id="username-title">{current ? 'Change username' : 'Choose your username'}</h2>
        <p className="username-help">Friends find and invite you by this name. It must be unique.</p>
        <label className="username-field">
          <span>@</span>
          <input ref={input} value={value} onChange={e => setValue(e.target.value.replace(/\s/g, '').slice(0, USERNAME.max))} maxLength={USERNAME.max} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} aria-label="Username" aria-describedby="username-status" />
        </label>
        <p id="username-status" className={`username-status ${status ? (status.ok ? 'ok' : 'bad') : ''}`} role="status">
          {status ? (status.ok ? 'Available' : WHY[status.why ?? 'offline']) : `${USERNAME.min}–${USERNAME.max} letters, numbers or _`}
        </p>
        <button type="submit" className="slash gold" disabled={!status?.ok || saving}><span>{saving ? 'Saving…' : 'Save username'}</span></button>
      </form>
    </div>
  )
}
