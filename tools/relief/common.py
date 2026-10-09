import os
import numpy as np
from PIL import Image
from skimage import morphology

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PARTS = os.path.join(ROOT, 'assets', 'final', 'parts')
SIZE = 512
HALF = SIZE / 2
SPECK = 0.0015


def part_names():
    return sorted(f[:-4] for f in os.listdir(PARTS) if f.endswith('.png') and (f.startswith('blade-') or f.startswith('disc-')))


def load_path(path):
    im = Image.open(path).convert('RGBA')
    if im.size != (SIZE, SIZE):
        im = im.resize((SIZE, SIZE), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    opaque = morphology.binary_opening(a[..., 3] > 0.43, morphology.disk(1))
    opaque = morphology.remove_small_objects(opaque, max(1, int(SPECK * opaque.sum())), connectivity=2)
    return a[..., :3], opaque


def load_part(name):
    return load_path(os.path.join(PARTS, name + '.png'))


C = (SIZE - 1) / 2


def centre_px(opaque):
    from scipy import ndimage as ndi
    hole = ndi.binary_fill_holes(opaque) & ~opaque
    lab, n = ndi.label(hole)
    best = None
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() < 0.005 * SIZE * SIZE:
            continue
        cy, cx = ndi.center_of_mass(m)
        d = (cx - C) ** 2 + (cy - C) ** 2
        if best is None or d < best[0]:
            best = (d, cx, cy)
    if best:
        return best[1], best[2]
    cy, cx = ndi.center_of_mass(opaque)
    return cx, cy


def to_norm(cx, cy):
    return round(float((cx - C) / HALF), 4), round(float(-(cy - C) / HALF), 4)


def radius_map(cx=C, cy=C):
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    return np.hypot(xx - cx, yy - cy) / HALF
