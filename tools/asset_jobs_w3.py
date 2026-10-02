"""Wave-3 asset jobs (Phase 2 plan). `python asset_jobs_w3.py` writes jobs-w3a.json (independent) and jobs-w3b.json
(derived from awakened turnarounds made in w3a). Run each with tools/gen_images.py."""
import json, os

C = "F:/tmp/tp-proj-game/assets/concept/"
F = "F:/tmp/tp-proj-game/assets/final/"
T2, T15 = "gpt-image-2", "gpt-image-1.5"
STYLE = ("Art style: modern Japanese anime game art, cel-shaded with soft gradient shading, clean bold line art, highly saturated "
         "colors, dramatic rim lighting, premium polished top-tier 2020s anime mobile game. Completely original design, not based "
         "on any existing franchise. No watermark, no signature.")
CUT = "Isolated on a fully transparent background, nothing else in the image, no drop shadow on the background."
LETTERING = ("Lettering must match the reference logo's style exactly: bold italic chrome-metal letters with sharp bevels, "
             "dark outline and energy edges.")
TOPDOWN = ("Strict orthographic view from directly above (camera looking straight down the spin axis), perfectly centered, "
           "perfectly round and rotationally symmetric, filling the frame edge to edge, no perspective, no shadow, flat even studio lighting.")

a, b = [], []
def J(lst, out, prompt, size="1024x1024", refs=None, model=T15, bg="transparent", fid=None):
    job = {"out": F + out, "prompt": prompt, "size": size, "model": model}
    if refs: job["refs"] = refs
    if bg: job["background"] = bg
    if fid and model != T2: job["input_fidelity"] = fid
    lst.append(job)

TOP = {k: F + f"tops/{k}-sheet.png" for k in ["voltfang", "aegiron", "nagara", "agnyx"]}

# ---------- parts: top-down layers ----------
for blade, top in {"fang": "voltfang", "bastion": "aegiron", "crescent": "nagara", "wing": "agnyx"}.items():
    J(a, f"parts/blade-{blade}.png",
      "From the spinning top in the reference sheet, render ONLY its outer blade ring part as seen from directly above. "
      f"The center of the ring is an empty round hole showing nothing (transparent). No disc, no tip, no emblem chip. {TOPDOWN} {CUT}",
      refs=[TOP[top]], fid="high")
NEW_BLADES = {
    "saw": "a vicious circular-saw ring with 12 small hooked teeth, gunmetal steel with crimson translucent plastic accents",
    "dome": "a thick smooth rounded dome-shaped ring with no sharp edges, polished steel with deep teal translucent plastic",
    "halo": "a ring with 6 alternating rounded and pointed contact points, brushed silver with pale white-gold translucent plastic",
    "tempest": "a legendary ring of 3 long sweeping storm-blade spikes, black chrome with gold trim and electric-purple translucent plastic",
}
for k, d in NEW_BLADES.items():
    J(a, f"parts/blade-{k}.png",
      f"An original outer blade ring part for a battle spinning top: {d}. Same material quality, scale and rendering style as the "
      f"reference top. The center is an empty round hole (transparent). Only this one part. {TOPDOWN} {CUT}", refs=[TOP["voltfang"]])
DISCS = {
    "standard": "a plain polished steel weight disc with 4 radial grooves",
    "heavy": "a thick dark tungsten weight disc with 6 hex bolts, visibly heavy",
    "rim": "a weight disc whose mass is concentrated in a raised heavy outer rim, thin center web",
    "compact": "a small lightweight aluminum disc with 6 round cut-out holes",
    "orbit": "a gold-and-steel disc with 3 rounded weight lobes evenly around its edge",
}
for k, d in DISCS.items():
    J(a, f"parts/disc-{k}.png",
      f"A metal weight disc part for a battle spinning top: {d}. A round hole in the exact center. Matches the metal disc in the "
      f"reference top sheet in material and style. Only this one part. {TOPDOWN} {CUT}", refs=[TOP["aegiron"]])
