import { TUNING, type BeastMove, type TopState } from '@spirit/core'
import { ConeGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Mesh, type PlaneGeometry } from 'three'
import { Pool } from '../Fx'
import type { Power, PowerTextures } from './PowerFx'
import { floorAt, floorDecal, setDecal, tiled } from './shapes'

const N = 10, RING = 0.22, RISE_S = 0.3, LEAD = 12, SCAR_S = 3, G = 9, WIDTH = 0.045
const UP = new Vector3(0, 1, 0), m4 = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), v = new Vector3()

export class AegironPower implements Power {
  readonly group = new Group()
  private readonly shards: InstancedMesh
  private readonly rocks: Pool
  private readonly scar: Mesh<PlaneGeometry, MeshBasicMaterial>
  private readonly x0 = new Float32Array(N)
  private readonly y0 = new Float32Array(N)
  private readonly z0 = new Float32Array(N)
  private readonly vx = new Float32Array(N)
  private readonly vy = new Float32Array(N)
  private readonly vz = new Float32Array(N)
  private readonly len = new Float32Array(N)
  private mode: 'off' | 'rise' | 'fly' = 'off'
  private t = 0
  private flight = 0
  private span = LEAD / 60
  private scarT = 0
  private tx = 0
  private tz = 0
  private ty = 0

  constructor(tex: PowerTextures, cap: number) {
    const geo = new ConeGeometry(1, 1, 4)
    geo.translate(0, 0.5, 0)
    this.shards = new InstancedMesh(geo, new MeshBasicMaterial({ map: tiled(tex.crystal), transparent: true, opacity: 0.95 }), N)
    this.shards.frustumCulled = false
    this.shards.count = 0
    this.rocks = new Pool(tex.rocks, cap, false)
    this.scar = floorDecal(tex.crack, false)
    this.group.add(this.shards, this.rocks.mesh, this.scar)
    for (let i = 0; i < N; i++) this.len[i] = 0.16 + ((i * 7) % 5) * 0.025
  }

  begin(_me?: TopState, _foe?: TopState): void {
    this.ring(0, 0)
  }

  cue(move: BeastMove, x: number, y: number, foe: TopState): void {
    if (move === 'anchor') this.ring(x, y)
    if (move !== 'shockwave') return
    this.scarT = SCAR_S
    setDecal(this.scar, x, y, 0.7, 1)
    if (this.mode === 'rise') this.launch(foe)
  }

  update(dt: number, e: number, _me: TopState, foe: TopState, still: boolean, camQ: Quaternion): void {
    this.t += dt
    if (this.mode === 'rise' && e >= TUNING.tech.slamAt - LEAD) this.launch(foe)
    if (this.mode === 'rise') this.drawRing(still)
    else if (this.mode === 'fly') this.drawFlight(dt, still)
    if (this.scarT > 0) {
      this.scarT -= dt
      this.scar.material.opacity = Math.max(0, Math.min(1, this.scarT / 0.6))
      this.scar.visible = this.scarT > 0
    }
    this.rocks.update(dt, camQ, 4)
  }

  end(): void {
    if (this.mode === 'rise') { this.mode = 'off'; this.shards.count = 0 }
  }

  reset(): void {
    this.mode = 'off'
    this.shards.count = 0
    this.scarT = 0
    this.scar.visible = false
    this.rocks.clear()
  }

  dispose(): void {
    const mat = this.shards.material as MeshBasicMaterial
    mat.map?.dispose()
    mat.dispose()
    this.shards.geometry.dispose()
    this.shards.dispose()
    ;(this.rocks.mesh.material as MeshBasicMaterial).dispose()
    this.rocks.mesh.dispose()
    this.scar.material.dispose()
  }

  private ring(cx: number, cy: number): void {
    this.mode = 'rise'
    this.t = 0
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, x = cx + Math.cos(a) * RING, y = cy + Math.sin(a) * RING
      this.x0[i] = x
      this.y0[i] = floorAt(x, y)
      this.z0[i] = -y
    }
  }

  private drawRing(still: boolean): void {
    const k = still ? 1 : Math.min(1, this.t / RISE_S), grow = k * k * (3 - 2 * k)
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      q.setFromUnitVectors(UP, v.set(Math.cos(a) * 0.34, 0.94, -Math.sin(a) * 0.34).normalize())
      m4.compose(p.set(this.x0[i]!, this.y0[i]!, this.z0[i]!), q, s.set(WIDTH, Math.max(1e-3, this.len[i]! * grow), WIDTH))
      this.shards.setMatrixAt(i, m4)
    }
    this.shards.count = N
    this.shards.instanceMatrix.needsUpdate = true
  }

  private launch(foe: TopState): void {
    this.mode = 'fly'
    this.flight = 0
    this.span = LEAD / 60
    const fx = foe.x + foe.vx * this.span, fy = foe.y + foe.vy * this.span
    this.tx = fx
    this.tz = -fy
    this.ty = floorAt(fx, fy) + 0.05
    for (let i = 0; i < N; i++) {
      this.y0[i] = this.y0[i]! + this.len[i]! * 0.5
      this.vx[i] = (this.tx - this.x0[i]!) / this.span
      this.vz[i] = (this.tz - this.z0[i]!) / this.span
      this.vy[i] = (this.ty - this.y0[i]!) / this.span + 0.5 * G * this.span
    }
  }

  private drawFlight(dt: number, still: boolean): void {
    this.flight += dt
    const t = this.flight
    if (t >= this.span) {
      this.mode = 'off'
      this.shards.count = 0
      if (!still) for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2, sp = 0.6 + (k % 3) * 0.4
        this.rocks.spawn(this.tx, this.ty, this.tz, Math.cos(a) * sp, 1 + (k % 4) * 0.3, Math.sin(a) * sp, 0.45, 0.06, 0.05)
      }
      return
    }
    for (let i = 0; i < N; i++) {
      p.set(this.x0[i]! + this.vx[i]! * t, this.y0[i]! + this.vy[i]! * t - 0.5 * G * t * t, this.z0[i]! + this.vz[i]! * t)
      q.setFromUnitVectors(UP, v.set(this.vx[i]!, this.vy[i]! - G * t, this.vz[i]!).normalize())
      m4.compose(p, q, s.set(WIDTH, this.len[i]!, WIDTH))
      this.shards.setMatrixAt(i, m4)
    }
    this.shards.count = N
    this.shards.instanceMatrix.needsUpdate = true
  }
}
