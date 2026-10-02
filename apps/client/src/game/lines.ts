import type { BeastId, Mood, Reply } from '@spirit/core'

type Bank = { greet: string[]; win: string[]; loss: string[]; comeback: string[]; hesitate: string[]; reply: Record<Reply, string> }

export const LINES: Record<BeastId, Bank> = {
  voltfang: {
    greet: ['The storm is restless today. Let\'s give it somewhere to go.', 'I can hear thunder in your pulse. Good.', 'Rip hard. Rip true. I\'ll handle the rest.'],
    win: ['Ha! Did you feel that crack? That was us.', 'Too slow. Next!', 'That\'s how a storm wolf hunts.'],
    loss: ['Grr. They got the jump on us. Not again.', 'They got lucky. Run it back.', 'My fangs were dull today. Sharpen me.'],
    comeback: ['Three points down and we still tore through them. THAT is a storm.'],
    hesitate: ['…I don\'t know you yet.'],
    reply: { celebrate: 'Howl with me!', humble: 'Fine. I\'ll stay grounded. For now.', push: 'Harder? Now you\'re speaking my language.', comfort: '…Thanks. I needed that.', analyze: 'You saw their opening too? Next time we strike first.', fireup: 'YES. Let the sky split!' },
  },
  aegiron: {
    greet: ['Steady hands make strong walls.', 'The mountain does not rush. Neither shall we.', 'I will hold. You aim true.'],
    win: ['They broke against us, as waves do.', 'Patience wins wars.', 'Well rooted, young one.'],
    loss: ['Even fortresses fall. We rebuild.', 'A crack in the wall teaches where to reinforce.', 'Hmm. We were too slow to plant ourselves.'],
    comeback: ['They thought the wall had fallen. Foolish.'],
    hesitate: ['…I do not yet know your weight.'],
    reply: { celebrate: 'A small joy, then back to work.', humble: 'Wise. The proud crumble first.', push: 'Then we train until the stone sings.', comfort: 'Your words are a warm stone. Thank you.', analyze: 'Yes. Study the strike, and the wall grows.', fireup: 'Hrm! The mountain stirs!' },
  },
  nagara: {
    greet: ['The tide is turning in our favor tonight.', 'Shall we dance in the moonlight again?', 'Breathe out. Let them tire themselves.'],
    win: ['Like water around stone.', 'They spun themselves out. How sweet.', 'The moon smiles on us.'],
    loss: ['Even the tide retreats before it returns.', 'I lost my rhythm. Help me find it.', 'Hmm. They read our current.'],
    comeback: ['The tide always comes back. Always.'],
    hesitate: ['…the water is too murky. I can\'t see you yet.'],
    reply: { celebrate: 'Let\'s glow a little brighter tonight.', humble: 'Quiet waters run deep.', push: 'Then let the current grow stronger.', comfort: 'You\'re kind. The waves feel calmer.', analyze: 'Curious, aren\'t they? Let\'s learn their pattern.', fireup: 'A storm-tide, then! Let it rise!' },
  },
  agnyx: {
    greet: ['Ready to burn bright again?', 'A champion should never look bored. Let\'s go.', 'My wings are warm. Are yours?'],
    win: ['Bow before the sun!', 'As expected of us.', 'That flame was worthy of a crown.'],
    loss: ['…From ash, we rise. Watch.', 'A setback. Not a defeat of spirit.', 'They doused me today. Never twice.'],
    comeback: ['Phoenixes are born from ashes. I told you!'],
    hesitate: ['…I don\'t burn for strangers. Not yet.'],
    reply: { celebrate: 'Yes! Let the whole arena see us shine!', humble: 'Hmph. Humble suits you. Maybe me too.', push: 'Higher, hotter! I like that.', comfort: '…I wasn\'t sad. But thank you.', analyze: 'You noticed their weakness? Clever partner.', fireup: 'INFERNO! Let it burn!' },
  },
}

export const REPLIES_WIN: Reply[] = ['celebrate', 'humble', 'push']
export const REPLIES_LOSS: Reply[] = ['comfort', 'analyze', 'fireup']
export const REPLY_LABEL: Record<Reply, string> = { celebrate: 'Celebrate', humble: 'Stay humble', push: 'Push harder', comfort: 'Comfort', analyze: 'Study the loss', fireup: 'Fire up' }

const pick = (arr: string[], seed: number) => arr[Math.abs(seed) % arr.length] as string

export function lineFor(beast: BeastId, kind: 'greet' | 'win' | 'loss' | 'comeback' | 'hesitate', seed = Date.now()): string {
  return pick(LINES[beast][kind], Math.floor(seed / 1000))
}

export const MOOD_FOR_KIND: Record<string, Mood> = { greet: 'neutral', win: 'proud', loss: 'sad', comeback: 'joyful', hesitate: 'sulky' }
