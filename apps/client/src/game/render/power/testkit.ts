import type { BeastMove, TopState } from '@spirit/core'
import { Quaternion, Texture, type InstancedMesh, type Material, type Mesh, type Object3D } from 'three'
import type { Power, PowerTextures } from './PowerFx'

export const blankTextures = (): PowerTextures => new Proxy({}, { get: () => new Texture() }) as PowerTextures

export const top = (x: number, y: number): TopState => ({ x, y, vx: 0, vy: 0, spiritTicks: 0, summonTicks: 0 }) as TopState

const q = new Quaternion()

export function drive(p: Power, me: TopState, foe: TopState, from: number, to: number, cues: Record<number, [BeastMove, number, number]> = {}): void {
  for (let e = from; e <= to; e++) {
    const c = cues[e]
    if (c) p.cue(c[0], c[1], c[2], foe)
    p.update(1 / 60, e, me, foe, false, q)
  }
}

export function idle(p: Power, me: TopState, foe: TopState, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) p.update(1 / 60, -1, me, foe, false, q)
}

export function finite(o: Object3D): boolean {
  let ok = true
  o.traverse(c => {
    ok &&= [c.position.x, c.position.y, c.position.z, c.scale.x, c.scale.y, c.scale.z].every(Number.isFinite)
    const pos = (c as Mesh).geometry?.attributes?.position?.array
    if (pos) ok &&= Array.prototype.every.call(pos, Number.isFinite)
    const im = c as InstancedMesh
    if (im.isInstancedMesh) ok &&= Array.prototype.every.call(im.instanceMatrix.array, Number.isFinite)
  })
  return ok
}

export function lit(o: Object3D): number {
  let n = 0
  o.traverseVisible(c => {
    const m = (c as Mesh).material as Material | undefined
    if (!m) return
    const im = c as InstancedMesh
    if (im.isInstancedMesh && im.count === 0) return
    if (m.opacity > 0.01) n++
  })
  return n
}
