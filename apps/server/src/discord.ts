export interface Notifier {
  say(text: string): void
  stop(): void
}

export const quietNotifier: Notifier = { say: () => undefined, stop: () => undefined }

const clip = (s: string) => s.replace(/@(everyone|here)/g, '@​$1').slice(0, 1900)

export function discordNotifier(url: string | undefined, opts: { gapMs?: number; max?: number; post?: typeof fetch; onError?: (e: unknown) => void } = {}): Notifier {
  if (!url || !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url)) return quietNotifier
  const queue: string[] = []
  const post = opts.post ?? fetch
  let busy = false
  const pump = async () => {
    if (busy || !queue.length) return
    busy = true
    const content = queue.shift()!
    try {
      const r = await post(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(8000) })
      if (r.status === 429) queue.unshift(content)
    } catch (e) {
      opts.onError?.(e)
    } finally {
      busy = false
    }
  }
  const timer = setInterval(() => void pump(), opts.gapMs ?? 2500)
  timer.unref?.()
  return {
    say(text) {
      if (queue.length >= (opts.max ?? 100)) queue.shift()
      queue.push(clip(text))
    },
    stop() {
      clearInterval(timer)
    },
  }
}
