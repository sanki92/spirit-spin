"""Asset job definitions. `python asset_jobs.py` writes jobs-a.json / jobs-b.json next to this file.
Phase B depends on phase A outputs (new emblems + anchor). Run with tools/gen_images.py.
Models: gpt-image-2 = full-bleed art + 3D sheets; gpt-image-1.5 = transparent sprites/icons (gpt-image-2 has no alpha)."""
import json, os

C = "F:/tmp/tp-proj-game/assets/concept/"   # v1 concepts (canonical turnarounds, rival, logo, stadium live here)
F = "F:/tmp/tp-proj-game/assets/final/"
T2, T15 = "gpt-image-2", "gpt-image-1.5"

STYLE = ("Art style: modern Japanese anime game art, cel-shaded with soft gradient shading, clean bold line art, highly saturated "
         "colors, dramatic rim lighting, premium polished top-tier 2020s anime mobile game. Completely original design, not based "
         "on any existing franchise. No watermark, no signature.")
CUT = "Isolated on a fully transparent background, nothing else in the image, no drop shadow on the background."

BEASTS = {
    "voltfang": dict(turn=C + "02a-beast-voltfang-turnaround.png", top=C + "06a-top-voltfang.png",
                     el="crackling electric-blue lightning", ring="electric-blue", limbs="four legs, one lightning-blade tail",
                     head="wolf head with sweeping crystalline lightning horns, yellow eyes",
                     lock="YELLOW eyes (never blue), long sweeping crystalline blue lightning horns, dark steel spiked shoulder armor with blue gems, white chest with blue chevron lightning stripes"),
    "aegiron": dict(turn=C + "02b-beast-aegiron-turnaround.png", top=C + "06b-top-aegiron.png",
                    el="emerald crystal shards and stone", ring="emerald-green", limbs="four thick crystal-armored legs",
                    head="tortoise head with a crystal-spiked emerald mane, stern teal eyes, clearly visible face, short blunt tortoise snout",
                    lock="a TORTOISE (not a bird, not a crocodile): short blunt tortoise snout, teal eyes, face framed by a mane of emerald crystal spikes, obsidian hexagon shell with glowing green seams visible behind the shoulders"),
    "nagara": dict(turn=C + "02c-beast-nagara-turnaround.png", top=C + "06c-top-nagara.png",
                   el="silver-violet moonlight and water", ring="violet-silver",
                   limbs="one long serpentine body with exactly two small clawed forelimbs and no other legs",
                   head="serpent-dragon head with a large white crescent-moon crest, silver-white mane, blue eyes",
                   lock="a LARGE WHITE CRESCENT-MOON CREST on top of the head (always visible), blue eyes, pearl-white face, long flowing white-lavender mane, violet translucent ribbon fins, violet belly scales"),
    "agnyx": dict(turn=C + "02d-beast-agnyx-turnaround.png", top=C + "06d-top-agnyx.png",
                  el="roaring crimson-gold fire", ring="crimson-gold", limbs="two wings and exactly two golden-armored legs",
                  head="firebird head with a golden crown crest, golden beak, blue eyes",
                  lock="BLUE eyes, an ornamental GOLDEN CROWN crest on top of the head, GOLDEN ARMOR plates on the shoulders and chest, crimson-orange feathers, golden beak"),
}
TYPE = {"attack": ("voltfang", "two crossed blades", "electric-blue and white with lightning"),
        "defense": ("aegiron", "a heater shield", "emerald-green and obsidian with crystal shards"),
        "stamina": ("nagara", "an infinity loop", "violet and silver with moonlight water swirls"),
        "balance": ("agnyx", "a yin-yang style split circle", "crimson and gold with flames")}

LOGO = C + "11a-logo.png"
LETTERING = ("Lettering must match the reference logo's style exactly: bold italic chrome-metal letters with sharp bevels, "
             "dark outline and energy edges.")

a, b = [], []
J = lambda lst, out, prompt, size="1024x1024", refs=None, model=T2, bg=None: lst.append(
    {k: v for k, v in dict(out=F + out, prompt=prompt, size=size, refs=refs, model=model, background=bg).items() if v})