TIPS = {
    "flat": "a wide flat rubber tip", "ball": "a round ball tip", "needle": "a sharp needle point tip", "semi": "a semi-flat rounded tip",
    "rush": "an aggressive wide flat tip with a ridged rubber edge", "orb": "a large smooth orb tip with a metal band",
}
for k, d in TIPS.items():
    J(a, f"parts/tip-{k}.png",
      f"Side profile view of only the bottom tip part of a battle spinning top: {d}, short cylindrical body on top, tip pointing "
      f"down, centered. Neutral materials only: polished silver metal and clear colorless transparent plastic, no colored tint. "
      f"Clean stylized product render. Only this one part. {CUT}")

# ---------- stadium bowl textures (pockets are geometry, never painted) ----------
BOWLS = {"classic": "dark brushed gunmetal with thin glowing cyan circuit lines spiraling to the center",
         "volcano": "black basalt rock with glowing orange lava cracks spiraling to the center",
         "frozen-moon": "pale frosted ice crystal with glowing silver moonlight lines spiraling to the center"}
for k, d in BOWLS.items():
    J(a, f"stadium/bowl-{k}.png",
      f"Top-down orthographic view of the inner floor of a circular spinning-top battle stadium bowl: {d}, concentric rings, a "
      f"slightly brighter smooth center dish. The bowl is a perfect circle filling the frame; the rim is continuous with NO gaps, "
      f"slots or pockets. Everything outside the circle is pure black. Flat even lighting, no objects, no tops, no text.",
      refs=[F + f"stadium/{'volcano' if k == 'volcano' else 'frozen-moon' if k == 'frozen-moon' else 'volcano'}-sheet.png"] if k != "classic" else [C + "07a-stadium-sheet.png"],
      model=T2, bg=None)

# ---------- rip callouts: ONE neutral style, intensity by tier ----------
CALL = {"perfect": ('"PERFECT"', "brilliant white-gold chrome with radiant light rays and sparkles"),
        "great": ('"GREAT"', "bright silver-white chrome with clean light streaks"),
        "good": ('"GOOD"', "plain steel chrome, modest glow"),
        "weak": ('"WEAK"', "dull gray chrome, slightly cracked, no glow"),
        "overspin": ('"OVERSPIN!"', "white chrome with hazard amber warning streaks and wobbly motion lines")}
for k, (text, look) in CALL.items():
    J(a, f"ui/callout-{k}.png",
      f"Huge anime game callout text {text} (spelled exactly, nothing else written), {look}. Neutral palette: no blue, green, violet "
      f"or crimson themed elements, no creatures. {LETTERING} Centered, wide. {CUT}", size="1536x1024", refs=[C + "11a-logo.png"])

# ---------- type icons: neutral metal badge, type colors deliberately differ from beast colors ----------
TYPES = {"attack": ("two crossed blades", "red"), "defense": ("a heater shield", "blue"),
         "stamina": ("an infinity loop", "green"), "balance": ("a split yin-yang style circle", "white-silver")}
for k, (sym, col) in TYPES.items():
    J(a, f"ui/type-{k}.png",
      f"Round game type icon: a polished gunmetal metal badge with {sym} engraved in the center, a thin {col} glowing accent ring "
      f"around the edge. Identical badge shape, metal and lighting for every type; only the symbol and accent color change. "
      f"No elemental effects, no creatures, no text. Centered. {CUT}", refs=[C + "11f-ui-kit.png"])

# ---------- onboarding illustrations (same character art style as the rival) ----------
RIVAL = C + "08-rival-expressions.png"
J(a, "onboarding/safety-grip.png",
  "Friendly anime illustration in the exact art style of the reference character: a teen holding a smartphone upright with BOTH "
  "hands at chest height, screen facing them, with bold motion arrows showing a short sharp pull DOWN toward their own body; the "
  "phone never leaves the hands. Small green check mark. No text. " + CUT, size="1024x1536", refs=[RIVAL])
J(a, "onboarding/no-throw.png",
  "Anime icon illustration: a smartphone flying out of a hand with a big red prohibition circle over it. No text. " + CUT, refs=[RIVAL])
