import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { artSampler, cachedRing } from '../../apps/client/src/game/render/partMesh'
import { parseRelief, reliefGeometry, type Relief } from '../../apps/client/src/game/render/reliefGeometry'

const PALETTE = [0x46507a, 0x5a8cff, 0x50e6a0, 0xffd250, 0xff5a78]
const COLS = 7
const GLOW = 0.55
const r = new THREE.WebGLRenderer({ antialias: true })
r.setPixelRatio(Math.min(2, devicePixelRatio))
r.setSize(innerWidth, innerHeight)
document.body.appendChild(r.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b1030)
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 200)
const ctl = new OrbitControls(cam, r.domElement)
ctl.enableDamping = true
scene.add(new THREE.AmbientLight(0x8fa8ff, 0.85))
const key = new THREE.DirectionalLight(0xffffff, 2.4)
key.position.set(3, 6, 4)
scene.add(key)
const rim = new THREE.DirectionalLight(0x38e8ff, 1.1)
rim.position.set(-4, 2, -3)
scene.add(rim)

interface Item { name: string; relief: THREE.Group; slab: THREE.Group; tiers: THREE.Group; spin: THREE.Group }
const items: Item[] = []
let mode: 'relief' | 'slab' | 'tiers' = 'relief'
let spin = true

const label = (t: string) => {
  const c = document.createElement('canvas')
  c.width = 320; c.height = 48
  const g = c.getContext('2d')!
  g.fillStyle = '#cfefff'; g.font = '26px sans-serif'; g.textAlign = 'center'; g.fillText(t, 160, 34)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }))
  s.scale.set(1.6, 0.24, 1)
  return s
}

function tierGroup(rel: Relief): THREE.Group {
  const g = new THREE.Group()
  rel.tiers.forEach((t, i) => {
    const one: Relief = { ...rel, tiers: [t] }
    g.add(new THREE.Mesh(reliefGeometry(one, 'garage'), [new THREE.MeshStandardMaterial({ color: PALETTE[i % PALETTE.length], roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0x222838 })]))
  })
  return g
}

async function add(name: string, i: number) {
  const [tex, rel] = await Promise.all([
    new THREE.TextureLoader().loadAsync(`/assets/final/parts/${name}.png`),
    fetch(`/apps/client/public/assets/relief/${name}.json`).then(x => x.json()).then(parseRelief),
  ])
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  if (!rel) throw new Error('bad relief ' + name)
  const x = (i % COLS - (COLS - 1) / 2) * 2.3, z = (Math.floor(i / COLS) - 1.5) * 2.5
  const spinG = new THREE.Group()
  spinG.position.set(x, 0, z)
  const relief = new THREE.Group()
  relief.add(new THREE.Mesh(reliefGeometry(rel, 'garage', artSampler(tex)), [new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: GLOW, alphaTest: 0.35, roughness: 0.55, metalness: 0.05 }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 })]))
  const slab = new THREE.Group()
  const s = cachedRing(name, tex, name.startsWith('blade-') ? 0.075 : 0.06, 0.012)
  slab.add(new THREE.Mesh(s.geometry, [new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.35 }), new THREE.MeshLambertMaterial({ color: s.edge })]))
  const tiers = tierGroup(rel)
  spinG.add(relief, slab, tiers)
  const lb = label(name.replace('blade-', 'Blade · ').replace('disc-', 'Disc · '))
  lb.position.set(x, 0.05, z + 1.25)
  scene.add(spinG, lb)
  items.push({ name, relief, slab, tiers, spin: spinG })
  apply()
}

function apply() {
  for (const it of items) { it.relief.visible = mode === 'relief'; it.slab.visible = mode === 'slab'; it.tiers.visible = mode === 'tiers' }
}

function view(v: 'top' | 'side' | 'close') {
  if (v === 'top') { cam.position.set(0, 18, 0.01); ctl.target.set(0, 0, 0.6) }
  if (v === 'side') { cam.position.set(0, 6.5, 13); ctl.target.set(0, 0, 0.6) }
  if (v === 'close') { const it = items[0]!; cam.position.set(it.spin.position.x, 1.1, it.spin.position.z + 2.2); ctl.target.copy(it.spin.position) }
}

const bar = document.getElementById('bar')!
const btn = (t: string, f: (b: HTMLButtonElement) => void) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => f(b); bar.appendChild(b); return b }
btn('Top', () => view('top'))
btn('Side', () => view('side'))
btn('Close-up', () => view('close'))
btn('Spin: on', b => { spin = !spin; b.textContent = 'Spin: ' + (spin ? 'on' : 'off') })
btn('Moulded', () => { mode = 'relief'; apply() })
btn("Today's slab", () => { mode = 'slab'; apply() })
btn('Tiers', () => { mode = 'tiers'; apply() })

const names: string[] = await fetch('/tools/relief/out/names.json').then(x => x.json())
await Promise.all(names.map((n, i) => add(n, i)))
view('side')
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); r.setSize(innerWidth, innerHeight) })
r.setAnimationLoop(() => { if (spin) for (const it of items) it.spin.rotation.y += 0.004; ctl.update(); r.render(scene, cam) })
;(window as unknown as Record<string, unknown>).focus = (name: string, elev = 28, dist = 2.6, m: typeof mode = 'relief') => {
  const it = items.find(x => x.name === name)
  if (!it) return false
  mode = m
  apply()
  spin = false
  const e = (elev * Math.PI) / 180
  ctl.target.copy(it.spin.position)
  cam.position.set(it.spin.position.x, dist * Math.sin(e), it.spin.position.z + dist * Math.cos(e))
  return true
}
;(window as unknown as { reviewReady: boolean }).reviewReady = true
