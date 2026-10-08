import type { BeastId } from '@spirit/core'
import { AegironPower } from './aegiron'
import { AgnyxPower } from './agnyx'
import { NagaraPower } from './nagara'
import type { PowerFactory } from './PowerFx'
import { UmbraxPower } from './umbrax'
import { VoltfangPower } from './voltfang'
import { ZephyraPower } from './zephyra'

export const POWERS: Partial<Record<BeastId, PowerFactory>> = {
  aegiron: (tex, cap) => new AegironPower(tex, cap),
  agnyx: (tex, cap) => new AgnyxPower(tex, cap),
  nagara: (tex, cap) => new NagaraPower(tex, cap),
  umbrax: tex => new UmbraxPower(tex),
  voltfang: (tex, cap) => new VoltfangPower(tex, cap),
  zephyra: (tex, cap) => new ZephyraPower(tex, cap),
}
