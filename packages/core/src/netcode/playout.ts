export const PLAYOUT = { prime: 6, high: 12 } as const

export const playoutSteps = (backlog: number): number => (backlog <= 0 ? 0 : backlog <= PLAYOUT.high ? 1 : backlog <= PLAYOUT.high * 4 ? 2 : 4)
