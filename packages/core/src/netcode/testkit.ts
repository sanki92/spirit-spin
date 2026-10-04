import { assembleTop, STARTER_BUILDS } from '../parts'
import type { RipResult } from '../rip'
import { createBattle } from '../battle'
import type { Frame } from './replay'

export const rip = (rpm: number, extra: Partial<RipResult> = {}): RipResult => ({ ok: true, rpm, quality: 'GREAT', overspin: false, style: 'flat', bankDir: 0, timing: 1, straightness: 1, pullRatio: 0.9, startT: 0, ...extra })
export const fresh = (seed = 7) => createBattle([assembleTop(STARTER_BUILDS.voltfang), assembleTop(STARTER_BUILDS.aegiron)], [{ rip: rip(12000, { style: 'bank', bankDir: 1 }), hesitate: false }, { rip: rip(11000), hesitate: false }], seed)
export const f = (ax: number, ay: number, asp: number, bx: number, by: number, bsp: number): Frame => [{ x: ax, y: ay, sp: asp }, { x: bx, y: by, sp: bsp }]
