import type { BeastId } from '@spirit/core'

export interface BeastInfo { id: BeastId; name: string; element: 'lightning' | 'crystal' | 'water' | 'fire' | 'wind' | 'shadow'; color: string; title: string }

export const BEASTS: Record<BeastId, BeastInfo> = {
  voltfang: { id: 'voltfang', name: 'VOLTFANG', element: 'lightning', color: '#38b6ff', title: 'Storm Wolf' },
  aegiron: { id: 'aegiron', name: 'AEGIRON', element: 'crystal', color: '#2fe08a', title: 'Crystal Fortress' },
  nagara: { id: 'nagara', name: 'NAGARA', element: 'water', color: '#b28cff', title: 'Moon Serpent' },
  agnyx: { id: 'agnyx', name: 'AGNYX', element: 'fire', color: '#ff7a3a', title: 'Crimson Firebird' },
  zephyra: { id: 'zephyra', name: 'ZEPHYRA', element: 'wind', color: '#5eead4', title: 'Storm Griffin' },
  umbrax: { id: 'umbrax', name: 'UMBRAX', element: 'shadow', color: '#ff4fa3', title: 'Shadow Panther' },
}
