import type { BeastId } from '@spirit/core'
import { AegironPower } from './aegiron'
import { AgnyxPower } from './agnyx'
import { NagaraPower } from './nagara'
import type { PowerFactory } from './PowerFx'
import { VoltfangPower } from './voltfang'

export const POWERS: Partial<Record<BeastId, PowerFactory>> = {
  aegiron: (tex, cap) => new AegironPower(tex, cap),
  agnyx: (tex, cap) => new AgnyxPower(tex, cap),
  nagara: (tex, cap) => new NagaraPower(tex, cap),
  voltfang: (tex, cap) => new VoltfangPower(tex, cap),
}
