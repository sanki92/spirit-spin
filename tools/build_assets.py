import json, os, re, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "final")
OUT = os.path.join(ROOT, "apps", "client", "public", "assets")
MANIFEST = os.path.join(ROOT, "apps", "client", "src", "assets", "manifest.json")
ICONS = os.path.join(ROOT, "apps", "client", "public", "icons")

EXPRESSIONS = ["neutral", "proud", "furious", "sad", "sulky", "joyful"]
BOSS_FACES = ["confident", "shout", "shocked", "angry", "defeated", "respect"]
SKIP = re.compile(r"(turnaround|tops/.*-sheet|stadium/.*-sheet|key-art/style-anchor-v2)\.png$")

manifest = {}


RULES_VERSION = 2
SIZE_RULES = [
    (r"^ui/icons/", 192, 82),
    (r"^ui/(icon-coin|icon-spirit-shard|type-)", 128, 82),
    (r"^ui/card-frame-", 384, 82),
    (r"^ui/hud-plate-", 640, 80),
    (r"^ui/(banner-|callout-|countdown-|grade-)", 720, 80),
    (r"/emblem$", 256, 82),
    (r"/expressions/", 320, 80),
    (r"^characters/bosses/[a-z]+/", 320, 80),
    (r"^characters/(avatars/|commentator/)", 256, 80),
    (r"^characters/.*-full$", 900, 80),
    (r"/summon$", 900, 78),
    (r"/card-art$", 1024, 76),
    (r"/cutin$", 1024, 76),
    (r"^launchers/", 512, 80),
    (r"^parts/tip-", 384, 85),
    (r"^backgrounds/", 1080, 74),
    (r"^onboarding/", 640, 80),
    (r"^key-art/hero-", 1600, 78),
    (r"^key-art/", 1024, 76),
]


def limit(rel, max_side, quality):
    for pat, side, q in SIZE_RULES:
        if re.search(pat, rel):
            return min(max_side, side), q
    return max_side, quality


def save(img, rel, max_side, quality=82):
    import hashlib
    max_side, quality = limit(rel, max_side, quality)
    img = img.copy()
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    path = os.path.join(OUT, rel + ".webp")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6)
    v = hashlib.sha1(open(path, "rb").read()).hexdigest()[:8]
    manifest[rel] = {"url": "/assets/" + rel.replace(os.sep, "/") + ".webp?v=" + v, "w": img.width, "h": img.height}


def trim(img):
    box = img.getbbox()
    return img.crop(box) if box else img


