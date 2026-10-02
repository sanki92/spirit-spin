import { describe, expect, it } from 'vitest'
import { createBattle, stepBattle, type BattleEvent } from './battle'
import { botInput, botRip, BOT_LEVELS } from './bot'
import { assembleTop, STARTER_BUILDS } from './parts'
import { createRng } from './rng'

const avg = (skill: number) => {
  const rng = createRng(11), spec = assembleTop(STARTER_BUILDS.voltfang)
  let sum = 0; for (let i = 0; i < 200; i++) sum += botRip(rng, { skill, aggression: 0.5, reaction: 20 }, spec).rpm
  return sum / 200
}

describe('bot', () => {
  it('skilled bots rip hard, weak bots rip weak', () => {
    expect(avg(1)).toBeGreaterThanOrEqual(11000)
    expect(avg(0.2)).toBeLessThan(8000)
  })
  it('weak bots sometimes overspin, strong bots almost never', () => {
    const count = (skill: number) => {
      const rng = createRng(3), spec = assembleTop(STARTER_BUILDS.agnyx)
      let n = 0; for (let i = 0; i < 400; i++) if (botRip(rng, { skill, aggression: 0.5, reaction: 20 }, spec).overspin) n++
      return n
    }
    expect(count(0.1)).toBeGreaterThan(10); expect(count(1)).toBeLessThan(5)
  })
  it('attack tops bank, stamina tops launch flat', () => {
    const rng = createRng(1), b = BOT_LEVELS.normal
    expect(botRip(rng, b, assembleTop(STARTER_BUILDS.voltfang)).style).toBe('bank')
    expect(botRip(rng, b, assembleTop(STARTER_BUILDS.nagara)).style).toBe('flat')
  })
  it('inputs stay in [-1,1] for a whole battle and attack bots chase', () => {
    const specs = [assembleTop(STARTER_BUILDS.voltfang), assembleTop(STARTER_BUILDS.nagara)] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
    const rng = createRng(5)
    const s = createBattle(specs, [{ rip: botRip(rng, BOT_LEVELS.hard, specs[0]), hesitate: false }, { rip: botRip(rng, BOT_LEVELS.hard, specs[1]), hesitate: false }], 5)
    const ev: BattleEvent[] = []; let chase = 0, n = 0
    while (!s.outcome) {
      const a = botInput(s, 0, BOT_LEVELS.hard, rng), b = botInput(s, 1, BOT_LEVELS.hard, rng)
      for (const v of [a.tiltX, a.tiltY, b.tiltX, b.tiltY]) { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1) }
      const [t, f] = s.tops; chase += a.tiltX * (f.x - t.x) + a.tiltY * (f.y - t.y); n++
      stepBattle(s, [a, b], ev)
    }
    expect(chase / n).toBeGreaterThan(0)
  })
})
