"""Season 2 consistency fixes from the art audit. Writes to assets/redo/ for review before replacing assets/final/. Phases: a (independent), b (needs a)."""
import json, os
from asset_jobs_s2 import CUT, F, FORMS, NEW, STYLE, T2, T15, TOPDOWN

R = "F:/tmp/tp-proj-game/assets/redo/"
a, b = [], []


def J(lst, out, prompt, size="1024x1024", refs=None, model=T15, bg=None, quality="medium", fid=None):
    job = {"out": R + out, "prompt": prompt, "size": size, "model": model, "quality": quality}
    if refs: job["refs"] = refs
    if bg: job["background"] = bg
    if fid and model != T2: job["input_fidelity"] = fid
    lst.append(job)


STYLE_ONLY = "Use the reference ONLY for rendering style, lighting, material finish and level of detail. Do NOT copy its shape, layout or silhouette: the design must be clearly different and recognisable at 72 pixels."
PARTS = [
    ("blade-fury", "Spinning-top outer blade ring 'Crimson Fury': three huge hooked crimson scythe blades sweeping in the same direction, asymmetric and aggressive, mostly molten crimson-red translucent plastic over a thin gunmetal frame. The clear empty round hole in the center.", "blade-tempest", True),
    ("blade-prism", "Spinning-top outer blade ring 'Bulwark Prism': twelve faceted pale ice-blue crystal blocks packed all around the ring like a crystal wall, smooth bumper outline, no silver panels. The clear empty round hole in the center.", "blade-wing", True),
    ("blade-guard", "Spinning-top outer blade ring 'Moon Guard': eight domed lavender shield plates overlapping like scales around the ring, lavender dominant with thin silver trim. The clear empty round hole in the center.", "blade-fang", True),
    ("disc-titan", "Spinning-top metal weight disc 'Titan Core': six thick wedge segments separated by deep grooves, recessed gold bolts on each wedge, a stepped double outer lip, dark gunmetal with gold accents, small round hole in the exact center.", "disc-standard", True),
    ("disc-gyro", "Spinning-top metal weight disc 'Gyro Rim': a heavy separate polished chrome outer ring joined to the center by six thin curved spokes, teal accents, standard-size round center hole.", "disc-standard", True),
    ("disc-feather", "Spinning-top metal weight disc 'Feather Disc': thin lightweight brushed silver disc with large feather-shaped cutout holes and teal accents, high contrast, small round center hole.", "disc-compact", True),
]
for name, desc, ref, top in PARTS:
    J(a, f"parts/{name}.png", f"{desc} {STYLE_ONLY} {TOPDOWN} {CUT}", refs=[F + f"parts/{ref}.png"], bg="transparent", fid="low")
J(a, "parts/tip-grip.png", "Spinning-top performance tip 'Grip Flat': a clear transparent plastic top collar exactly like the reference tip's collar, below it a wide flat black rubber tip with tread grooves and a thin red metal ring. Side view, centered, upright, same framing, angle and scale as the reference. " + CUT,
  refs=[F + "parts/tip-flat.png"], bg="transparent", fid="high")
J(a, "parts/tip-wide.png", "Spinning-top performance tip 'Wide Ball': a clear transparent plastic top collar exactly like the reference tip's collar, a short chrome shaft, ending in an extra-wide glossy white polymer ball. Side view, centered, upright, same framing, angle and scale as the reference. " + CUT,
  refs=[F + "parts/tip-ball.png"], bg="transparent", fid="high")

HIT = "Match the style, glow and composition of the reference VFX sprite exactly: pure solid black background, glowing additive light with soft bloom, radiating from the exact center, no text."
J(a, "vfx/hit-wind.png", f"Game hit VFX sprite: a burst of swirling bright teal-mint wind gusts and white air slashes spiraling out from the center. {HIT}", refs=[F + "vfx/hit-lightning.png"])
J(a, "vfx/hit-shadow.png", f"Game hit VFX sprite: a burst of glowing violet and magenta wisps, sparks and claw slashes radiating from the center, the shadow implied only by dark gaps between the glowing wisps, never black-colored smoke. {HIT}", refs=[F + "vfx/hit-lightning.png"])

PLATE = ("Wide horizontal game HUD name plate for a player name and a spin bar. Exact shape: a chunky slanted panel exactly THREE times wider than it is tall, occupying the middle 80% of the image width and 40% of the image height, "
         "centered, with a thick bevelled metal frame, angled corner cut-outs and small tech notches, with a bevelled metal frame, glowing edges, a dark semi-transparent navy glass interior left plain and empty for text, "
         "and one small elemental flourish at the LEFT outer end only. Flat front view, no perspective, no text, no icons inside. ")
J(a, "ui/hud-plate-voltfang.png", PLATE + f"Accents and glow: electric-blue lightning. {CUT} {STYLE}", "1536x1024", bg="transparent", quality="high")
for k, el in {"aegiron": "emerald-green crystal", "nagara": "violet moonlight water", "agnyx": "crimson-gold fire", "zephyra": "teal-mint storm wind", "umbrax": "magenta shadow smoke"}.items():
    J(b, f"ui/hud-plate-{k}.png", f"The exact same HUD name plate as the reference image: identical frame shape, proportions, size, position, bevel and empty navy glass interior. Only recolor the glowing edges and accents to {el}, and change the small flourish at the left outer end into {el}. No text. {CUT}",
      "1536x1024", [R + "ui/hud-plate-voltfang.png"], bg="transparent", fid="high")

