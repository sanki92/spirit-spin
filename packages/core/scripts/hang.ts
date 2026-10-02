import { playRound } from '../src/balance'
import { botRip, BOT_LEVELS } from '../src/bot'
import { applyRound, newMatch } from '../src/match'
import { assembleTop, STARTER_BUILDS, BEAST_IDS } from '../src/parts'
import { createRng } from '../src/rng'
const rng = createRng(1), br = BOT_LEVELS.hard
for (const a of BEAST_IDS) for (const b of BEAST_IDS) {
  const specs = [assembleTop(STARTER_BUILDS[a]), assembleTop(STARTER_BUILDS[b])] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
  for (let i = 0; i < 10; i++) {
    let m = newMatch(), n = 0; const fin: string[] = []
    while (m.winner === null && n < 40) {
      const r = playRound(specs, [botRip(rng, br, specs[0]), botRip(rng, br, specs[1])], [br, br], rng); n++; fin.push(r.finish)
      m = applyRound(m, { winner: r.winner, finish: r.finish, points: r.finish === 'spin' ? 1 : r.finish === 'spirit' ? 3 : r.finish === 'draw' ? 0 : 2 })
    }
    if (n >= 40) { console.log('HANG', a, b, fin.slice(0, 12).join(','), m.scores); break }
  }
}
console.log('done')
