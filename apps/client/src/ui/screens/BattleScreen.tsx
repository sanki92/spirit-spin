import { useCallback, useEffect, useRef, useState } from 'react'
import { BattleController, type MatchResult, type MatchSetup } from '../../game/BattleController'
import { BEASTS } from '../../game/beasts'
import { Game, type StadiumTheme } from '../../game/Game'
import { captureSwipe } from '../../input/swipe'
import { useRuntime } from '../../runtime'
import { BattleHud } from '../hud/BattleHud'

export type ControllerFactory = (game: Game, setup: MatchSetup, deps: ConstructorParameters<typeof BattleController>[2]) => BattleController

export function BattleScreen({ setup, theme, onEnd, forceSwipe = false, controller }: { setup: MatchSetup; theme: StadiumTheme; onEnd: (r: MatchResult) => void; forceSwipe?: boolean; controller?: ControllerFactory | undefined }) {
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
      const c = controller ? controller(game, setup, deps) : new BattleController(game, setup, deps)
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
  }, [setup, theme, onEnd, rt, forceSwipe, controller])

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