# ---------- PHASE A ----------
J(a, "key-art/style-anchor-v2.png",
  "Anime key art poster of the four spirit beasts from the reference images posed together (keep each design exactly: storm wolf, "
  "crystal tortoise with a clearly visible face, moon serpent-dragon, firebird), each rising as a giant glowing semi-translucent spirit "
  "made of its element (lightning, emerald crystal, moonlight water, fire) behind its own small spinning battle top on a futuristic "
  "arena floor. Dramatic low camera angle, epic lighting, energy trails, sparks. No text. " + STYLE,
  "1536x1024", [v["turn"] for v in BEASTS.values()])

for k, v in BEASTS.items():
    J(a, f"beasts/{k}/emblem.png",
      f"Circular game emblem badge. Inside: a stylized {v['head']} - the exact creature from the first reference image, 3/4 view facing "
      f"left, bold simplified icon rendering. Must show: {v['lock']}. Frame: copy the ring frame of the second reference image exactly "
      f"(polished silver bevelled ring, exactly two gems: one at top, one at bottom), only recolor its accents and gems {v['ring']}; take "
      f"the creature only from the first image. Readable at 64px. No text. {CUT} {STYLE}", "1024x1024",
      [v["turn"], F + "beasts/voltfang/emblem.png"] if k != "voltfang" else [v["turn"], C + "05-emblems.png"], T15, "transparent")
    J(a, f"beasts/{k}/expressions-sheet.png",
      "Using the exact creature from the reference image (same design, colors, markings), create a dialogue portrait expression sheet. "
      "Layout: 3 columns x 2 rows, all six portraits identical head-and-shoulders bust framing, head at the same height and same size in "
      "every cell, facing 3/4 toward the viewer, with a wide empty gap between portraits so they never touch or overlap. "
      "Order: 1 NEUTRAL: calm, mouth closed, relaxed eyes. 2 PROUD: chin raised high, eyes half-closed, confident smirk. "
      "3 FURIOUS: mouth wide open roaring, teeth bared, eyes narrowed, mane/fur bristling. 4 SAD: head lowered, eyes downcast and glossy "
      "with one tear, crest/ears drooping, mouth closed. 5 SULKY/REFUSING: head turned fully away in profile, eyes shut, nose up, pouting. "
      "6 JOYFUL: eyes curved into happy closed crescents, gentle open smile, head tilted, small sparkles - must look friendly, NOT "
      f"aggressive, clearly different from FURIOUS. DESIGN LOCK - every portrait must show: {v['lock']}. No text, no labels. {CUT} {STYLE}",
      "1536x1024", [v["turn"]], T15, "transparent")
    a[-1]["input_fidelity"] = "high"
    J(a, f"beasts/{k}/cutin.png",
      f"Ultra-dynamic anime special-move cut-in banner of the exact creature from the reference image. Composition: the creature's head "
      f"and front body burst diagonally from the right toward the camera, face in the right-center third, the rest of its body and an "
      f"energy trail streaming off to the left edge. Correct anatomy only: {v['limbs']}. The entire creature is a glowing "
      f"semi-translucent spirit made of {v['el']} energy with bright inner glow and rim light, mid-roar. Speed lines, pure black "
      f"background. No text. {STYLE}", "1536x1024", [v["turn"]])

for k, (beast, motif, colors) in TYPE.items():
    J(a, f"ui/type-{k}.png",
      f"Round game type icon showing {motif}, colored {colors}. Match the rendering style of the reference icon sheet (faceted crystal "
      f"disc with an energy aura) but use these colors. Single icon, centered. No text. {CUT}",
      "1024x1024", [C + "11e-type-icons.png"], T15, "transparent")

for g in "SABC":
    J(a, f"ui/grade-{g}.png",
      f"Recreate only the '{g}' rank badge from the reference sheet exactly (same shield shape, colors and effects), single badge, "
      f"centered. {CUT}", "1024x1024", [C + "11c-grade-badges.png"], T15, "transparent")

BANNERS = {"finish-spin": ("SPIN FINISH", "silver and cyan"), "finish-ringout": ("RING OUT", "blazing orange"),
           "finish-shatter": ("SHATTER FINISH", "red, letters cracked with flying shards"),
           "finish-spirit": ("SPIRIT FINISH", "gold with a radiant glowing aura"),
           "victory": ("VICTORY", "brilliant gold with light rays"), "defeat": ("DEFEAT", "dim steel-blue and gray only, NO fire, NO orange, NO red, letters cracked and fading"),
           "spirit-call": ("SPIRIT CALL!", "white-gold with swirling multicolor energy"),
           "shout": ("SHOUT!", "white with a jagged red comic-style burst behind it")}
