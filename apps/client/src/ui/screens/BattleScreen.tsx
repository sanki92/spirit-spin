import { assembleTop } from '@spirit/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BattleController, type MatchResult, type MatchSetup } from '../../game/BattleController'
import { BEASTS } from '../../game/beasts'
import { Game, type StadiumTheme } from '../../game/Game'
import { captureSwipe } from '../../input/swipe'
import { useRuntime } from '../../runtime'
import { useSave } from '../../state/save'
import { Loader } from '../Loader'
import { BattleHud } from '../hud/BattleHud'

export type ControllerFactory = (game: Game, setup: MatchSetup, deps: ConstructorParameters<typeof BattleController>[2]) => BattleController

export function BattleScreen({ setup, theme, onEnd, forceSwipe = false, controller, spectator = false, names }: { setup: MatchSetup; theme: StadiumTheme; onEnd: (r: MatchResult) => void; forceSwipe?: boolean; controller?: ControllerFactory | undefined; spectator?: boolean; names?: [string, string] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const ctrl = useRef<BattleController | null>(null)
  const rt = useRuntime()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let disposed = false
    let game: Game | null = null
    void (async () => {
      game = await Game.create(canvas.current!, theme)
      if (!spectator) game.playerLauncher = playerLauncher()
      await game.setTops([setup.player, setup.opponent], setup.art)
      if (disposed) {
        game.stop()
        game.stage.renderer.dispose()
        return
      }
      game.start()
      const deps = { sound: rt.sound, sensors: forceSwipe || spectator ? null : rt.sensors, shout: rt.shout, calibration: rt.calibration(), onEnd, onCalibrate: (pulls: number[]) => rt.saveCalibration(pulls) }
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
      {loading && <Loader full label="Entering the stadium" />}
      {!loading && (
        <BattleHud
          beasts={[setup.player.beastId, setup.opponent.beastId]}
          arts={setup.art}
          types={[assembleTop(setup.player).type, assembleTop(setup.opponent).type]}
          names={names ?? [BEASTS[setup.player.beastId].name, BEASTS[setup.opponent.beastId].name]}
          spectator={spectator}
          onSpirit={onSpirit}
          onSwipeZone={onSwipeZone}
          onStick={onStick}
        />
      )}
    </div>
  )
}

function playerLauncher(): string {
  const s = useSave.getState()
  const id = s.cosmetics?.launcher ?? `launcher-${s.loadout?.beastId ?? s.starter ?? 'voltfang'}`
  return `launchers/${id.replace('launcher-', '')}`
}
