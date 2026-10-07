import { stepBattle, type TickInput } from '@spirit/core'
import { useHud, type Lesson } from '../state/hud'
import { log } from '../telemetry'
import { BattleController } from './BattleController'
import { BEASTS } from './beasts'

type Stage = 'launch' | 'lessons' | 'real' | 'done'
const IDLE: TickInput = { tiltX: 0, tiltY: 0, spirit: false }
const DIRS = { '←': { x: -1, y: 0 }, '→': { x: 1, y: 0 }, '↑': { x: 0, y: 1 }, '↓': { x: 0, y: -1 } } as const
const MOVE_HOLD_MS = 750
const SPIRIT_HOLD_MS = 3800
const TILT_DONE = 0.35

export class TrainingController extends BattleController {
  private stage: Stage = 'launch'
  private steps: Lesson[] = []
  private at = -1
  private paused = false
  private waitDir: { x: number; y: number } | null = null
  private waitSpirit = false
  private readonly unsub: () => void

  constructor(...args: ConstructorParameters<typeof BattleController>) {
    super(...args)
    let taps = useHud.getState().lessonTaps, skips = useHud.getState().lessonSkip
    this.unsub = useHud.subscribe(s => {
      if (s.lessonTaps !== taps) { taps = s.lessonTaps; this.onTap() }
      if (s.lessonSkip !== skips) { skips = s.lessonSkip; this.complete(true) }
    })
  }

  override start(): void {
    useHud.getState().set({ training: true, lesson: null })
    super.start()
  }

  override dispose(): void {
    this.unsub()
    useHud.getState().set({ training: false, lesson: null })
    super.dispose()
  }

  override requestSpirit(): void {
    super.requestSpirit()
    if (!this.waitSpirit) return
    this.waitSpirit = false
    this.resume()
    this.later(SPIRIT_HOLD_MS, () => this.next())
  }

  protected override enterBattlePhase(): void {
    super.enterBattlePhase()
    if (this.stage === 'launch') this.later(1500, () => this.startLessons())
  }

  protected override beginRound(): void {
    if (this.stage === 'real' && this.match.history.length > 0) {
      this.stage = 'done'
      this.at = this.steps.length - 1
      return this.show()
    }
    super.beginRound()
  }

  protected override tick(): void {
    if (this.stage !== 'lessons') return super.tick()
    const b = this.game.battle
    if (!b || this.paused) return
    stepBattle(b, [this.playerInput(), IDLE], this.events)
    const [me, dummy] = b.tops
    b.outcome = null
    for (const t of b.tops) { t.out = false; t.stopped = false; t.shattered = false; t.shatter = 0 }
    me.spin = Math.max(me.spin, 0.5)
    dummy.spin = Math.max(dummy.spin, 0.7)
    for (const [t, y] of [[me, -0.35], [dummy, 0.35]] as const) {
      if (Math.hypot(t.x, t.y) > 0.92) { t.x = 0; t.y = y; t.vx = 0; t.vy = 0 }
    }
    for (const e of this.events) if (e.k !== 'finish') this.onEvent(e)
    this.events.length = 0
  }

  protected override frame(dt: number): void {
    super.frame(dt)
    if (!this.waitDir) return
    const sensors = this.deps.sensors
    const tilt = sensors?.live ? sensors.tilt() : this.manualTilt
    if (tilt.x * this.waitDir.x + tilt.y * this.waitDir.y < TILT_DONE) return
    this.waitDir = null
    this.paused = false
    useHud.getState().set({ lesson: { id: 'nice', title: 'Nice!', text: '' } })
    this.later(MOVE_HOLD_MS, () => this.next())
  }

  private startLessons(): void {
    if (this.disposed || this.stage !== 'launch') return
    this.stage = 'lessons'
    const motion = this.inputMode === 'motion'
    const beast = BEASTS[this.setup.player.beastId].name
    const move = (arrow: NonNullable<Lesson['arrow']>, title: string, tilt: string, drag: string): Lesson =>
      ({ id: `move-${title}`, title, text: motion ? tilt : drag, arrow, ...(motion ? {} : { target: '.stick-zone' }) })
    this.steps = [
      { id: 'stamina', title: 'Stamina', text: 'This bar is your top’s spin. When it runs out, your top stops and you lose the round.', target: '.side.left .spinbar', tap: 'Next' },
      { id: 'guard', title: 'Guard', text: 'Hard hits crack your guard. If it empties, your top shatters.', target: '.side.left .guardbar', tap: 'Next' },
      { id: 'points', title: 'Points', text: 'Win rounds to light these up. First to 4 points wins the match.', target: '.side.left .pips', tap: 'Got it' },
      move('←', 'Move left', 'Tilt your phone to the left.', 'Drag the stick to the left.'),
      move('→', 'Move right', 'Tilt your phone to the right.', 'Drag the stick to the right.'),
      move('↑', 'Move up', 'Tilt the top of your phone away from you.', 'Drag the stick up.'),
      move('↓', 'Move down', 'Tilt the top of your phone toward you.', 'Drag the stick down.'),
      { id: 'spirit', title: `Unleash ${beast}`, text: 'This button fills as you battle. When it glows, tap it (or shout) to unleash your beast.', target: '.spirit-btn' },
      { id: 'ready', title: 'Real round', text: 'Now beat an easy rival for real. Launch when the countdown ends.', tap: 'Let’s go' },
      { id: 'done', title: 'Training complete', text: 'You know the basics. The Spirit Tower is waiting.', tap: 'Continue' },
    ]
    useHud.getState().set({ coachTip: null })
    this.at = 0
    this.show()
  }

  private show(): void {
    const lesson = this.steps[this.at]
    if (!lesson) return
    this.paused = true
    log('training.step', { id: lesson.id })
    useHud.getState().set({ lesson })
    if (lesson.arrow) this.waitDir = DIRS[lesson.arrow]
    if (lesson.id === 'spirit') {
      const me = this.game.battle?.tops[0]
      if (me) { me.gauge = 1; me.hesitate = false }
      this.waitSpirit = true
    }
  }

  private resume(): void {
    this.paused = false
    useHud.getState().set({ lesson: null })
  }

  private next(): void {
    if (this.disposed || this.stage !== 'lessons') return
    this.at++
    this.show()
  }

  private onTap(): void {
    const lesson = useHud.getState().lesson ?? this.steps[this.at]
    if (!lesson?.tap || this.disposed) return
    if (lesson.id === 'ready') return this.startReal()
    if (lesson.id === 'done') return this.complete(false)
    this.resume()
    this.next()
  }

  private startReal(): void {
    this.stage = 'real'
    this.paused = false
    useHud.getState().set({ lesson: null })
    this.beginRound()
  }

  private complete(skipped: boolean): void {
    if (this.concluded || this.disposed) return
    this.concluded = true
    log('training.end', { skipped, step: this.steps[this.at]?.id ?? this.stage })
    useHud.getState().set({ lesson: null })
    this.deps.onEnd({ winner: 0, match: this.match, bestRpm: this.bestRpm, spiritCalls: this.spiritCalls, comeback: false, perfectRips: this.perfectRips, overspins: this.overspins, finishes: [], aggression: 0 })
  }
}
