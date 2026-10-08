import json
from asset_jobs_w3 import STYLE, CUT, F, T15

BLACK = "Anime game VFX, cel-shaded, saturated. Pure black background. No text, no letters, no frame."
GREY = "Anime game VFX, cel-shaded. Plain flat medium grey background, nothing else. No text, no letters, no frame."
BAND = ("running straight across the full width from the left edge to the right edge, the band centered vertically and filling the "
        "middle third of the height, seamless where the left and right edges meet.")
TILE = "Fills the whole frame edge to edge, no single object, no border, tiles seamlessly in both directions. Anime cel-shaded game texture. No text."

VFX = {
    "crystal-surface": ("1024x1024", f"Seamless tileable texture of faceted emerald-green crystal, glowing inner light, sharp facets with fine white edge highlights, deep green to bright mint gradients. {TILE}"),
    "rock-chunks": ("1024x1024", f"A single cluster of broken emerald crystal shards and dark stone chunks flying apart with glowing green dust, centered. {BLACK}"),
    "lightning-ribbon": ("1536x1024", f"A single horizontal band of crackling electric-blue lightning with a bright white core and jagged blue branches, {BAND} {BLACK}"),
    "sky-bolt": ("1024x1536", f"A single vertical lightning bolt striking straight down from the top edge to the bottom edge, brilliant white core, electric-blue jagged branches, a bright impact flare at the bottom, centered horizontally. {BLACK}"),
    "water-surface": ("1024x1024", f"Seamless tileable texture of flowing moonlit water, silver-violet and deep blue currents with white foam streaks and glints. {TILE}"),
    "whirlpool": ("1024x1024", f"A swirling whirlpool of moonlit silver-violet water seen from directly above, spiral currents with white foam converging to the center, perfectly centered and round. {BLACK}"),
    "splash": ("1024x1024", f"A burst of moonlit silver-violet water splashing outward in all directions, droplets and foam, centered. {BLACK}"),
    "fire-ribbon": ("1536x1024", f"A single horizontal band of roaring crimson and gold flame with a bright yellow-white core and licking flame tongues, {BAND} {BLACK}"),
    "feather": ("1024x1024", f"A single glowing crimson-gold phoenix feather made of fire with embers trailing from its tip, centered, diagonal. {BLACK}"),
    "fire-ring": ("1024x1024", f"A ring of crimson and gold fire on the ground seen from directly above, flames rising from a perfect circle around a glowing scorched center, perfectly centered and round. {BLACK}"),
    "wind-ribbon": ("1536x1024", f"A single horizontal band of swirling teal-mint wind streaks and white air currents, {BAND} {BLACK}"),
    "debris": ("1024x1024", f"A small cluster of storm debris: pebbles, leaves and dust caught in teal-mint wind, centered. {BLACK}"),
    "shadow-pool": ("1024x1024", f"A pool of living ink-black shadow on the ground seen from directly above, a glowing magenta rune edge and wisps of magenta smoke at the rim, perfectly centered and round. {GREY}"),
    "shadow-claw": ("1024x1024", f"Three curved claws of ink-black shadow rising up out of the ground, glowing magenta edges and wisps of magenta smoke, side view, centered, the base touching the bottom edge. {GREY}"),
    "claw-slash": ("1024x1024", f"Three parallel diagonal claw slash marks of bright magenta energy with white-hot cores, slicing from top right to bottom left, centered. {BLACK}"),
}

POSES = {
    "voltfang": ("storm wolf of blue lightning", "lunging forward mid-leap with jaws open, lightning crackling along its fangs and claws"),
    "aegiron": ("crystal fortress tortoise of earth and crystal", "rearing up and slamming its front legs down, crystal spikes bursting from its shell"),
    "nagara": ("moon serpent-dragon of moonlit water", "coiling its long body in a striking spiral with jaws open, moonlit water spiralling around it"),
    "agnyx": ("crimson firebird of flame", "diving downward with wings swept back and talons forward, a trail of fire behind it"),
    "zephyra": ("storm griffin of teal-mint wind and white storm clouds", "wings spread wide beating a powerful gust forward, talons raised, wind spiralling from its wings"),
    "umbrax": ("shadow panther of ink-black shadow and magenta smoke", "pouncing forward with claws extended, smoke mane flaring, amber eyes blazing"),
}

jobs = [{"out": F + f"vfx/power/{name}.png", "model": T15, "quality": "medium", "size": size, "prompt": prompt} for name, (size, prompt) in VFX.items()]
for beast, (desc, action) in POSES.items():
    base = F + f"beasts/{beast}/"
    jobs.append({
        "out": base + "pose-attack.png", "model": T15, "quality": "high", "size": "1024x1536", "background": "transparent", "input_fidelity": "high",
        "refs": [base + "card-art.png", base + "summon.png"],
        "prompt": (f"The exact same {desc} spirit beast as the references, identical design, colors, markings and armor. Full body, attack pose: "
                   f"{action}, three-quarter side view, the whole creature inside the frame with a small margin. Its elemental energy wraps "
                   f"tightly around its body only. No ground, no background scenery, no text, no frame, no spinning top. {STYLE} {CUT}"),
    })
json.dump(jobs, open("jobs-power.json", "w"), indent=1)
print(len(jobs))
