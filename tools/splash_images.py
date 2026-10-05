import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "final", "key-art", "hero-portrait.png")
OUT = os.path.join(ROOT, "apps", "client", "public", "splash")
SIZES = [(1320, 2868), (1290, 2796), (1284, 2778), (1260, 2736), (1206, 2622), (1179, 2556), (1170, 2532), (1125, 2436), (1080, 2340), (1242, 2688), (828, 1792), (750, 1334)]


def cover(img, w, h):
    scale = max(w / img.width, h / img.height)
    big = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left, top = (big.width - w) // 2, (big.height - h) // 2
    return big.crop((left, top, left + w, top + h))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    art = Image.open(SRC).convert("RGB")
    for w, h in SIZES:
        cover(art, w, h).save(os.path.join(OUT, f"launch-{w}x{h}.jpg"), "JPEG", quality=84, optimize=True, progressive=False)
    print(len(SIZES), "splash images")
