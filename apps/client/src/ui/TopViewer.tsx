import { useEffect, useRef } from 'react'
import { AmbientLight, BufferGeometry, Color, CylinderGeometry, DirectionalLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer, type Texture } from 'three'
import { cachedRing, cachedTip } from '../game/render/partMesh'
import { texture } from '../game/render/textures'

export type ViewFocus = 'blade' | 'disc' | 'tip' | 'beast'
export interface ViewerProps { blade: string; disc: string; tip: string; emblem: string; color: string; focus: ViewFocus; still: boolean; onReady?: () => void }

const FOCUS_PITCH: Record<ViewFocus, number> = { blade: 1.0, disc: 0.55, tip: -0.18, beast: 1.15 }
const BLADE_Y = 0.065, BLADE_D = 0.075, DISC_D = 0.06, CORE_H = 0.11, TIP_H = 0.44

const skin = () => new MeshStandardMaterial({ metalness: 0.15, roughness: 0.55, alphaTest: 0.35 })
const wall = () => new MeshStandardMaterial({ metalness: 0.6, roughness: 0.35 })

let shared: WebGLRenderer | null = null
const getRenderer = () => {
  if (!shared) {
    shared = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    shared.setPixelRatio(Math.min(2, devicePixelRatio))
  }
  return shared
}

function buildStage() {
    const scene = new Scene()
    const camera = new PerspectiveCamera(32, 1, 0.1, 50)
    scene.add(new AmbientLight(0xffffff, 1.5))
    const sun = new DirectionalLight(0xffffff, 2.4)
    sun.position.set(2, 4, 3)
    scene.add(sun)
    const rim = new DirectionalLight(0x88ccff, 1.4)
    scene.add(rim)

    const spinner = new Group()
    const metal = new MeshStandardMaterial({ color: 0x2a3146, metalness: 0.55, roughness: 0.38 })
    const core = new Mesh(new CylinderGeometry(0.4, 0.22, CORE_H, 48), metal)
    core.position.y = -CORE_H / 2
    const disc = new Mesh(new BufferGeometry(), [skin(), wall()])
    disc.scale.set(0.86, 1, 0.86)
    const blade = new Mesh(new BufferGeometry(), [skin(), wall()])
    blade.position.y = BLADE_Y
    const coinTop = new MeshStandardMaterial({ metalness: 0.15, roughness: 0.55, alphaTest: 0.35 })
    const rimMetal = new MeshStandardMaterial({ color: 0xb8c0d4, metalness: 0.7, roughness: 0.3 })
    const coin = new Mesh(new CylinderGeometry(0.31, 0.31, 0.04, 64), [rimMetal, coinTop, metal])
    coin.position.y = BLADE_Y + BLADE_D + 0.02
    const tip = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ metalness: 0.2, roughness: 0.45, alphaTest: 0.35 }))
    tip.position.y = -CORE_H + 0.004
    spinner.add(core, disc, blade, coin)
    scene.add(spinner, tip)
    return { scene, camera, rim, spinner, metal, core, disc, blade, coinTop, coin, tip }
}