for k, (text, colors) in BANNERS.items():
    J(a, f"ui/banner-{k}.png",
      f'Anime battle banner with the exact text "{text}" (spelled exactly, nothing else written), {colors}, on a sharp angled '
      f"parallelogram energy plate. No creatures, no spinning tops. {LETTERING} Wide, centered. {CUT}",
      "1536x1024", [LOGO], T15, "transparent")
J(a, "ui/banner-vs.png", f'Huge dramatic "VS" versus graphic, electric-blue V and crimson S clashing with sparks between them. {LETTERING} {CUT}',
  "1024x1024", [LOGO], T15, "transparent")
for n in ["3", "2", "1", "LAUNCH!"]:
    J(a, f"ui/countdown-{n.strip('!').lower()}.png",
      f'Huge anime countdown graphic: "{n}" (spelled exactly, nothing else), chunky chrome lettering with cyan energy speed streaks'
      + (" and an explosive white-gold energy burst behind it" if n == "LAUNCH!" else "") + f". {LETTERING} Centered. {CUT}",
      "1536x1024" if n == "LAUNCH!" else "1024x1024", [LOGO], T15, "transparent")

J([], "stadium/floor-tile.png",  # replaced by stadium/arena-floor.png (AI tiles had baked-in seams)
 
  "Seamless tileable top-down texture for an arena floor around the stadium in the reference image: dark gunmetal hexagonal floor "
  "panels with thin glowing cyan seams, subtle brushed grain, painted anime game texture style matching the reference. Perfectly flat "
  "even lighting, no perspective, no objects, no text. Edges must tile seamlessly.", "1024x1024", [C + "07a-stadium-sheet.png"])
for k, theme in {"volcano": "volcanic: black basalt rock, glowing orange lava cracks instead of cyan lines, ember particles",
                 "frozen-moon": "frozen moon: pale ice crystal, frosted white-blue surface, glowing silver moonlight lines"}.items():
    J(a, f"stadium/{k}-sheet.png",
      f"Recreate the stadium from the reference design sheet with the exact same structure, 3 ring-out gaps and same three-view layout "
      f"(top-down, side cross-section, 3/4 view), rethemed as {theme}. Flat even lighting, plain light-gray background, no text. {STYLE}",
      "1536x1024", [C + "07a-stadium-sheet.png"])

J(a, "vfx/crack-decal.png", "Top-down decal of radial impact cracks: only the dark jagged crack lines with glowing orange-hot edges "
  "radiating from a center point. No floor plate, no surface - everything except the cracks is fully transparent.",
  "1024x1024", None, T15, "transparent")
J(a, "vfx/dust-flipbook.png", "4x4 grid of 16 animation frames of a stylized anime dust puff: cel-shaded with 2-3 flat white-gray tones "
  "and clean soft outlines, frame 1 tiny, expanding into a cartoon cloud, breaking apart and fading by frame 16. Each frame centered in "
  "its cell, same scale. Pure black background. No text, no grid lines.")
J(a, "vfx/impact-flash.png", "Anime hit-spark impact flash: sharp white-yellow star burst with long thin spikes and a bright core, "
  "cel-shaded, centered. Pure black background. No text.")
for k, d in {"lightning": "a lightning strike impact burst with forked electric-blue bolts", "crystal": "emerald crystal shards exploding outward",
             "water": "a silver-violet water splash crown with moonlit droplets", "fire": "a crimson-gold fire explosion with embers"}.items():
    J(a, f"vfx/hit-{k}.png", f"Stylized anime VFX: {d}, viewed from slightly above, centered, cel-shaded energy with bright core. "
      "Pure black background. No text.")

RIVAL = C + "08-rival-expressions.png"
J(a, "characters/rival-full.png", "The exact character from the reference sheet, full-body, cocky standing pose, one arm thrust forward "
  f"holding a spinning-top ripcord launcher, smirking. Same outfit and hair. {CUT} {STYLE}", "1024x1536", [RIVAL], T15, "transparent")