J(a, "onboarding/calibrate.png",
  "Anime illustration: three translucent ghost positions of a smartphone held upright, each slightly lower, connected by a curved "
  "motion arc, with three small glowing numbered circles 1, 2, 3 (only those digits). Cyan and gold accents. " + CUT, refs=[RIVAL])
J(a, "onboarding/tap-ready.png",
  "Anime illustration: a hand tapping a big glowing round button on a smartphone screen; the phone screen shows a stylized "
  "spinning-top launcher; small motion lines and a sound-wave icon around it. No text. " + CUT, refs=[RIVAL])

# ---------- Tower bosses ----------
BOSSES = {
    "mira": "a calm 17-year-old girl, long silver hair in a low ponytail, kimono-inspired white-and-violet jacket, serene smile",
    "brick": "a big broad-shouldered 18-year-old boy, buzz cut, orange construction-style vest over a black hoodie, headband, wide grin",
    "vex": "a mysterious 17-year-old, asymmetric teal hair, a half-face visor with a glowing HUD, black techwear jacket",
    "ren": "a 19-year-old champion, swept-back dark hair, long white coat with gold trim, gold armband, calm confident gaze",
}
for k, d in BOSSES.items():
    J(a, f"characters/bosses/{k}-sheet.png",
      f"Character expression sheet of an original anime blader: {d}. Drawn in exactly the art style of the reference character. "
      "6 bust portraits in a 3x2 grid, identical framing, wide empty gaps so they never touch: 1 confident, 2 shouting a battle "
      f"command, 3 shocked, 4 angry, 5 defeated looking down, 6 respectful nod. No text. {CUT}", size="1536x1024", refs=[RIVAL])
    J(a, f"characters/bosses/{k}-full.png",
      f"Full-body version of the exact character in the reference expression sheet (same face, same hair style and color, same "
      f"outfit): {d}. Dynamic standing pose holding a spinning-top ripcord launcher. {CUT}", size="1024x1536",
      refs=[F + f"characters/bosses/{k}-sheet.png"], fid="high")