for k, v in NEW.items():
    turn = F + f"beasts/{k}/turnaround.png"
    J(a, f"beasts/{k}/summon.png",
      f"The exact same creature as the reference, identical design and colors. Full body, summoning pose: rising up and lunging toward the viewer, three-quarter front view, head and chest large, "
      f"roaring, limbs spread for a powerful silhouette. Correct anatomy only: {v['limbs']}. Its elemental energy ({v['el']}) wraps tightly around its body only. The creature FILLS the frame with only a small margin. "
      f"No ground, no background, no text, no spinning top. {STYLE} {CUT}", "1024x1536", [turn], bg="transparent", fid="high")
    J(a, f"beasts/{k}/expressions-sheet.png",
      "Using the exact creature from the reference image (same design, colors, markings), create a dialogue portrait expression sheet. Layout: 3 columns x 2 rows, all six portraits identical head-and-shoulders bust "
      "framing, head at the same height and size in every cell, facing 3/4 toward the viewer, generous margin above every head and a wide empty gap between portraits so they never touch each other or the canvas edge. "
      "Bright rim light, clearly readable faces. Order: 1 NEUTRAL: calm, relaxed, mouth closed, soft eyes. 2 PROUD: chin raised, confident smirk. 3 FURIOUS: roaring, teeth bared. 4 SAD: head lowered, glossy eyes, one visible tear. "
      "5 SULKY/REFUSING: head turned away in profile, eyes shut, pouting. 6 JOYFUL: happy closed crescent eyes, wide gentle smile, head tilted, sparkles. "
      f"DESIGN LOCK - every portrait must show: {v['lock']}. Markings are abstract swirls, never letters or numbers. No text anywhere. {CUT} {STYLE}", "1536x1024", [turn], bg="transparent", quality="high", fid="high")

ut = F + "beasts/umbrax/turnaround.png"
J(a, "beasts/umbrax/emblem.png",
  f"Circular game emblem badge. Inside: a stylized {NEW['umbrax']['head']} - the exact creature from the first reference image, 3/4 view facing left, bold simplified icon rendering, background inside the ring is violet smoke. "
  f"Frame: copy the ring frame of the second reference image exactly: polished silver bevelled ring with EXACTLY TWO gems, one at the top and one at the bottom, no side gems. Recolor only the two gems magenta. Readable at 64px. No text. {CUT} {STYLE}",
  refs=[ut, F + "beasts/voltfang/emblem.png"], bg="transparent", quality="high")

GEM = {"zephyra": "teal-mint", "umbrax": "magenta"}
for (k, form), desc in FORMS.items():
    v = NEW[k]
    turn = F + f"beasts/{k}/turnaround.png"
    card = F + f"beasts/{k}/awakened-{form}/card-art.png"
    extra = " SILVER-WHITE runes, never magenta runes." if form == "sovereign" else ""
    base = f"The same creature as the reference images, in its {desc}.{extra} Keep its identity readable: {v['lock']}."
    J(a, f"beasts/{k}/awakened-{form}/emblem.png",
      f"Circular game emblem badge of the creature in its awakened form. {base} 3/4 view facing left, bold simplified icon, the background inside the ring matches the creature's element ({v['el']}), never lightning unless the element is lightning. "
      f"Frame: copy the ring frame of the third reference image exactly but in GOLD, with exactly two gems (top and bottom) colored {GEM[k]}. Readable at 64px. No text. {CUT} {STYLE}",
      refs=[turn, card, F + "beasts/voltfang/emblem.png"], bg="transparent", quality="high")
    if k == "umbrax":
        J(a, f"beasts/{k}/awakened-{form}/expressions-sheet.png",
          f"Dialogue portrait expression sheet. {base} Cel-shaded anime style exactly like the reference card art, not painterly. Layout: 3 columns x 2 rows, identical head-and-shoulders bust framing, head at the same height and size, facing 3/4 toward the viewer, "
          "generous margins so nothing touches another portrait or the canvas edge. Six CLEARLY DIFFERENT expressions in this order: 1 NEUTRAL: calm, mouth closed. 2 PROUD: chin raised, confident smirk. 3 FURIOUS: roaring, teeth bared. "
          "4 SAD: head lowered, glossy eyes, one visible tear. 5 SULKY/REFUSING: head turned away in profile, eyes shut, pouting. 6 JOYFUL: happy closed crescent eyes, wide gentle smile, head tilted, sparkles. No text. " + f"{CUT} {STYLE}",
          "1536x1024", [turn, card], bg="transparent", quality="high", fid="high")
for out, size in (("card-art.png", "1024x1536"), ("summon.png", "1024x1536")):
    src = F + f"beasts/umbrax/awakened-sovereign/{out}"
    J(a, f"beasts/umbrax/awakened-sovereign/{out}", "Repaint the reference image identically (same composition, pose, lighting and everything else) but change every glowing rune marking from magenta to SILVER-WHITE. Keep the magenta only on the tail flame. No text."
      + (f" {CUT}" if out == "summon.png" else ""), size, [src], bg="transparent" if out == "summon.png" else None, fid="high")
J(b, "launchers/umbrax.png", "Repaint the first reference image identically (same launcher shape, colors and pose) but make the round emblem window bright and clear, showing the emblem from the second reference image crisply with a soft glow. " + CUT,
  "1024x1536", [F + "launchers/umbrax.png", R + "beasts/umbrax/emblem.png"], bg="transparent", fid="high")

here = os.path.dirname(os.path.abspath(__file__))
for name, lst in (("jobs-s2fix-a.json", a), ("jobs-s2fix-b.json", b)):
    json.dump(lst, open(os.path.join(here, name), "w"), indent=1)
print("fix-a", len(a), "fix-b", len(b))
