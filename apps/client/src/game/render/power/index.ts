import type { BeastId } from '@spirit/core'
import { AegironPower } from './aegiron'
import { AgnyxPower } from './agnyx'
import { NagaraPower } from './nagara'
import type { PowerFactory } from './PowerFx'
import { UmbraxPower } from './umbrax'
import { VoltfangPower } from './voltfang'
import { ZephyraPower } from './zephyra'

export const POWERS: Partial<Record<BeastId, PowerFactory>> = {
  aegiron: (tex, cap, ult) => new AegironPower(tex, cap, ult),
  agnyx: (tex, cap, ult) => new AgnyxPower(tex, cap, ult),
  nagara: (tex, cap, ult) => new NagaraPower(tex, cap, ult),
  umbrax: (tex, _cap, ult) => new UmbraxPower(tex, ult),
  voltfang: (tex, cap, ult) => new VoltfangPower(tex, cap, ult),
  zephyra: (tex, cap, ult) => new ZephyraPower(tex, cap, ult),
}