J(a, "characters/avatars-sheet.png",
  "Sheet of 6 original anime player-avatar bust portraits in a 3x2 grid, identical head-and-shoulders framing, same size, wide empty gap "
  "between portraits, drawn in exactly the same style as the reference character: 1 energetic boy, messy black hair, blue headband; "
  "2 confident girl, long red ponytail, red track jacket; 3 calm boy with glasses, white hoodie; 4 tomboy girl, short purple hair, "
  "bandage on nose; 5 tall boy, dark skin, cornrows, orange vest; 6 girl with brown skin, long braid, green scarf, gold goggles on head. "
  f"All smiling or determined. No text. {CUT}", "1536x1024", [RIVAL], T15, "transparent")
J(a, "characters/commentator-sheet.png",
  "Expression sheet of an original flamboyant anime battle commentator in exactly the style of the reference character: adult man, "
  "pompadour hair, sunglasses pushed up on forehead, white suit jacket with gold trim, headset microphone. 6 bust portraits in a 3x2 "
  "grid, same framing, wide gaps: 1 hyped shouting, 2 pointing excitedly, 3 jaw-drop shock, 4 laughing, 5 serious announcing, "
  f"6 thumbs up. No text. {CUT}", "1536x1024", [RIVAL], T15, "transparent")

J(a, "ui/icon-spirit-shard.png", f"Game currency icon: a glowing faceted spirit crystal shard with swirling blue-violet-gold inner energy. {CUT} {STYLE}",
  "1024x1024", None, T15, "transparent")
J(a, "ui/icon-coin.png", f"Game currency icon: a thick gold coin with an engraved spinning-top emblem, shiny bevelled rim. {CUT} {STYLE}",
  "1024x1024", None, T15, "transparent")
J(a, "ui/permission-motion-mic.png", "Friendly anime-style illustration of a smartphone held sideways with curved motion lines around it "
  f"and sound waves coming from its microphone, cyan and gold accents. No text. {CUT} {STYLE}", "1024x1024", None, T15, "transparent")
for k, tier in {"common": "brushed steel, minimal ornament", "rare": "sapphire blue metal with small gems",
                "epic": "amethyst violet with crystal spikes and glowing runes", "legendary": "radiant gold with flames, large gems and light rays"}.items():
    J(a, f"ui/card-frame-{k}.png", f"Ornate vertical collectible-card frame border only, {tier}. The whole inner window is empty and fully "
      f"transparent. Frame shape: rounded-corner rectangle with a crest at the top and a nameplate bar at the bottom. No text. {CUT}",
      "1024x1536", [C + "11f-ui-kit.png"], T15, "transparent")
J(a, "backgrounds/rip-screen.png", "Abstract vertical mobile background: a tunnel of cyan and white speed streaks converging to the center, "
  "deep navy, subtle hexagon pattern, light haze. No text, no objects.", "1024x1536")

J(a, "key-art/style-anchor-v3.png",
  "Edit the first image: the small green object on the floor under the tortoise spirit is wrongly a tortoise shell. Replace it with the "
  "spinning battle top from the second reference image (green and obsidian), spinning on the floor with a green energy ring exactly like "
  "the other three tops. Keep everything else in the image exactly identical.", "1536x1024",
  [F + "key-art/style-anchor-v2.png", C + "06b-top-aegiron.png"])

# ---------- PHASE B (needs phase A emblems + anchor) ----------
for k, v in BEASTS.items():
    em = F + f"beasts/{k}/emblem.png"
    if k == "agnyx":
        J(b, f"tops/{k}-sheet.png",
          "Recreate this exact spinning top design from the first reference image, but fix the layout: top row has 4 orthographic views "
          "(TOP-DOWN, SIDE PROFILE, BOTTOM-UP, 3/4 hero view); bottom row has exactly ONE exploded side view centered, showing the 3 parts "
          "separated vertically (outer blade ring, metal core disc with emblem chip, tip). The center emblem chip shows the emblem from the "
          "second reference image. Flat even lighting, plain light-gray background, no labels.", "1536x1024", [v["top"], em])
    else:
        J(b, f"tops/{k}-sheet.png",
          "Edit the first reference image: replace the emblem printed on the center chip in every view with the emblem from the second "
          "reference image, simplified to fit the chip. Keep everything else exactly identical: layout, views, colors, lighting, background.",
          "1536x1024", [v["top"], em])
    J(b, f"launchers/{k}.png",
      f"A single original futuristic ripcord launcher for spinning tops, shown straight-on from the front, vertical orientation filling the "
      f"frame top to bottom, styled after the matching launcher in the third reference image and colored like the top in the first "
      f"reference image, with the emblem from the second reference image set into its center. Mechanical detail, grip, ripcord handle. "
      f"{CUT} {STYLE}", "1024x1536", [v["top"], em, C + "09-launchers.png"], T15, "transparent")
    J(b, f"beasts/{k}/card-art.png",
      f"Vertical collectible card illustration: the exact creature from the first reference image as a giant glowing semi-translucent "
      f"spirit made of {v['el']}, rising behind its spinning top (the top from the second reference image) which spins on a glowing "
      f"stadium floor. Correct anatomy only: {v['limbs']}. Dramatic upward angle, energy swirling. The bottom 20% is darker and calmer for "
      f"a name plate. No text, no card border. {STYLE}", "1024x1536", [v["turn"], v["top"]])
