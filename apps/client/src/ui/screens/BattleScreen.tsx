import { useCallback, useEffect, useRef, useState } from 'react'
import { BattleController, type MatchResult, type MatchSetup } from '../../game/BattleController'
import { BEASTS } from '../../game/beasts'
import { Game, type StadiumTheme } from '../../game/Game'
import { captureSwipe } from '../../input/swipe'
import { useRuntime } from '../../runtime'
import { BattleHud } from '../hud/BattleHud'

export function BattleScreen({ setup, theme, onEnd }: { setup: MatchSetup; theme: StadiumTheme; onEnd: (r: MatchResult) => void }) {
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
      const c = new BattleController(game, setup, { sound: rt.sound, sensors: rt.sensors, shout: rt.shout, calibration: rt.calibration(), onEnd })
      ctrl.current = c
      setLoading(false)
      c.start()
    })()
    return () => {
      disposed = true
      ctrl.current?.dispose()
      game?.stop()
      game?.stage.renderer.dispose()
    }
  }, [setup, theme, onEnd, rt])

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