def squared(img, size):
    a = np.array(img)
    alpha = a[:, :, 3]
    labels, n = ndimage.label(alpha > 128)
    if n:
        sizes = ndimage.sum(np.ones_like(alpha), labels, range(1, n + 1))
        keep = np.nonzero(sizes >= sizes.max() * 0.02)[0] + 1
        ys, xs = np.nonzero(np.isin(labels, keep))
        a[:, :, 3] = np.where(alpha < 24, 0, alpha)
        img = Image.fromarray(a).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def circle_mask(img, size):
    img = img.convert("RGB").resize((size, size), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((2, 2, size - 2, size - 2), fill=255)
    img.putalpha(mask)
    return img


def split_sprites(img, count, rows):
    alpha = np.array(img)[:, :, 3] > 16
    labels, _ = ndimage.label(ndimage.binary_dilation(alpha, iterations=8))
    boxes = [s for s in ndimage.find_objects(labels) if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) > 0.01 * alpha.size]
    h, w = alpha.shape
    if len(boxes) != count:
        cols = count // rows
        boxes = [(slice(r * h // rows, (r + 1) * h // rows), slice(c * w // cols, (c + 1) * w // cols)) for r in range(rows) for c in range(cols)]
    boxes.sort(key=lambda s: (int(((s[0].start + s[0].stop) / 2) // (h / rows)), s[1].start))
    out = []
    for ys, xs in boxes:
        cell = np.array(img.crop((xs.start, ys.start, xs.stop, ys.stop)))
        lab, n = ndimage.label(ndimage.binary_dilation(cell[:, :, 3] > 16, iterations=8))
        if n > 1:
            cell[lab != np.bincount(lab.ravel())[1:].argmax() + 1, 3] = 0
        out.append(trim(Image.fromarray(cell)))
    return out


CACHE = os.path.join(ROOT, ".local", "asset-cache.json")
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}


def process(rel_png):
    rel = rel_png[:-4].replace("\\", "/")
    mtime = os.path.getmtime(os.path.join(SRC, rel_png))
    hit = cache.get(rel_png)
    if hit and hit["mtime"] == mtime and hit.get("rules") == RULES_VERSION and all(os.path.exists(os.path.join(OUT, k + ".webp")) for k in hit["entries"]):
        manifest.update(hit["entries"])
        return
    before = set(manifest)
    _process(rel_png, rel)
    cache[rel_png] = {"mtime": mtime, "rules": RULES_VERSION, "entries": {k: manifest[k] for k in set(manifest) - before}}


def _process(rel_png, rel):
    img = Image.open(os.path.join(SRC, rel_png))
    has_alpha = img.mode == "RGBA" and np.array(img)[:, :, 3].min() < 250
    if rel.endswith("expressions-sheet"):
        for name, sprite in zip(EXPRESSIONS, split_sprites(img.convert("RGBA"), 6, 2)):
            save(sprite, rel.replace("expressions-sheet", "expressions/" + name), 512)
        return
    if rel.startswith("characters/bosses/") and rel.endswith("-sheet"):
        for name, sprite in zip(BOSS_FACES, split_sprites(img.convert("RGBA"), 6, 2)):
            save(sprite, rel.replace("-sheet", "/" + name), 512)
        return
    if rel.startswith("parts/blade-") or rel.startswith("parts/disc-"):
        save(squared(img.convert("RGBA"), 512), rel, 512, 90)
        return
    if rel.startswith("stadium/bowl-"):
        save(circle_mask(img, 1024), rel, 1024, 85)
        return
    if "cutin" in rel or rel.startswith("vfx/"):
        save(img.convert("RGB"), rel, 1280 if "cutin" in rel else 512, 80)
        return
    if has_alpha:
        save(trim(img.convert("RGBA")), rel, 768 if rel.startswith(("ui/", "onboarding/")) else 1024)
        return
    save(img.convert("RGB"), rel, 1280, 80)


def icons():
    src = os.path.join(ROOT, "assets", "concept", "11g-app-icon.png")
    os.makedirs(ICONS, exist_ok=True)
    img = Image.open(src).convert("RGB")
    for s in (192, 512):
        img.resize((s, s), Image.LANCZOS).save(os.path.join(ICONS, f"icon-{s}.png"))
    pad = Image.new("RGB", (512, 512), (10, 15, 36))
    pad.paste(img.resize((400, 400), Image.LANCZOS), (56, 56))
    pad.save(os.path.join(ICONS, "icon-maskable-512.png"))


def check():
    bad = []
    for rel, m in manifest.items():
        if not os.path.exists(os.path.join(OUT, rel + ".webp")):
            bad.append(f"missing {rel}")
        if rel.startswith(("parts/blade-", "parts/disc-")) and m["w"] != m["h"]:
            bad.append(f"part not square {rel}")
    return bad


if __name__ == "__main__":
    for dirpath, _, files in os.walk(SRC):
        for f in sorted(files):
            if not f.endswith(".png"):
                continue
            rel = os.path.relpath(os.path.join(dirpath, f), SRC).replace("\\", "/")
            if SKIP.search(rel):
                continue
            process(rel)
    icons()
    json.dump(cache, open(CACHE, "w"))
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    json.dump(dict(sorted(manifest.items())), open(MANIFEST, "w"), indent=1)
    problems = check()
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(OUT) for f in fs)
    print(f"{len(manifest)} assets, {size / 1e6:.1f} MB")
    if problems:
        print("\n".join(problems))
        sys.exit(1)