J(b, "backgrounds/main-menu.png",
  "Vertical mobile game main-menu background based on the reference key art: futuristic battle arena at night seen from floor level, a "
  "glowing stadium bowl in the lower third, spotlights and crowd silhouettes, the four spirit beasts as faint giant glowing silhouettes "
  f"in the sky. Top 25% calmer for a logo, bottom 30% darker for buttons. No text. {STYLE}", "1024x1536",
  [F + "key-art/style-anchor-v3.png", C + "07c-arena-backdrop.png"])

here = os.path.dirname(os.path.abspath(__file__))
json.dump(a, open(os.path.join(here, "jobs-a.json"), "w"), indent=1)
json.dump(b, open(os.path.join(here, "jobs-b.json"), "w"), indent=1)
print(f"phase A: {len(a)} jobs, phase B: {len(b)} jobs")

# ---------- FIXES (targeted edits of near-miss outputs; inputs live in assets/_rejected) ----------
R = "F:/tmp/tp-proj-game/assets/_rejected/"
fix = []
for k, inner in {"nagara": "violet moonlight sparkles and soft silver mist (no lightning)", "agnyx": "crimson-gold flames"}.items():
    J(fix, f"beasts/{k}/emblem.png",
      "Edit the first image: make its ring frame identical to the ring of the second image - polished SILVER bevelled ring with exactly "
      "TWO gems (one at top, one at bottom); remove any gems on the left and right sides; recolor the two gems "
      f"{BEASTS[k]['ring']}. The inner background must be {inner}. Keep the creature exactly the same. {CUT}",
      "1024x1024", [R + f"v3__beasts__{k}__emblem.png", F + "beasts/voltfang/emblem.png"], T15, "transparent")
    fix[-1]["input_fidelity"] = "high"
json.dump(fix, open(os.path.join(here, "jobs-fix.json"), "w"), indent=1)

fix2 = []
for k in ["nagara", "agnyx"]:
    J(fix2, f"launchers/{k}.png",
      "Create a new ripcord launcher with EXACTLY the same structure, silhouette, proportions and parts as the first reference image "
      "(same vertical body, same round emblem window in the middle, same toothed ripcord strip sticking straight up out of the top, same "
      f"handle at the bottom), but recolored like the top in the second reference image ({BEASTS[k]['ring']}) and with the emblem from the "
      f"third reference image in the round window. Front view, same scale and framing. {CUT} {STYLE}",
      "1024x1536", [F + "launchers/voltfang.png", BEASTS[k]["top"], F + f"beasts/{k}/emblem.png"], T15, "transparent")
    fix2[-1]["input_fidelity"] = "high"
json.dump(fix2, open(os.path.join(here, "jobs-fix2.json"), "w"), indent=1)

fix3 = []
J(fix3, "stadium/arena-floor.png",
  "Top-down orthographic view of a circular futuristic arena floor platform, matching the stadium in the reference image: dark gunmetal "
  "hexagonal floor panels with thin glowing cyan seams in a perfect regular grid, a slightly brighter empty circular area in the exact "
  "center where a stadium bowl will be placed, concentric faint cyan rings around it. The floor fades smoothly into pure black toward "
  "all four edges and corners (strong vignette, outer 15% fully black). Flat even lighting, no perspective, no objects, no text.",
  "1024x1024", [C + "07a-stadium-sheet.png"])
json.dump(fix3, open(os.path.join(here, "jobs-fix3.json"), "w"), indent=1)
