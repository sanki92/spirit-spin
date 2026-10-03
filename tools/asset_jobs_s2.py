"""Season 2 assets: two new beasts, twelve parts, VFX, HUD plates. Phases: a (independent), b (needs a), c (needs b)."""
import json, os

F = "F:/tmp/tp-proj-game/assets/final/"
C = "F:/tmp/tp-proj-game/assets/concept/"
T2, T15 = "gpt-image-2", "gpt-image-1.5"
STYLE = ("Art style: modern Japanese anime game art, cel-shaded with soft gradient shading, clean bold line art, highly saturated "
         "colors, dramatic rim lighting, premium polished top-tier 2020s anime mobile game. Completely original design, not based "
         "on any existing franchise. No watermark, no signature.")
CUT = "Isolated on a fully transparent background, nothing else in the image, no drop shadow on the background."
TOPDOWN = ("Strict orthographic view from directly above (camera looking straight down the spin axis), perfectly centered, "
           "perfectly round and rotationally symmetric, filling the frame edge to edge, no perspective, no shadow, flat even studio lighting.")

NEW = {
    "zephyra": dict(name="ZEPHYRA", el="swirling teal-mint storm wind and white storm clouds", ring="teal-mint and silver",
                    limbs="eagle head, four legs (front legs with eagle talons, hind legs feline), two large feathered wings, one long feathered tail",
                    head="storm griffin head with a sharp silver beak, GREEN eyes and a mane of swirling storm clouds",
                    lock="a STORM GRIFFIN: eagle head with a sharp silver beak and GREEN eyes, a mane of swirling white storm clouds, three long teal crest plumes swept back, teal-mint feathered wings veined with white wind currents, silver talons, pale white chest with spiral wind marks, four legs"),
    "umbrax": dict(name="UMBRAX", el="living ink-black shadow and magenta smoke", ring="obsidian black and magenta",
                   limbs="four legs, one long whip tail ending in a magenta shadow flame",
                   head="shadow panther head with glowing AMBER eyes and a flowing ink-smoke mane",
                   lock="a SHADOW PANTHER: sleek obsidian-black body, glowing AMBER eyes, a flowing mane of ink-black smoke, glowing MAGENTA rune markings along the shoulders and flanks, long whip tail ending in a magenta shadow flame, four legs, no horns"),
}
FORMS = {
    ("zephyra", "gale"): "GALE form: lighter and faster, wings doubled into four slim blade-like wings, crest plumes longer, wind ribbons trailing from the wings, brighter mint-white palette",
    ("zephyra", "eye"): "EYE OF THE STORM form: heavier and regal, a glowing calm storm-eye halo ring behind the head, darker storm-gray clouds with gold lightning edges, armored silver feathers on the chest",
    ("umbrax", "nightfang"): "NIGHTFANG form: leaner and feral, two long glowing magenta fangs, smoke mane flaring like black fire, more runes covering the body, eyes burning brighter amber",
    ("umbrax", "sovereign"): "SOVEREIGN form: regal and calm, a floating crown of black crystal shards above the head, a long smoke cape flowing from the shoulders, silver-white runes instead of magenta, deep violet-black body",
}
BLADES = {
    "fury": ("Crimson Fury", "a jagged aggressive ring of six hooked crimson-red blades, gunmetal frame, molten-red translucent plastic, sharp attack shape", "saw"),
    "gale": ("Gale Talon", "a ring of four swept-back feather-shaped talons, silver metal with teal-mint translucent plastic", "wing"),
    "prism": ("Bulwark Prism", "a thick round defensive ring of faceted crystal prism blocks, smooth bumper edges, steel with pale ice-blue translucent crystal", "dome"),
    "eclipse": ("Eclipse Shard", "a ring of crescent shards overlapping like an eclipse, black chrome with magenta translucent plastic accents", "halo"),
    "spiral": ("Thunder Spiral", "a ring of three spiral lightning blades twisting outward, yellow-gold metal with electric-blue translucent plastic", "fang"),
    "guard": ("Moon Guard", "a sturdy round ring with eight smooth rounded shield plates, brushed silver with soft lavender translucent plastic", "bastion"),
}
DISCS = {
    "titan": ("Titan Core", "a very thick heavy metal disc with deep bolted segments and a raised outer lip, dark gunmetal", "heavy"),
    "feather": ("Feather Disc", "a thin lightweight disc with large cutout holes in a feather pattern, white aluminium", "compact"),
    "gyro": ("Gyro Rim", "a disc with a heavy separate outer gyroscope rim ring and thin spokes to the center, polished chrome and teal", "rim"),
}
TIPS = {
    "spike": ("Spike", "a very sharp long needle performance tip, chrome", "needle"),
    "grip": ("Grip Flat", "a wide flat rubber performance tip with tread grooves, black rubber and red metal", "flat"),
    "wide": ("Wide Ball", "an extra-wide rounded ball performance tip, white polymer", "ball"),
}
HUD = {"voltfang": "electric-blue lightning", "aegiron": "emerald crystal", "nagara": "violet moonlight water", "agnyx": "crimson-gold fire",
       "zephyra": "teal-mint storm wind", "umbrax": "magenta shadow smoke"}

