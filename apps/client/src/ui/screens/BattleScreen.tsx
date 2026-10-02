import { useCallback, useEffect, useRef, useState } from 'react'
import type { Side } from '@spirit/core'
import { BattleController, type MatchResult, type MatchSetup } from '../../game/BattleController'
import { OnlineController } from '../../game/OnlineController'
import { BEASTS } from '../../game/beasts'
import { Game, type StadiumTheme } from '../../game/Game'
import { captureSwipe } from '../../input/swipe'
import { useRuntime } from '../../runtime'
import { BattleHud } from '../hud/BattleHud'

export function BattleScreen({ setup, theme, onEnd, forceSwipe = false, online }: { setup: MatchSetup; theme: StadiumTheme; onEnd: (r: MatchResult) => void; forceSwipe?: boolean; online?: Side | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const ctrl = useRef<BattleController | null>(null)
  const rt = useRuntime()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let disposed = false
    let game: Game | null = null
    void (async () => {
      game = await Game.create(canvas.current!, theme)
      await game.setTops([setup.player, setup.opponent], setup.art)
      if (disposed) {
        game.stop()
        game.stage.renderer.dispose()
        return
      }
      game.start()
      const deps = { sound: rt.sound, sensors: forceSwipe ? null : rt.sensors, shout: rt.shout, calibration: rt.calibration(), onEnd }
      const c = online === undefined ? new BattleController(game, setup, deps) : new OnlineController(game, setup, deps, online)
      ctrl.current = c
      if (import.meta.env.DEV) Object.assign(window, { __ctrl: c, __game: game })
      setLoading(false)
      c.start()
    })()
    return () => {
      disposed = true
      ctrl.current?.dispose()
      game?.stop()
      game?.stage.renderer.dispose()
    }
  }, [setup, theme, onEnd, rt, forceSwipe, online])

  const swipeCleanup = useRef<(() => void) | null>(null)
  const onSwipeZone = useCallback((el: HTMLDivElement | null) => {
    swipeCleanup.current?.()
    swipeCleanup.current = el ? captureSwipe(el, pts => ctrl.current?.submitSwipe(pts)) : null
  }, [])
  const onStick = useCallback((x: number, y: number) => ctrl.current?.setManualTilt(x, y), [])
  const onSpirit = useCallback(() => ctrl.current?.requestSpirit(), [])

  return (
    <div className="screen battle-screen">
      <canvas ref={canvas} className="game-canvas" />
      {loading && <div className="loading">LOADING STADIUM…</div>}
      {!loading && (
        <BattleHud
          names={[BEASTS[setup.player.beastId].name, BEASTS[setup.opponent.beastId].name]}
          onSpirit={onSpirit}
          onSwipeZone={onSwipeZone}
          onStick={onStick}
        />
      )}
    </div>
  )
}
