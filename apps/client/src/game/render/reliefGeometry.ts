import { BufferAttribute, BufferGeometry, Color, ExtrudeGeometry, Path, Shape, Vector2 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface ReliefShape { outer: number[][]; holes: number[][][] }
export interface ReliefTier { h: number; wall: string; shapes: ReliefShape[] }
export interface Relief { v: 1; centre: [number, number]; inner: number; outer: number; profile: number[]; tiers: ReliefTier[] }
export type ReliefDetail = 'garage' | 'battle'
export type ArtSampler = (u: number, v: number) => [number, number, number] | null

const WALL_SHADE = 0.85

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const ring = (x: unknown): x is number[][] => Array.isArray(x) && x.length >= 3 && x.every(p => Array.isArray(p) && p.length === 2 && num(p[0]) && num(p[1]))

export function parseRelief(x: unknown): Relief | null {
  const r = x as Partial<Relief> | null
  if (!r || typeof r !== 'object' || r.v !== 1 || !Array.isArray(r.tiers) || !Array.isArray(r.profile) || !Array.isArray(r.centre)) return null
  if (!num(r.centre[0]) || !num(r.centre[1]) || !num(r.inner) || !num(r.outer) || !r.profile.every(num)) return null
  for (const t of r.tiers) {
    if (!t || !num(t.h) || typeof t.wall !== 'string' || !Array.isArray(t.shapes)) return null
    for (const s of t.shapes) if (!s || !ring(s.outer) || !Array.isArray(s.holes) || !s.holes.every(ring)) return null
  }
  return r as Relief
}

function slice(g: BufferGeometry, start: number, count: number): BufferGeometry {
  const out = new BufferGeometry()
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = g.getAttribute(name)
    if (!a) continue
    const k = a.itemSize
    out.setAttribute(name, new BufferAttribute((a.array as Float32Array).slice(start * k, (start + count) * k), k))
  }
  return out
}

export function reliefGeometry(r: Relief, detail: ReliefDetail, sample?: ArtSampler): BufferGeometry {
  const [cx, cy] = r.centre
  const uv = {
    generateTopUV: (_g: ExtrudeGeometry, v: number[], a: number, b: number, c: number) => [a, b, c].map(i => new Vector2((v[i * 3]! + cx) * 0.5 + 0.5, (v[i * 3 + 1]! + cy) * 0.5 + 0.5)),
    generateSideWallUV: (_g: ExtrudeGeometry, _v: number[], a: number, b: number, c: number, d: number) => [a, b, c, d].map(() => new Vector2(0.5, 0.5)),
  }
  const caps: BufferGeometry[] = [], walls: BufferGeometry[] = []
  for (const t of r.tiers) {
    const shapes = t.shapes.map(s => {
      const sh = new Shape(s.outer.map(([x, y]) => new Vector2(x! - cx, y! - cy)))
      for (const h of s.holes) sh.holes.push(new Path(h.map(([x, y]) => new Vector2(x! - cx, y! - cy))))
      return sh
    })
    if (!shapes.length) continue
    const g = new ExtrudeGeometry(shapes, { depth: t.h, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: detail === 'garage' ? 2 : 1, curveSegments: 4, UVGenerator: uv })
    g.rotateX(-Math.PI / 2)
    const wall = new Color(t.wall).convertSRGBToLinear(), pos = g.attributes.position!, n = pos.count, col = new Float32Array(n * 3), c = new Color()
    for (const grp of g.groups) {
      for (let i = grp.start; i < grp.start + grp.count; i++) {
        if (grp.materialIndex !== 1) { col.set([1, 1, 1], i * 3); continue }
        const s = sample?.((pos.getX(i) + cx) * 0.5 + 0.5, (-pos.getZ(i) + cy) * 0.5 + 0.5)
        if (s) c.setRGB(s[0] * WALL_SHADE, s[1] * WALL_SHADE, s[2] * WALL_SHADE).convertSRGBToLinear()
        else c.copy(wall)
        col.set([c.r, c.g, c.b], i * 3)
      }
    }
    g.setAttribute('color', new BufferAttribute(col, 3))
    for (const grp of g.groups) (grp.materialIndex === 1 ? walls : caps).push(slice(g, grp.start, grp.count))
    g.dispose()
  }
  const merged = mergeGeometries([mergeGeometries(caps)!, mergeGeometries(walls)!], true)!
  merged.computeBoundingSphere()
  return merged
}

export const heightUnder = (r: Relief, from: number): number => Math.max(0, ...r.profile.slice(Math.min(r.profile.length - 1, Math.floor(from * r.profile.length))))

export const centreHeight = (r: Relief): number => r.profile[0] ?? 0
