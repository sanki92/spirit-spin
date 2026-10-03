import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, type Texture } from 'three'
import { cachedRing } from './partMesh'
import { bowlHeight } from './Stadium'

const LENGTH = 1
const SOCKET = 0.24
export const HOLD_HEIGHT = 0.5
export const HANG = 0.17

export class LaunchRig {
  readonly group = new Group()
  private pivot = new Group()
  private mats: (MeshBasicMaterial | MeshLambertMaterial)[]
  private out: number

  constructor(tex: Texture, readonly side: 0 | 1) {
    const s = LENGTH / 3
    const { geometry, edge } = cachedRing(`launcher|${tex.uuid}`, tex, 0.07, 0.012)
    this.mats = [new MeshBasicMaterial({ map: tex, alphaTest: 0.35 }), new MeshLambertMaterial({ color: edge.multiplyScalar(0.75) })]
    const mesh = new Mesh(geometry, this.mats)
    mesh.scale.setScalar(s)
    mesh.position.z = SOCKET * s
    this.out = side === 0 ? 1 : -1
    this.pivot.rotation.y = side === 0 ? 0 : Math.PI
    this.pivot.add(mesh)
    this.group.rotation.x = 0.3
    this.group.add(this.pivot)
    this.group.visible = false
  }

  pose(x: number, y: number, clock: number, release: number): void {
    const e = 1 - (1 - Math.min(1, release)) ** 3
    const bob = release > 0 ? 0 : Math.sin(clock * 2.3 + this.side * 1.7) * 0.012
    this.group.visible = release < 1
    this.group.position.set(x, bowlHeight(Math.min(1, Math.hypot(x, y))) + HOLD_HEIGHT + bob + e * 0.38, -y + this.out * e * 0.34)
    this.pivot.rotation.x = -e * 0.55 * this.out
    const fade = release <= 0.35 ? 1 : Math.max(0, 1 - (release - 0.35) / 0.65)
    for (const m of this.mats) {
      if (fade < 1 && !m.transparent) { m.transparent = true; m.needsUpdate = true }
      m.opacity = fade
    }
  }

  hide(): void {
    this.group.visible = false
  }

  dispose(): void {
    this.group.traverse(o => (o as Mesh).geometry?.dispose())
    for (const m of this.mats) m.dispose()
  }
}