export default function TopViewer(p: ViewerProps) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ set(p: ViewerProps): void } | null>(null)

  useEffect(() => {
    const el = host.current!
    const renderer = getRenderer()
    el.appendChild(renderer.domElement)
    const { scene, camera, rim, spinner, metal, core, disc, blade, coinTop, coin, tip } = buildStage()

    let props: ViewerProps = { ...p, blade: '', disc: '', tip: '', emblem: '' }
    let disposed = false, booted = false
    const load = (id: string, apply: (t: Texture) => void) => void texture(id).then(t => { if (!disposed) apply(t) }).catch(() => undefined)
    const remesh = (m: Mesh, g: BufferGeometry, t: Texture, edge?: Color) => {
      m.geometry.dispose()
      m.geometry = g
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as MeshStandardMaterial[]
      mats[0]!.map = t
      mats[0]!.needsUpdate = true
      if (edge && mats[1]) mats[1].color.copy(edge).multiplyScalar(0.8)
    }
    const applyTip = (t: Texture, id: string) => {
      const { geometry, radius } = cachedTip(`tip-${id}`, t, TIP_H)
      remesh(tip, geometry, t)
      core.geometry.dispose()
      core.geometry = new CylinderGeometry(0.4, Math.max(0.12, radius + 0.02), CORE_H, 48)
    }
    const boot = (n: ViewerProps) => {
      void Promise.all([texture(`parts/blade-${n.blade}`), texture(`parts/disc-${n.disc}`), texture(`parts/tip-${n.tip}`), texture(n.emblem).catch(() => null)]).then(async ([bt, dt, tt, et]) => {
        if (disposed) return
        const rb = cachedRing(`blade-${n.blade}`, bt, BLADE_D, 0.012), rd = cachedRing(`disc-${n.disc}`, dt, DISC_D, 0.01)
        remesh(blade, rb.geometry, bt, rb.edge)
        remesh(disc, rd.geometry, dt, rd.edge)
        applyTip(tt, n.tip)
        if (et) { coinTop.map = et; coinTop.needsUpdate = true }
        await renderer.compileAsync(scene, camera).catch(() => undefined)
        if (disposed) return
        const latest = props
        props = { ...latest, blade: n.blade, disc: n.disc, tip: n.tip, emblem: n.emblem }
        booted = true
        set(latest)
      }).catch(() => { booted = true })
    }
    const set = (n: ViewerProps) => {
      const prev = props
      props = n
      if (!booted) return
      if (prev.blade !== n.blade) load(`parts/blade-${n.blade}`, t => { if (props.blade !== n.blade) return; const r = cachedRing(`blade-${n.blade}`, t, BLADE_D, 0.012); remesh(blade, r.geometry, t, r.edge) })
      if (prev.disc !== n.disc) load(`parts/disc-${n.disc}`, t => { if (props.disc !== n.disc) return; const r = cachedRing(`disc-${n.disc}`, t, DISC_D, 0.01); remesh(disc, r.geometry, t, r.edge) })
      if (prev.emblem !== n.emblem) load(n.emblem, t => { if (props.emblem !== n.emblem) return; coinTop.map = t; coinTop.needsUpdate = true })
      if (prev.tip !== n.tip) load(`parts/tip-${n.tip}`, t => { if (props.tip === n.tip) applyTip(t, n.tip) })
      paint(n)
      if (prev.tip && (prev.focus !== n.focus || prev.tip !== n.tip)) { targetPitch = FOCUS_PITCH[n.focus]; hold = 2.6 }
    }
    const paint = (n: ViewerProps) => {
      rim.color.set(n.color)
      metal.emissive.set(n.color).multiplyScalar(0.06)
    }

    let yaw = 0.6, pitch = 0.5, targetPitch = 0.5, hold = 0, spin = 0, vyaw = 0
    let drag: { x: number; y: number; id: number } | null = null
    let idle = 0
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; el.setPointerCapture(e.pointerId); vyaw = 0 }
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.x = e.clientX
      drag.y = e.clientY
      yaw -= dx * 0.012
      vyaw = -dx * 0.012 * 60
      pitch = Math.max(-0.45, Math.min(1.45, pitch + dy * 0.008))
      targetPitch = pitch
      idle = 0
    }
    const up = (e: PointerEvent) => { if (drag?.id === e.pointerId) drag = null; idle = 0 }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    let last = performance.now(), t = 0, raf = 0, ready = false
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden || !booted) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t += dt
      const still = props.still
      if (!drag) {
        idle += dt
        if (Math.abs(vyaw) > 0.01) { yaw += vyaw * dt; vyaw *= Math.pow(0.04, dt) }
        if (hold > 0) hold -= dt
        else if (idle > 2.5 && !still) { yaw += dt * 0.45; targetPitch = 0.42 + 0.6 * Math.sin(t * 0.45) }
        pitch += (targetPitch - pitch) * Math.min(1, dt * 3)
      }
      if (!still) spin += dt * 1.6
      spinner.rotation.y = spin
      tip.rotation.y = yaw
      const r = 3.9, cy = -0.12
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * r, Math.sin(pitch) * r + cy, Math.cos(yaw) * Math.cos(pitch) * r)
      camera.lookAt(0, cy, 0)
      rim.position.set(-camera.position.x, -1, -camera.position.z)
      renderer.render(scene, camera)
      if (!ready && blade.geometry.attributes.position && disc.geometry.attributes.position && tip.geometry.attributes.position) { ready = true; props.onReady?.() }
    }
    raf = requestAnimationFrame(frame)
    if (import.meta.env.DEV) (window as unknown as { __viewer: object }).__viewer = { scene, spinner, core, disc, blade, tip, coin, setPitch: (v: number) => { targetPitch = v; pitch = v; hold = 99 } }
    paint(p)
    boot(p)
    api.current = { set }
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      scene.traverse(o => {
        const m = o as Mesh
        m.geometry?.dispose()
        for (const mm of (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as MeshStandardMaterial[]) mm.dispose()
      })
      renderer.domElement.remove()
    }
  }, [])

  useEffect(() => { api.current?.set(p) }, [p.blade, p.disc, p.tip, p.emblem, p.color, p.focus, p.still])

  return <div ref={host} className="top-viewer" role="img" aria-label="Your top. Drag to turn it around." />
}

let warmStage: ReturnType<typeof buildStage> | null = null

export async function prewarmTop(b: { bladeId: string; discId: string; tipId: string; beastId?: string }): Promise<void> {
  const [bt, dt, tt, et] = await Promise.all([texture(`parts/blade-${b.bladeId}`), texture(`parts/disc-${b.discId}`), texture(`parts/tip-${b.tipId}`), texture(`beasts/${b.beastId ?? 'voltfang'}/emblem-disc`).catch(() => null)])
  const idle = (f: () => void) => ((window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ?? ((g: () => void) => window.setTimeout(g, 50)))(f)
  const step = (f: () => void) => new Promise<void>(r => idle(() => { f(); r() }))
  let rb!: ReturnType<typeof cachedRing>, rd!: ReturnType<typeof cachedRing>, tg!: ReturnType<typeof cachedTip>
  await step(() => { rb = cachedRing(`blade-${b.bladeId}`, bt, BLADE_D, 0.012) })
  await step(() => { rd = cachedRing(`disc-${b.discId}`, dt, DISC_D, 0.01) })
  await step(() => { tg = cachedTip(`tip-${b.tipId}`, tt, TIP_H) })
  if (warmStage) return
  await step(() => {
    const st = buildStage()
    const put = (m: Mesh, g: BufferGeometry, t: Texture) => { m.geometry = g; ((Array.isArray(m.material) ? m.material[0] : m.material) as MeshStandardMaterial).map = t }
    put(st.blade, rb.geometry, bt)
    put(st.disc, rd.geometry, dt)
    put(st.tip, tg.geometry, tt)
    if (et) st.coinTop.map = et
    warmStage = st
  })
  await getRenderer().compileAsync(warmStage!.scene, warmStage!.camera).catch(() => undefined)
}