# ---------- awakened forms ----------
AWAKEN = {
    ("voltfang", "storm"): "STORM form: larger and more armored, a crown of crackling lightning horns, a storm-cloud mane, twin lightning-blade tails, dark steel armor now trimmed in gold; keeps YELLOW eyes and the blue-white lightning fur",
    ("voltfang", "phantom"): "PHANTOM form: sleeker and slimmer, ghostly translucent blue-white fur with violet lightning veins, a flowing spectral mane, minimal armor; keeps YELLOW eyes and the crystalline horns",
    ("aegiron", "titan"): "TITAN form: colossal, the obsidian shell grows into a crystal citadel with small towers, gold bands on the hexagon plates, a larger emerald crystal mane with a crown-like crest; keeps teal eyes and the blunt tortoise snout",
    ("aegiron", "sage"): "SAGE form: ancient and serene, shell covered in glowing jade runes and moss, a long crystal beard, lotus-shaped emerald crystals; keeps teal eyes and the blunt tortoise snout",
    ("nagara", "tide"): "TIDE form: a fierce ocean dragon, wave-shaped fins, deep sea-blue and pearl scales, the crescent crest grows into a full-moon halo; keeps blue eyes and the white mane",
    ("nagara", "eclipse"): "ECLIPSE form: dark violet and black scales with silver star patterns, the crescent crest becomes a glowing eclipse ring, mysterious aura; keeps blue eyes and the white mane",
    ("agnyx", "solar"): "SOLAR form: radiant gold-white sun phoenix, a sun-disc halo behind the head, expanded golden armor; keeps BLUE eyes and the golden crown crest",
    ("agnyx", "inferno"): "INFERNO form: blazing crimson-and-black phoenix with wings of roaring flame, obsidian armor with lava cracks; keeps BLUE eyes and the golden crown crest",
}
EL = {"voltfang": "crackling electric lightning", "aegiron": "emerald crystal shards and stone", "nagara": "moonlight and water", "agnyx": "roaring fire"}
for (beast, form), d in AWAKEN.items():
    base = C + {"voltfang": "02a", "aegiron": "02b", "nagara": "02c", "agnyx": "02d"}[beast] + f"-beast-{beast}-turnaround.png"
    turn = F + f"beasts/{beast}/awakened-{form}/turnaround.png"
    J(a, f"beasts/{beast}/awakened-{form}/turnaround.png",
      f"Character turnaround model sheet of the AWAKENED evolution of the exact creature in the reference image: {d}. It must be "
      "unmistakably the same creature, evolved. Exactly 4 full-body views in one row: FRONT, LEFT SIDE, BACK, RIGHT SIDE. Neutral "
      "pose, orthographic, identical scale, plain light-gray background, flat lighting, no glow effects, no labels. " + STYLE,
      size="1536x1024", refs=[base], model=T2, bg=None, fid="high")
    J(b, f"beasts/{beast}/awakened-{form}/cutin.png",
      f"Ultra-dynamic anime special-move cut-in banner of the exact creature from the reference image, bursting diagonally from the "
      f"right toward the camera, face in the right-center third, body and energy trail streaming to the left edge. The whole creature "
      f"is a glowing semi-translucent spirit made of {EL[beast]} energy, mid-roar. Speed lines, pure black background. No text. {STYLE}",
      size="1536x1024", refs=[turn], model=T2, bg=None)
    J(b, f"beasts/{beast}/awakened-{form}/card-art.png",
      f"Vertical collectible card illustration: the exact creature from the reference image as a giant glowing semi-translucent spirit "
      f"of {EL[beast]}, rising above a spinning top on a glowing stadium floor, dramatic upward angle. Bottom 20% darker and calmer "
      f"for a name plate. No text, no border. {STYLE}", size="1024x1536", refs=[turn], model=T2, bg=None)
    J(b, f"beasts/{beast}/awakened-{form}/emblem.png",
      "Circular game emblem badge: a stylized head of the exact creature in the first reference image, 3/4 view facing left, bold "
      "icon rendering. Frame: copy the ring frame of the second reference image exactly but make it GOLD instead of silver (awakened). "
      f"Readable at 64px. No text. {CUT} {STYLE}", refs=[turn, F + f"beasts/{beast}/emblem.png"], fid="high")
    J(b, f"beasts/{beast}/awakened-{form}/expressions-sheet.png",
      "Using the exact creature from the reference image, a dialogue portrait expression sheet: 3 columns x 2 rows, identical "
      "head-and-shoulders bust framing, wide empty gaps so portraits never touch. Order: 1 NEUTRAL calm, 2 PROUD chin raised, "
      "3 FURIOUS roaring, 4 SAD downcast with one tear, 5 SULKY head turned away eyes shut, 6 JOYFUL happy closed eyes gentle smile. "
      f"No text. {CUT} {STYLE}", size="1536x1024", refs=[turn], fid="high")

# ---------- backgrounds ----------
KEY = F + "key-art/style-anchor-v3.png"
BGS = {"tower": "a colossal futuristic spiral tower climbing into storm clouds at night, glowing ring floors, tiny spotlights, epic scale",
       "journal": "a mystical spirit-journal page: dark navy parchment with faint glowing constellations and a thin rune border, empty center",
       "share": "a dynamic anime energy burst with speed lines in dark navy and gold, empty center for a result card",
       "garage": "a futuristic spinning-top workshop at night, workbench with tools and glowing holographic part displays, softly blurred, empty center"}
for k, d in BGS.items():
    J(a, f"backgrounds/{k}.png", f"Vertical mobile game background: {d}. Matching the color palette and rendering of the reference key art. No text, no characters. {STYLE}",
      size="1024x1536", refs=[KEY], model=T2, bg=None)

here = os.path.dirname(os.path.abspath(__file__))
json.dump(a, open(os.path.join(here, "jobs-w3a.json"), "w"), indent=1)
json.dump(b, open(os.path.join(here, "jobs-w3b.json"), "w"), indent=1)
print(f"w3a: {len(a)}  w3b: {len(b)}")
