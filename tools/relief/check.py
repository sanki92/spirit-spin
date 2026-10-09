import os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage import morphology
from common import C, HALF, ROOT, SIZE

IOU_MIN = 0.98
SLIVER = 0.0015
TRI_MAX = 12000
HOLE_MIN = 0.0005
TIERS_OUT = os.path.join(ROOT, 'docs', 'art', 'relief', 'tiers')


def px(ring):
    return [(x * HALF + C, C - y * HALF) for x, y in ring]


def raster(shapes):
    im = Image.new('L', (SIZE, SIZE), 0)
    d = ImageDraw.Draw(im)
    for s in shapes:
        d.polygon(px(s['outer']), fill=1)
        for hole in s['holes']:
            d.polygon(px(hole), fill=0)
    return np.asarray(im).astype(bool)


def area(ring):
    a = 0.0
    for i in range(len(ring)):
        x0, y0 = ring[i - 1]
        x1, y1 = ring[i]
        a += x0 * y1 - x1 * y0
    return abs(a) / 2


def hole_count(mask, total):
    hl, hn = ndi.label(ndi.binary_fill_holes(mask) & ~mask)
    return sum(1 for j in range(1, hn + 1) if (hl == j).sum() >= HOLE_MIN * total)


def triangles(data, bevel=2):
    n = sum(len(s['outer']) + sum(len(h) for h in s['holes']) for t in data['tiers'] for s in t['shapes'])
    return n * (2 + 2 * (1 + 2 * bevel))


def check_part(name, data, ctx):
    errs = []
    opaque, total = ctx['opaque'], ctx['total']
    part_area = total / (HALF * HALF)
    tiers = data['tiers']
    if not tiers:
        return ['empty: no tiers']
    floor = raster(tiers[0]['shapes'])
    iou = (floor & opaque).sum() / max(1, (floor | opaque).sum())
    if iou < IOU_MIN:
        errs.append(f'outline: IoU {iou:.4f} < {IOU_MIN}')
    outside = opaque & ~morphology.binary_dilation(floor, morphology.disk(1))
    if outside.sum() > 0.002 * total:
        errs.append(f'coverage: {int(outside.sum())} opaque pixels outside the floor')
    want, got = hole_count(opaque, total), hole_count(floor, total)
    if want != got:
        errs.append(f'holes: floor has {got}, art has {want}')
    for t in tiers:
        for s in t['shapes']:
            a = area(s['outer'])
            if a < SLIVER * part_area:
                errs.append(f"sliver: tier {t['h']} shape area {a / part_area:.5f} of part < {SLIVER}")
    prev = floor
    for t in tiers[1:]:
        cur = raster(t['shapes'])
        out = cur & ~morphology.binary_dilation(prev, morphology.disk(2))
        if cur.any() and out.sum() > 0.002 * cur.sum():
            errs.append(f"nesting: tier {t['h']} has {out.sum() / cur.sum():.4f} of its area outside the tier below")
        prev = cur
    tri = triangles(data)
    if tri > TRI_MAX:
        errs.append(f'budget: ~{tri} triangles > {TRI_MAX}')
    return errs


def write_tiers(name, data, ctx):
    os.makedirs(TIERS_OUT, exist_ok=True)
    rgb, opaque = ctx['rgb'], ctx['opaque']
    pal = [(70, 80, 120), (90, 140, 255), (80, 230, 160), (255, 210, 80), (255, 90, 120), (230, 120, 255)]
    canvas = Image.new('RGB', (SIZE * 2, SIZE + 24), (11, 16, 48))
    art = (rgb * 255).astype(np.uint8)
    art[~opaque] = (11, 16, 48)
    canvas.paste(Image.fromarray(art), (0, 0))
    tm = np.zeros((SIZE, SIZE, 3), np.uint8) + np.array([11, 16, 48], np.uint8)
    for i, t in enumerate(data['tiers']):
        tm[raster(t['shapes'])] = pal[i % len(pal)]
    canvas.paste(Image.fromarray(tm), (SIZE, 0))
    d = ImageDraw.Draw(canvas)
    label = '  '.join(f"[{i}] h={t['h']}" for i, t in enumerate(data['tiers']))
    d.text((6, SIZE + 6), f'{name}  {label}  tris~{triangles(data)}', fill=(220, 240, 255))
    canvas.save(os.path.join(TIERS_OUT, name + '.png'))
