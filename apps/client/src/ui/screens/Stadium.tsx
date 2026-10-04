import type { ServerMsg, TopBuild } from '@spirit/core'
import QRCode from 'qrcode'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BEASTS } from '../../game/beasts'
import type { MatchSetup } from '../../game/BattleController'
import { SpectatorController } from '../../game/SpectatorController'
import { rt } from '../../net/rt'
import { useNav } from '../../state/nav'
import { log } from '../../telemetry'
import { Img, Screen } from '../kit'
import { BattleScreen, type ControllerFactory } from './BattleScreen'

type Seat = { name: string; build: TopBuild; online: boolean } | null

export function Stadium() {
  const nav = useNav()
  const [code, setCode] = useState<string | null>(null)
  const [seats, setSeats] = useState<Seat[]>([null, null])
  const [qr, setQr] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const playingRef = useRef(false)
  playingRef.current = playing
  const [error, setError] = useState<string | null>(null)
  const [round, setRound] = useState(0)

  const open = useCallback(async () => {
    try {
      rt.leave()
      setPlaying(false)
      setSeats([null, null])
      setCode(null)
      await rt.connect('Stadium')
      rt.send({ k: 'stadium' })
    } catch {
      setError('Could not reach the battle server. Check the connection on this screen.')
    }
  }, [])

  useEffect(() => {
    const off = rt.on((m: ServerMsg) => {
      if (m.k === 'watching') setCode(m.code)
      if (m.k === 'seats') setSeats(m.seats)
      if (m.k === 'round') setPlaying(true)
      if (m.k === 'left' && !playingRef.current) void open()
      if (m.k === 'error' && m.code === 'no-room') void open()
    })
    void open()
    return () => { off(); rt.leave() }
  }, [open])

  const link = code ? `${location.origin}/?join=${code}` : ''
  useEffect(() => {
    if (!link) return setQr(null)
    void QRCode.toDataURL(link, { margin: 1, width: 520, color: { dark: '#070b1f', light: '#ffffff' } }).then(setQr)
  }, [link])

  const ready = seats[0] && seats[1]
  const setup = useMemo<MatchSetup | null>(() => (ready ? { player: seats[0]!.build, opponent: seats[1]!.build, bot: { skill: 0.5, aggression: 0.5, reaction: 30 }, playerHesitates: false, seed: 0, art: [`beasts/${seats[0]!.build.beastId}`, `beasts/${seats[1]!.build.beastId}`] } : null), [ready, round])
  const names = useMemo<[string, string]>(() => [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2'], [ready, round])
  const controller = useCallback<ControllerFactory>((g, st, d) => new SpectatorController(g, st, d, names), [names])
  const onEnd = useCallback(() => {
    log('stadium.match-end', {})
    setRound(r => r + 1)
    void open()
  }, [open])

  if (playing && setup) return <BattleScreen setup={setup} theme="classic" onEnd={onEnd} controller={controller} spectator names={names} />

  return (
    <Screen className="stadium" bg="backgrounds/arena">
      <button className="icon-btn stadium-back" onClick={() => nav.reset({ k: 'home' })} aria-label="Leave Stadium Mode">‹</button>
      <Img id="ui/logo" className="stadium-logo" />
      <div className="stadium-body">
        <section className="stadium-join">
          <h1 className="slant">Stadium Mode</h1>
          <p>This screen is the arena. Two phones are the launchers: scan the QR, or open <strong>Live battle</strong> and join with this code.</p>
          <div className="stadium-code" aria-label="Stadium code">{code ?? '····'}</div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
        <section className="stadium-qr">
          {qr ? <img src={qr} alt={`QR code to join stadium ${code}`} /> : <div className="qr-wait">Opening…</div>}
        </section>
      </div>
      <div className="stadium-seats">
        {[0, 1].map(i => {
          const s = seats[i]
          return (
            <div key={i} className={`stadium-seat ${s ? 'in' : ''}`} style={s ? { ['--c' as string]: BEASTS[s.build.beastId].color } : undefined}>
              {s ? <Img id={`beasts/${s.build.beastId}/emblem`} className="seat-emblem" /> : <span className="seat-empty">{i + 1}</span>}
              <div><strong>{s?.name ?? `Waiting for player ${i + 1}`}</strong><span>{s ? BEASTS[s.build.beastId].name : 'Scan or enter the code'}</span></div>
            </div>
          )
        })}
      </div>
    </Screen>
  )
}
