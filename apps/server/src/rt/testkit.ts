import { assembleTop, createBattle, STARTER_BUILDS, type RipResult } from '@spirit/core'

export const rip = (rpm: number): RipResult => ({ ok: true, rpm, quality: 'GREAT', overspin: false, style: 'flat', bankDir: 0, timing: 1, straightness: 1, pullRatio: 0.9, startT: 0 })
export const battle = (seed = 5) => createBattle([assembleTop(STARTER_BUILDS.voltfang), assembleTop(STARTER_BUILDS.aegiron)], [{ rip: rip(12000), hesitate: false }, { rip: rip(11000), hesitate: false }], seed)
