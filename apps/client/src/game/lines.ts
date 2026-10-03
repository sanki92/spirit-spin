import type { BeastId, Mood } from '@spirit/core'

type Bank = { greet: string[]; win: string[]; loss: string[]; comeback: string[]; hesitate: string[] }

export const LINES: Record<BeastId, Bank> = {
  voltfang: {
    greet: ['The storm is restless today. Let\'s give it somewhere to go.', 'I can hear thunder in your pulse. Good.', 'Rip hard. Rip true. I\'ll handle the rest.'],
    win: ['Ha! Did you feel that crack? That was us.', 'Too slow. Next!', 'That\'s how a storm wolf hunts.'],
    loss: ['Grr. They got the jump on us. Not again.', 'They got lucky. Run it back.', 'My fangs were dull today. Sharpen me.'],
    comeback: ['Three points down and we still tore through them. THAT is a storm.'],
    hesitate: ['…I don\'t know you yet.'],
  },
  aegiron: {
    greet: ['Steady hands make strong walls.', 'The mountain does not rush. Neither shall we.', 'I will hold. You aim true.'],
    win: ['They broke against us, as waves do.', 'Patience wins wars.', 'Well rooted, young one.'],
    loss: ['Even fortresses fall. We rebuild.', 'A crack in the wall teaches where to reinforce.', 'Hmm. We were too slow to plant ourselves.'],
    comeback: ['They thought the wall had fallen. Foolish.'],
    hesitate: ['…I do not yet know your weight.'],
  },
  nagara: {
    greet: ['The tide is turning in our favor tonight.', 'Shall we dance in the moonlight again?', 'Breathe out. Let them tire themselves.'],
    win: ['Like water around stone.', 'They spun themselves out. How sweet.', 'The moon smiles on us.'],
    loss: ['Even the tide retreats before it returns.', 'I lost my rhythm. Help me find it.', 'Hmm. They read our current.'],
    comeback: ['The tide always comes back. Always.'],
    hesitate: ['…the water is too murky. I can\'t see you yet.'],
  },
  agnyx: {
    greet: ['Ready to burn bright again?', 'A champion should never look bored. Let\'s go.', 'My wings are warm. Are yours?'],
    win: ['Bow before the sun!', 'As expected of us.', 'That flame was worthy of a crown.'],
    loss: ['…From ash, we rise. Watch.', 'A setback. Not a defeat of spirit.', 'They doused me today. Never twice.'],
    comeback: ['Phoenixes are born from ashes. I told you!'],
    hesitate: ['…I don\'t burn for strangers. Not yet.'],
  },
  zephyra: {
    greet: ['Whoosh! The sky is wide open today, co-pilot.', 'My wings are itching. Let\'s race something!', 'Feel that updraft? Today we fly.'],
    win: ['Whoosh! Pulled them right into our storm!', 'Too slow for the wind!', 'Did you see that? Again, again!'],
    loss: ['They caught the wind before us. Not next storm.', 'Hmph. The air was heavy today.', 'I flew too wide. My fault, co-pilot.'],
    comeback: ['Three points down and the storm still came for them. Whoosh!'],
    hesitate: ['…the wind doesn\'t know your voice yet.'],
  },
  umbrax: {
    greet: ['Quiet day. Good hunting weather. Mm.', 'I am ready when you are, hunter.', 'Breathe. Then we strike.'],
    win: ['They never saw me. Mm.', 'Clean. As planned.', 'The shadow always wins the long game.'],
    loss: ['They read my step. Next time they won\'t.', 'Lost the light today. Not the hunt.', 'Mm. I waited too long.'],
    comeback: ['Three points down. Then we vanished. Then we won. Mm.'],
    hesitate: ['…I don\'t step for strangers.'],
  },
}


const pick = (arr: string[], seed: number) => arr[Math.abs(seed) % arr.length] as string

export function lineFor(beast: BeastId, kind: 'greet' | 'win' | 'loss' | 'comeback' | 'hesitate', seed = Date.now()): string {
  return pick(LINES[beast][kind], Math.floor(seed / 1000))
}

export const MOOD_FOR_KIND: Record<string, Mood> = { greet: 'neutral', win: 'proud', loss: 'sad', comeback: 'joyful', hesitate: 'sulky' }
