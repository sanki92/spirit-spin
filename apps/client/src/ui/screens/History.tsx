import { useEffect, useMemo, useState } from 'react'
import { BEASTS } from '../../game/beasts'
import { useSave, type HistoryEntry } from '../../state/save'
import { fetchHistory } from '../../state/sync'
import { Img, Screen, TopBar } from '../kit'

type Filter = 'all' | 'story' | 'live' | 'ranked'
const FILTERS: { k: Filter; label: string }[] = [{ k: 'all', label: 'All' }, { k: 'story', label: 'Story' }, { k: 'live', label: 'Live' }, { k: 'ranked', label: 'Ranked & Cups' }]
const FINISH: Record<string, string> = { spin: 'Spin finish', ringout: 'Ring out', shatter: 'Shatter', spirit: 'Spirit finish', draw: 'Draw', time: 'Time' }

const isBeast = (b: string | null): b is keyof typeof BEASTS => !!b && b in BEASTS
const ago = (t: number) => {
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(t).toLocaleDateString()
}
const title = (h: HistoryEntry) => (h.mode === 'story' ? `Tower floor ${h.floor ?? '?'}` : h.mode === 'live' ? 'Live battle' : h.mode === 'ranked' ? 'Ranked' : h.mode === 'cup' ? 'Cup match' : 'Practice')
const group = (h: HistoryEntry): Filter => (h.mode === 'live' ? 'live' : h.mode === 'ranked' || h.mode === 'cup' ? 'ranked' : 'story')

export function History() {
  const local = useSave(s => s.history ?? [])
  const [server, setServer] = useState<HistoryEntry[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void fetchHistory().then(list => {
      if (!live || !list) return
      setServer(list.map(m => ({ at: m.at, mode: 'live', opponent: m.opponent, opponentBeast: m.opponentBeast, beast: m.beast, won: m.won, scores: m.scores, floor: null, rounds: m.rounds })))
    })
    return () => { live = false }
  }, [])
  const all = useMemo(() => {
    const mine = server ? local.filter(h => h.mode !== 'live') : local
    return [...mine, ...(server ?? [])].sort((a, b) => b.at - a.at)
  }, [local, server])
  const shown = filter === 'all' ? all : all.filter(h => group(h) === filter)
  const wins = all.filter(h => h.won).length
  return (
    <Screen className="history">
      <TopBar title="Battle history" />
      {all.length > 0 && (
        <div className="hs-sum">
          <span><b>{all.length}</b>Battles</span>
          <span><b>{wins}</b>Wins</span>
          <span><b>{Math.round((wins / all.length) * 100)}%</b>Win rate</span>
        </div>
      )}
      <div className="hs-filters" role="tablist" aria-label="Battle type">
        {FILTERS.map(f => (
          <button key={f.k} role="tab" aria-selected={filter === f.k} className={filter === f.k ? 'on' : ''} onClick={() => setFilter(f.k)}>{f.label}</button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="hs-empty">{all.length === 0 ? 'No battles yet. Your story, live and ranked battles will show up here.' : 'No battles of this type yet.'}</p>
      ) : (
        <ol className="hs-list">
          {shown.map(h => {
            const id = `${h.mode}-${h.at}`
            const expanded = open === id
            return (
              <li key={id} className={`hs-row ${h.won ? 'won' : 'lost'}`}>
                <button className="hs-main" onClick={() => setOpen(expanded ? null : id)} aria-expanded={expanded}>
                  <span className="hs-beasts" aria-hidden="true">
                    {isBeast(h.beast) ? <Img id={`beasts/${h.beast}/emblem`} /> : <i />}
                    {isBeast(h.opponentBeast) ? <Img id={`beasts/${h.opponentBeast}/emblem`} /> : <i />}
                  </span>
                  <span className="hs-text">
                    <small>{title(h)} · {ago(h.at)}</small>
                    <strong>vs {h.opponent}</strong>
                  </span>
                  <span className="hs-score">
                    <b>{h.scores[0]}–{h.scores[1]}</b>
                    <em>{h.won ? 'Won' : 'Lost'}</em>
                  </span>
                </button>
                {expanded && (
                  <ol className="hs-rounds">
                    {h.rounds.map((r, i) => (
                      <li key={i} className={r.winner === 0 ? 'won' : r.winner === 1 ? 'lost' : ''}>
                        <span>Round {i + 1}</span>
                        <span>{r.winner === 0 ? 'You' : r.winner === 1 ? h.opponent : 'Nobody'}</span>
                        <span>{FINISH[r.finish] ?? r.finish}</span>
                      </li>
                    ))}
                    {h.rounds.length === 0 && <li><span>No round details</span></li>}
                  </ol>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </Screen>
  )
}
