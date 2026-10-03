import { useEffect, useRef } from 'react'
import { AmbientLight, CircleGeometry, CylinderGeometry, DirectionalLight, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Scene, Sprite, SpriteMaterial, WebGLRenderer, type Texture } from 'three'
import { texture } from '../game/render/textures'

export type ViewFocus = 'blade' | 'disc' | 'tip' | 'beast'
export interface ViewerProps { blade: string; disc: string; tip: string; emblem: string; color: string; focus: ViewFocus; still: boolean }

const FOCUS_PITCH: Record<ViewFocus, number> = { blade: 1.05, disc: 0.75, tip: -0.12, beast: 1.2 }

function plate(r: number, y: number) {
  const m = new Mesh(new CircleGeometry(r, 64), new MeshBasicMaterial({ transparent: true, side: DoubleSide, depthWrite: false, alphaTest: 0.04 }))
  m.rotation.x = -Math.PI / 2
  m.position.y = y
  return m
}

export default function TopViewer(p: ViewerProps) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ set(p: ViewerProps): void } | null>(null)

  useEffect(() => {
    const el = host.current!
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    el.appendChild(renderer.domElement)
    const scene = new Scene()
    const camera = new PerspectiveCamera(32, 1, 0.1, 50)
    scene.add(new AmbientLight(0xffffff, 1.4))
    const sun = new DirectionalLight(0xffffff, 2.2)
    sun.position.set(2, 4, 3)
    scene.add(sun)
    const rim = new DirectionalLight(0x88ccff, 1.2)
    scene.add(rim)

    const top = new Group()
    const spinner = new Group()
    const body = new Mesh(new CylinderGeometry(0.62, 0.3, 0.2, 48), new MeshStandardMaterial({ color: 0x1c2336, metalness: 0.75, roughness: 0.35, emissive: 0x000000 }))
    body.position.y = 0.02
    const disc = plate(0.84, 0.125), blade = plate(1, 0.135), emblem = plate(0.34, 0.145)
    const under = plate(0.84, -0.081)
    spinner.add(body, under, disc, blade, emblem)
    const tip = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false }))
    tip.center.set(0.5, 1)
    tip.position.y = -0.06
    top.add(spinner, tip)
    scene.add(top)

    let props: ViewerProps = { ...p, blade: '', disc: '', tip: '', emblem: '' }
    const load = (id: string, apply: (t: Texture) => void) => void texture(id).then(t => { if (!disposed) apply(t) }).catch(() => undefined)
    const mat = (m: Mesh) => m.material as MeshBasicMaterial
    const set = (n: ViewerProps) => {
      const prev = props
      props = n
      if (prev.blade !== n.blade) load(`parts/blade-${n.blade}`, t => { mat(blade).map = t; mat(blade).needsUpdate = true })
      if (prev.disc !== n.disc) load(`parts/disc-${n.disc}`, t => { for (const m of [disc, under]) { mat(m).map = t; mat(m).needsUpdate = true } })
      if (prev.emblem !== n.emblem) load(n.emblem, t => { mat(emblem).map = t; mat(emblem).needsUpdate = true })
      if (prev.tip !== n.tip) load(`parts/tip-${n.tip}`, t => {
        const sm = tip.material as SpriteMaterial
        sm.map = t
        sm.needsUpdate = true
        const img = t.image as { width: number; height: number }
        const h = 0.5
        tip.scale.set(h * (img.width / img.height), h, 1)
      })
      ;(body.material as MeshStandardMaterial).emissive.set(n.color).multiplyScalar(0.18)
      rim.color.set(n.color)
      if (prev.tip && (prev.focus !== n.focus || prev.tip !== n.tip)) { targetPitch = FOCUS_PITCH[n.focus]; hold = 2.6 }
    }

    let yaw = 0.6, pitch = 0.55, targetPitch = 0.55, hold = 0, spin = 0, vyaw = 0
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
      pitch = Math.max(-0.35, Math.min(1.45, pitch + dy * 0.008))
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

    let disposed = false, last = performance.now(), t = 0, raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t += dt
      const still = props.still
      if (!drag) {
        idle += dt
        if (Math.abs(vyaw) > 0.01) { yaw += vyaw * dt; vyaw *= Math.pow(0.04, dt) }
        if (hold > 0) hold -= dt
        else if (idle > 2.5 && !still) { yaw += dt * 0.45; targetPitch = 0.5 + 0.55 * Math.sin(t * 0.45) }
        pitch += (targetPitch - pitch) * Math.min(1, dt * 3)
      }
      if (!still) spin += dt * 2.2
      spinner.rotation.y = spin
      const r = 3.75
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * r, Math.sin(pitch) * r - 0.05, Math.cos(yaw) * Math.cos(pitch) * r)
      camera.lookAt(0, -0.05, 0)
      rim.position.set(-camera.position.x, -1, -camera.position.z)
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(frame)
    set(p)
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
        const mm = m.material as MeshBasicMaterial | undefined
        mm?.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  useEffect(() => { api.current?.set(p) }, [p.blade, p.disc, p.tip, p.emblem, p.color, p.focus, p.still])

  return <div ref={host} className="top-viewer" role="img" aria-label="Your top. Drag to turn it around." />
}
