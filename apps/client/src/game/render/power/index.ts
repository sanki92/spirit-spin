import type { BeastId } from '@spirit/core'
import { AegironPower } from './aegiron'
import type { PowerFactory } from './PowerFx'
import { VoltfangPower } from './voltfang'

export const POWERS: Partial<Record<BeastId, PowerFactory>> = {
  aegiron: (tex, cap) => new AegironPower(tex, cap),
  voltfang: (tex, cap) => new VoltfangPower(tex, cap),
}