a, b, c = [], [], []

def J(lst, out, prompt, size="1024x1024", refs=None, model=T15, bg=None, quality="high", fid=None):
    job = {"out": F + out, "prompt": prompt, "size": size, "model": model, "quality": quality}
    if refs: job["refs"] = refs
    if bg: job["background"] = bg
    if fid and model != T2: job["input_fidelity"] = fid
    lst.append(job)

for k, v in NEW.items():
    J(a, f"beasts/{k}/turnaround.png",
      f"Character turnaround sheet of an original spirit beast: front view, side view and back view side by side, full body, neutral standing pose, "
      f"same scale in every view, plain light-gray background. Creature: {v['lock']}. Correct anatomy only: {v['limbs']}. Element: {v['el']} glowing "
      f"softly along the body. Match the rendering style and turnaround layout of the reference image. No text. {STYLE}",
      "1536x1024", [C + "02a-beast-voltfang-turnaround.png"], T2)

for bid, (name, desc, ref) in BLADES.items():
    J(a, f"parts/blade-{bid}.png", f"Spinning-top outer blade ring part '{name}': {desc}. Render ONLY the blade ring as seen from directly above, the center is an empty round hole. Match the rendering style, lighting and level of detail of the reference part exactly. {TOPDOWN} {CUT}",
      refs=[F + f"parts/blade-{ref}.png"], bg="transparent", quality="medium", fid="high")
for did, (name, desc, ref) in DISCS.items():
    J(a, f"parts/disc-{did}.png", f"Spinning-top metal weight disc part '{name}': {desc}, with a small round hole in the exact center. Match the rendering style of the reference part exactly. {TOPDOWN} {CUT}",
      refs=[F + f"parts/disc-{ref}.png"], bg="transparent", quality="medium", fid="high")
for tid, (name, desc, ref) in TIPS.items():
    J(a, f"parts/tip-{tid}.png", f"Spinning-top performance tip part '{name}': {desc}, side view, centered, upright. Match the framing, angle and rendering style of the reference tip exactly. {CUT}",
      refs=[F + f"parts/tip-{ref}.png"], bg="transparent", quality="medium", fid="high")

J(a, "vfx/hit-wind.png", "Game VFX sprite: a burst of swirling teal-mint wind gusts and white air slashes radiating from the center, bright and readable on dark backgrounds. "
  "Match the style and composition of the reference VFX sprite. " + CUT, refs=[F + "vfx/hit-lightning.png"], bg="transparent", quality="medium")
J(a, "vfx/hit-shadow.png", "Game VFX sprite: a burst of ink-black shadow smoke with glowing magenta sparks radiating from the center, readable on dark backgrounds. "
  "Match the style and composition of the reference VFX sprite. " + CUT, refs=[F + "vfx/hit-lightning.png"], bg="transparent", quality="medium")

for k, v in NEW.items():
    turn = F + f"beasts/{k}/turnaround.png"
    blade = F + f"parts/blade-{'gale' if k == 'zephyra' else 'eclipse'}.png"
    J(b, f"beasts/{k}/emblem.png",
      f"Circular game emblem badge. Inside: a stylized {v['head']} - the exact creature from the first reference image, 3/4 view facing left, bold simplified icon rendering. "
      f"Must show: {v['lock']}. Frame: copy the ring frame of the second reference image exactly (polished silver bevelled ring, exactly two gems: one at top, one at bottom), "
      f"only recolor its accents and gems {v['ring']}. Readable at 64px. No text. {CUT} {STYLE}", refs=[turn, F + "beasts/voltfang/emblem.png"], bg="transparent")
    J(b, f"beasts/{k}/card-art.png",
      f"Vertical collectible card illustration: the exact creature from the first reference image as a giant glowing semi-translucent spirit made of {v['el']}, rising behind "
      f"a small spinning battle top (its blade looks like the second reference image) on a glowing stadium floor. Correct anatomy only: {v['limbs']}. Dramatic upward angle, "
      f"energy swirling. The bottom 20% is darker and calmer for a name plate. No text, no card border. {STYLE}", "1024x1536", [turn, blade], T2)
    J(b, f"beasts/{k}/cutin.png",
      f"Ultra-dynamic anime special-move cut-in banner of the exact creature from the reference image. Composition: the creature's head and front body burst diagonally from "
      f"the right toward the camera, face in the right-center third, the rest of its body and an energy trail streaming off to the left edge. Correct anatomy only: {v['limbs']}. "
      f"The entire creature is a glowing semi-translucent spirit made of {v['el']} energy with bright inner glow and rim light, mid-roar. Speed lines, pure black background. "
      f"No text. {STYLE}", "1536x1024", [turn], T2)
    J(b, f"beasts/{k}/summon.png",
      f"The exact same creature as the reference, identical design and colors. Full body, summoning pose: rising up and lunging toward the viewer, three-quarter front view, "
      f"head and chest large in frame, roaring, wings, limbs or tail spread for a powerful silhouette. Correct anatomy only: {v['limbs']}. Its elemental energy ({v['el']}) wraps "
      f"tightly around its body only. Entire creature fits inside the frame with a small margin. No ground, no background scenery, no text, no frame, no spinning top. {STYLE} {CUT}",
      "1024x1536", [turn], bg="transparent", fid="high")
    J(b, f"beasts/{k}/expressions-sheet.png",
      "Using the exact creature from the reference image (same design, colors, markings), create a dialogue portrait expression sheet. Layout: 3 columns x 2 rows, all six "
      "portraits identical head-and-shoulders bust framing, head at the same height and same size in every cell, facing 3/4 toward the viewer, with a wide empty gap between "
      "portraits so they never touch or overlap. Order: 1 NEUTRAL: calm, mouth closed. 2 PROUD: chin raised, confident smirk. 3 FURIOUS: roaring, teeth bared. 4 SAD: head "
      "lowered, glossy eyes, one tear. 5 SULKY/REFUSING: head turned away in profile, eyes shut, pouting. 6 JOYFUL: happy closed crescent eyes, gentle smile, head tilted, "
      f"sparkles. DESIGN LOCK - every portrait must show: {v['lock']}. No text, no labels. {CUT} {STYLE}", "1536x1024", [turn], bg="transparent", quality="medium", fid="high")

