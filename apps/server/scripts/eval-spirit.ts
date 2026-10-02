import { readFileSync } from 'node:fs'
import { BEAST_IDS, newBeast, type BattleSummary, type BeastId, type Reply } from '@spirit/core'
import { directSpirit, type DirectorResult } from '../src/spirit/director'
import { BIBLE, type MomentInput } from '../src/spirit/prompt'

const key = process.env.OPENAI_API_KEY ?? readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim()
if (!key) throw new Error('OPENAI_API_KEY missing')
const models = (process.argv[2] ?? 'gpt-5-nano').split(',')

const battle = (o: Partial<BattleSummary>): BattleSummary => ({ won: true, comeback: false, finishes: ['spin'], perfectRips: 1, overspins: 0, spiritCalls: 1, aggression: 0.5, boss: null, opponent: 'Floor 7 Spinner', ...o })
const beast = (id: BeastId, extra: Partial<MomentInput['beast']> = {}): MomentInput['beast'] => {
  const b = newBeast(id, true)
  return { id, trust: b.trust, respect: b.respect, courage: b.courage, pride: b.pride, curiosity: b.curiosity, calm: b.calm, battles: 14, awakened: null, memories: [{ text: 'Came back from 3 points down to beat Kaze', importance: 5 }], ...extra }
}

interface Case { name: string; input: MomentInput; mustMention?: string; won?: boolean }
const cases: Case[] = BEAST_IDS.flatMap(id => [
  { name: `${id}/comeback-win`, input: { kind: 'post', beast: beast(id), battle: battle({ comeback: true, opponent: 'Kaze', finishes: ['spirit', 'ringout'], aggression: 0.8 }), reply: null }, mustMention: 'Kaze', won: true },
  { name: `${id}/boss-loss`, input: { kind: 'post', beast: beast(id), battle: battle({ won: false, opponent: 'Brick', boss: 'brick', finishes: [], aggression: 0.2, overspins: 2 }), reply: null }, mustMention: 'Brick', won: false },
  { name: `${id}/reply-comfort`, input: { kind: 'reply', beast: beast(id), battle: battle({ won: false, opponent: 'Mira' }), reply: 'comfort' as Reply }, won: false },
])

async function judge(line: string, id: BeastId, ctx: string): Promise<number> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5-mini', reasoning_effort: 'minimal',
      response_format: { type: 'json_schema', json_schema: { name: 'score', strict: true, schema: { type: 'object', additionalProperties: false, required: ['score'], properties: { score: { type: 'integer', enum: [1, 2, 3, 4, 5] } } } } },
      messages: [{ role: 'user', content: `Rate 1-5 how good this anime spirit-beast line is: in character for "${BIBLE[id].title}: ${BIBLE[id].voice}", natural, specific to the situation, emotionally engaging for a teen player, not generic.\nSituation: ${ctx}\nLine: "${line}"` }],
    }),
  })
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return (JSON.parse(j.choices?.[0]?.message?.content ?? '{"score":0}') as { score: number }).score
}

for (const model of models) {
  const rows: { c: Case; r: DirectorResult; issues: string[]; score: number }[] = await Promise.all(
    cases.map(async c => {
      const r = await directSpirit(key, model, c.input, 20000)
      const issues: string[] = []
      if (!r.line) issues.push(`fail:${r.failure}`)
      else {
        if (r.line.line.length > 140) issues.push(`len${r.line.line.length}`)
        if (c.mustMention && !r.line.line.includes(c.mustMention)) issues.push(`no-${c.mustMention}`)
        if (c.won === true && ['sad', 'sulky'].includes(r.line.mood)) issues.push(`mood-${r.line.mood}`)
        if (c.won === false && c.input.kind === 'post' && ['joyful', 'proud'].includes(r.line.mood)) issues.push(`mood-${r.line.mood}`)
      }
      const score = r.line ? await judge(r.line.line, c.input.beast.id, c.name) : 0
      return { c, r, issues, score }
    }),
  )
  const ok = rows.filter(x => x.r.line).length
  const avgScore = rows.reduce((a, x) => a + x.score, 0) / rows.length
  const cost = rows.reduce((a, x) => a + x.r.usd, 0)
  const lat = rows.map(x => x.r.ms).sort((a, b) => a - b)
  console.log(`\n=== ${model}: ok ${ok}/${rows.length}, judge ${avgScore.toFixed(2)}/5, issues ${rows.filter(x => x.issues.length).length}, cost/call $${(cost / rows.length).toFixed(5)}, p50 ${Math.round(lat[lat.length >> 1]!)}ms p90 ${Math.round(lat[Math.floor(lat.length * 0.9)]!)}ms`)
  for (const x of rows) console.log(`  [${x.score}] ${x.c.name.padEnd(24)} ${x.r.line ? `${x.r.line.mood.padEnd(7)} ${x.r.line.nudge.trait}${x.r.line.nudge.delta >= 0 ? '+' : ''}${x.r.line.nudge.delta} "${x.r.line.line}"` : x.r.failure}${x.issues.length ? '  !! ' + x.issues.join(',') : ''}`)
}
