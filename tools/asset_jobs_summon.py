import json
from asset_jobs_w3 import STYLE, CUT, F, T15

FORMS = {
    "voltfang": ("storm wolf of blue lightning", ["awakened-storm", "awakened-phantom"]),
    "aegiron": ("crystal fortress tortoise of earth and crystal", ["awakened-titan", "awakened-sage"]),
    "nagara": ("moon serpent-dragon of moonlit water", ["awakened-tide", "awakened-eclipse"]),
    "agnyx": ("crimson firebird of flame", ["awakened-solar", "awakened-inferno"]),
}
jobs = []
for beast, (desc, forms) in FORMS.items():
    for form in [""] + forms:
        base = f"beasts/{beast}/" + (form + "/" if form else "")
        jobs.append({
            "out": F + base + "summon.png", "model": T15, "size": "1024x1536", "background": "transparent", "input_fidelity": "high",
            "refs": [F + base + "card-art.png"],
            "prompt": (f"The exact same {desc} spirit beast as the reference, identical design, colors, markings and armor. "
                       "Full body, summoning pose: rising up and lunging toward the viewer, three-quarter front view, head and chest "
                       "large in frame, roaring, limbs and wings or tail spread for a powerful silhouette. Its elemental energy wraps "
                       "tightly around its body only. Entire creature fits inside the frame with a small margin. No ground, no background "
                       f"scenery, no text, no frame, no spinning top. {STYLE} {CUT}"),
        })
json.dump(jobs, open("jobs-summon.json", "w"), indent=1)
print(len(jobs))