for (k, form), desc in FORMS.items():
    v = NEW[k]
    turn = F + f"beasts/{k}/turnaround.png"
    base = f"The same creature as the reference image, evolved into its {desc}. Keep its identity readable: {v['lock']}."
    J(c, f"beasts/{k}/awakened-{form}/card-art.png", f"Vertical collectible card illustration. {base} It rises as a giant glowing spirit made of {v['el']} behind a small spinning battle top on a glowing stadium floor. Dramatic upward angle. Bottom 20% darker for a name plate. No text, no border. {STYLE}", "1024x1536", [turn], T2, quality="medium")
    J(c, f"beasts/{k}/awakened-{form}/cutin.png", f"Ultra-dynamic anime special-move cut-in banner. {base} Head and front body burst diagonally from the right toward the camera, energy trail to the left, glowing semi-translucent spirit of {v['el']}, mid-roar. Speed lines, pure black background. No text. {STYLE}", "1536x1024", [turn], T2, quality="medium")
    J(c, f"beasts/{k}/awakened-{form}/emblem.png", f"Circular game emblem badge of the creature in its awakened form. {base} 3/4 view facing left, bold simplified icon. Frame: copy the ring frame of the second reference image exactly but GOLD instead of silver. Readable at 64px. No text. {CUT} {STYLE}", refs=[turn, F + "beasts/voltfang/emblem.png"], bg="transparent", quality="medium")
    J(c, f"beasts/{k}/awakened-{form}/summon.png", f"{base} Full body, summoning pose lunging toward the viewer, three-quarter front view, roaring, energy wrapped tightly around the body only. Fits inside the frame. No ground, no background, no text. {STYLE} {CUT}", "1024x1536", [turn], bg="transparent", quality="medium", fid="high")
    J(c, f"beasts/{k}/awakened-{form}/expressions-sheet.png", f"Dialogue portrait expression sheet of the creature in its awakened form. {base} 3 columns x 2 rows, identical bust framing, wide gaps between portraits. Order: NEUTRAL, PROUD, FURIOUS, SAD (one tear), SULKY (head turned away, eyes shut), JOYFUL (happy closed eyes, gentle smile). No text. {CUT} {STYLE}", "1536x1024", [turn], bg="transparent", quality="medium", fid="high")
for k, v in NEW.items():
    J(c, f"launchers/{k}.png",
      "A single futuristic ripcord launcher for spinning tops, IDENTICAL in shape and silhouette to the first reference image (same vertical body, same round emblem window in "
      f"the middle, same toothed ripcord strip sticking straight up out of the top, same handle at the bottom), recolored {v['ring']} with the emblem from the second reference "
      f"image in the emblem window. {CUT} {STYLE}", "1024x1536", [F + "launchers/voltfang.png", F + f"beasts/{k}/emblem.png"], bg="transparent", quality="medium", fid="high")
for k, el in HUD.items():
    J(c, f"ui/hud-plate-{k}.png",
      f"Wide horizontal game HUD name plate, a slanted futuristic panel frame for a player name and a health bar, themed with {el} accents: glowing edges, small elemental "
      "flourishes at the outer end only, dark semi-transparent navy glass interior left plain and empty for text, clean readable, symmetric top and bottom edges. "
      f"Flat front view, no text, no icons inside. {CUT} {STYLE}", "1536x1024", [F + "ui/card-frame-epic.png"], bg="transparent", quality="medium")

here = os.path.dirname(os.path.abspath(__file__))
for name, lst in (("jobs-s2a.json", a), ("jobs-s2b.json", b), ("jobs-s2c.json", c)):
    json.dump(lst, open(os.path.join(here, name), "w"), indent=1)
print("s2a", len(a), "s2b", len(b), "s2c", len(c))
