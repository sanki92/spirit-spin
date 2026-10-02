export type Pairing = [string, string | null]
export interface Standing { id: string; points: number; bye: boolean }

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function roundRobin(ids: readonly string[]): Pairing[][] {
  const list: (string | null)[] = ids.length % 2 ? [...ids, null] : [...ids]
  const n = list.length
  const rounds: Pairing[][] = []
  for (let r = 0; r < n - 1; r++) {
    const round: Pairing[] = []
    for (let i = 0; i < n / 2; i++) {
      const a = list[i]!, b = list[n - 1 - i]!
      if (a === null && b === null) continue
      round.push(a === null ? [b!, null] : b === null ? [a, null] : [a, b])
    }
    rounds.push(round)
    list.splice(1, 0, list.pop()!)
  }
  return rounds
}

export function swissRound(standings: readonly Standing[], played: ReadonlySet<string>): Pairing[] {
  const order = [...standings].sort((a, b) => b.points - a.points || (a.id < b.id ? -1 : 1))
  const pairs: Pairing[] = []
  let pool = order.map(s => s.id)
  if (pool.length % 2) {
    const byeId = [...order].reverse().find(s => !s.bye)?.id ?? order[order.length - 1]!.id
    pairs.push([byeId, null])
    pool = pool.filter(id => id !== byeId)
  }
  const solve = (left: string[]): Pairing[] | null => {
    if (!left.length) return []
    const [a, ...rest] = left
    for (let i = 0; i < rest.length; i++) {
      if (played.has(key(a!, rest[i]!))) continue
      const sub = solve([...rest.slice(0, i), ...rest.slice(i + 1)])
      if (sub) return [[a!, rest[i]!], ...sub]
    }
    return null
  }
  const solved = solve(pool)
  if (solved) return [...pairs, ...solved]
  for (let i = 0; i < pool.length; i += 2) pairs.push([pool[i]!, pool[i + 1]!])
  return pairs
}

export function elo(a: number, b: number, scoreA: 0 | 0.5 | 1, k = 32): [number, number] {
  const expected = 1 / (1 + 10 ** ((b - a) / 400))
  const delta = Math.round(k * (scoreA - expected))
  return [a + delta, b - delta]
}
