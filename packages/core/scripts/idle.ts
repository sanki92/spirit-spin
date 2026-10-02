import { playRound } from '../src/balance'
import { botRip, type BotBrain } from '../src/bot'
import { assembleTop, STARTER_BUILDS, type BeastId } from '../src/parts'
import { createRng } from '../src/rng'
import { BOSSES, type BossId } from '../src/tower'
const [beast, boss, mode] = process.argv.slice(2) as [BeastId, BossId, string]
const b = BOSSES[boss], rng = createRng(11)
const me: BotBrain | null = mode === 'idle' ? null : { skill: 0.5, aggression: 0.5, reaction: 30 }
const specs = [assembleTop(STARTER_BUILDS[beast]), assembleTop(b.build)] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
const perfect = { ...botRip(rng, { skill: 1, aggression: 0, reaction: 0 }, specs[0]) }
const tally: Record<string, number> = {}; let fast = 0, win = 0; const N = 400
for (let i = 0; i < N; i++) {
  const r = playRound(specs, [perfect, botRip(rng, b.brain, specs[1])], [me, b.brain], rng)
  const k = `${r.winner === 0 ? 'me' : 'boss'} ${r.finish}`; tally[k] = (tally[k] ?? 0) + 1
  if (r.winner === 1 && r.finish === 'ringout' && r.seconds < 5) fast++
  if (r.winner === 0) win++
}
console.log(beast, 'vs', boss, mode, tally, 'win', (win / N * 100).toFixed(0) + '%', 'fast-ringout-loss', (fast / N * 100).toFixed(0) + '%')
