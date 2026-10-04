export interface P { x: number; y: number }

export function separate(a: P, b: P, ra: number, rb: number): { a: P; b: P; touching: boolean; nx: number; ny: number } {
  const dx = b.x - a.x, dy = b.y - a.y
  const d = Math.hypot(dx, dy)
  const min = ra + rb
  if (d >= min + 0.004 || d === 0) return { a, b, touching: false, nx: d ? dx / d : 1, ny: d ? dy / d : 0 }
  const nx = dx / d, ny = dy / d
  if (d >= min) return { a, b, touching: true, nx, ny }
  const push = (min - d) / 2
  return { a: { x: a.x - nx * push, y: a.y - ny * push }, b: { x: b.x + nx * push, y: b.y + ny * push }, touching: true, nx, ny }
}

export function keepInside(p: P, r: number, wall = 1): P {
  const d = Math.hypot(p.x, p.y), max = wall - r
  return d > max && d > 0 ? { x: (p.x / d) * max, y: (p.y / d) * max } : p
}
