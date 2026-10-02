import { z } from 'zod'
import { OUTPUT_SCHEMA, systemFor, userMessage, type MomentInput } from './prompt'

export const MODEL_PRICES: Record<string, { in: number; cachedIn: number; out: number }> = {
  'gpt-5-nano': { in: 0.05, cachedIn: 0.005, out: 0.4 },
  'gpt-4.1-nano': { in: 0.1, cachedIn: 0.025, out: 0.4 },
  'gpt-4o-mini': { in: 0.15, cachedIn: 0.075, out: 0.6 },
  'gpt-5.4-nano': { in: 0.2, cachedIn: 0.02, out: 1.25 },
  'gpt-5-mini': { in: 0.25, cachedIn: 0.025, out: 2 },
}

export const SpiritOut = z.object({
  line: z.string().min(2).max(180),
  mood: z.enum(['neutral', 'proud', 'furious', 'sad', 'sulky', 'joyful']),
  nudge: z.object({ trait: z.enum(['none', 'courage', 'pride', 'curiosity', 'calm']), delta: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }),
  memory: z.object({ text: z.string().min(2).max(120), importance: z.number().int().min(1).max(5) }).nullable(),
})
export type SpiritLine = z.infer<typeof SpiritOut>

const BLOCK = /\b(love you|i love|kiss|date|girlfriend|boyfriend|marry|crush|abandon(ed)?|you left me|hate you|kill|die|suicide|school|homework|parents?|mom|dad|address|phone number|instagram|tiktok|password|money|\$)\b/i

export interface DirectorResult { line: SpiritLine | null; model: string; inputTokens: number; cachedTokens: number; outputTokens: number; usd: number; ms: number; failure: string | null }

export function costUsd(model: string, input: number, cached: number, output: number): number {
  const p = MODEL_PRICES[model] ?? { in: 1, cachedIn: 1, out: 4 }
  return ((input - cached) * p.in + cached * p.cachedIn + output * p.out) / 1e6
}

export async function directSpirit(key: string, model: string, m: MomentInput, timeoutMs = 8000): Promise<DirectorResult> {
  const t0 = performance.now()
  const reasoning = model.startsWith('gpt-5') ? { reasoning_effort: 'minimal' } : {}
  const base = { model, inputTokens: 0, cachedTokens: 0, outputTokens: 0, usd: 0 }
  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        ...reasoning,
        max_completion_tokens: model.startsWith('gpt-5') ? 600 : 220,
        response_format: { type: 'json_schema', json_schema: OUTPUT_SCHEMA },
        messages: [{ role: 'system', content: systemFor(m.beast.id) }, { role: 'user', content: userMessage(m) }],
      }),
    })
  } catch (e) {
    return { ...base, line: null, ms: performance.now() - t0, failure: `network: ${String(e).slice(0, 120)}` }
  }
  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string; refusal?: string } }[]
    usage?: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } }
    error?: { message: string }
  } | null
  const u = body?.usage
  const usage = u ? { inputTokens: u.prompt_tokens, cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0, outputTokens: u.completion_tokens } : { inputTokens: 0, cachedTokens: 0, outputTokens: 0 }
  const usd = costUsd(model, usage.inputTokens, usage.cachedTokens, usage.outputTokens)
  const ms = performance.now() - t0
  if (!res.ok) return { model, ...usage, usd, ms, line: null, failure: `http ${res.status}: ${body?.error?.message?.slice(0, 120) ?? ''}` }
  const content = body?.choices?.[0]?.message?.content
  if (!content) return { model, ...usage, usd, ms, line: null, failure: body?.choices?.[0]?.message?.refusal ? 'refusal' : 'empty' }
  let parsed: SpiritLine
  try {
    parsed = SpiritOut.parse(JSON.parse(content))
  } catch {
    return { model, ...usage, usd, ms, line: null, failure: 'schema' }
  }
  if (parsed.line.length > 160) return { model, ...usage, usd, ms, line: null, failure: 'too-long' }
  if (BLOCK.test(parsed.line) || (parsed.memory && BLOCK.test(parsed.memory.text))) return { model, ...usage, usd, ms, line: null, failure: 'blocklist' }
  return { model, ...usage, usd, ms, line: parsed, failure: null }
}

export async function moderate(key: string, text: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
    })
    const j = (await res.json()) as { results?: { flagged: boolean }[] }
    return res.ok && j.results?.[0]?.flagged === false
  } catch {
    return false
  }
}
