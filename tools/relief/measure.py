import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.signal import find_peaks
from skimage import filters, morphology
from common import C, HALF, ROOT, SIZE, centre_px, load_part, load_path, part_names, radius_map, to_norm

OUT = os.path.join(ROOT, 'docs', 'art', 'relief', 'measure')
BINS = int(HALF)


def angle_map(cx=C, cy=C):
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    return (np.degrees(np.arctan2(-(yy - cy), xx - cx)) + 360) % 360


def hsv(rgb):
    mx, mn = rgb.max(-1), rgb.min(-1)
    return mx, np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)


def material_masks(rgb, opaque, dark=(0.42, 0.35), bright=(0.55, 0.22), sat=0.35):
    v, s = hsv(rgb)
    d = opaque & (v < dark[0]) & (s < dark[1])
    b = opaque & (v >= bright[0]) & (s < bright[1]) & ~d
    c = opaque & (s >= sat) & ~d
    return {'dark': d, 'bright': b, 'saturated': c, 'neutral': opaque & (s < sat)}


def radial_extent(opaque, rad):
    idx = np.clip((rad * BINS).astype(int), 0, BINS)
    tot = np.bincount(idx.ravel(), minlength=BINS + 1)
    hit = np.bincount(idx.ravel(), weights=opaque.ravel().astype(float), minlength=BINS + 1)
    cov = hit / np.maximum(tot, 1)
    on = np.nonzero(cov > 0.5)[0]
    reach = np.nonzero(cov > 0.02)[0]
    if not len(on) or not len(reach):
        return 0.0, 0.0, cov
    return float(on[0] / BINS) if on[0] > 1 else 0.0, float((reach[-1] + 1) / BINS), cov


def edge_profile(rgb, opaque, rad):
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    edge = filters.sobel(ndi.gaussian_filter(lum, 0.8))
    edge[~morphology.binary_erosion(opaque, morphology.disk(2))] = 0
    idx = np.clip((rad * BINS).astype(int), 0, BINS)
    tot = np.bincount(idx.ravel(), weights=morphology.binary_erosion(opaque, morphology.disk(2)).ravel().astype(float), minlength=BINS + 1)
    e = np.bincount(idx.ravel(), weights=edge.ravel(), minlength=BINS + 1) / np.maximum(tot, 1)
    return e


def rings_from(profile, inner, outer):
    if profile.max() <= 0:
        return []
    peaks, _ = find_peaks(profile, prominence=profile.max() * 0.2, distance=4)
    lo, hi = inner + 0.015, outer - 0.015
    return [round(float((p + 0.5) / BINS), 3) for p in peaks if lo < (p + 0.5) / BINS < hi]


def claw_angles(dark, opaque, ang):
    tot = np.bincount((ang[opaque].astype(int)) % 360, minlength=360).astype(float)
    hit = np.bincount((ang[dark].astype(int)) % 360, minlength=360).astype(float)
    prof = hit / np.maximum(tot, 1)
    prof = ndi.uniform_filter1d(prof, 5, mode='wrap')
    if prof.max() < 0.05:
        return [], prof
    on = prof > max(0.05, prof.max() * 0.5)
    if on.all():
        return [], prof
    start = int(np.argmin(on))
    rolled = np.roll(on, -start)
    lab, n = ndi.label(rolled)
    out = []
    for i in range(1, n + 1):
        idx = np.nonzero(lab == i)[0]
        if len(idx) < 3:
            continue
        w = np.roll(prof, -start)[idx]
        centre = (float((idx * w).sum() / w.sum()) + start) % 360
        out.append(round(centre, 1))
    return sorted(out), prof


def measure_arrays(rgb, opaque):
    cx, cy = centre_px(opaque)
    rad, ang = radius_map(cx, cy), angle_map(cx, cy)
    inner, outer, _ = radial_extent(opaque, rad)
    prof = edge_profile(rgb, opaque, rad)
    masks = material_masks(rgb, opaque)
    claws, _ = claw_angles(masks['dark'], opaque, ang)
    total = max(1, int(opaque.sum()))
    return {
        'centre': list(to_norm(cx, cy)),
        'inner': round(inner, 3),
        'outer': round(outer, 3),
        'rings': rings_from(prof, inner, outer),
        'claws': claws,
        'materials': {k: round(float(m.sum() / total), 3) for k, m in masks.items() if k != 'neutral'},
    }


def measure_path(path):
    return measure_arrays(*load_path(path))


def measure_part(name):
    return measure_arrays(*load_part(name))


def write_review(name, rgb, opaque, m):
    os.makedirs(OUT, exist_ok=True)
    cx, cy = C + m['centre'][0] * HALF, C - m['centre'][1] * HALF
    rad = radius_map(cx, cy)
    masks = material_masks(rgb, opaque)
    prof = edge_profile(rgb, opaque, rad)
    tile = 256
    canvas = Image.new('RGB', (tile * 4, tile + 200), (11, 16, 48))
    art = (rgb * 255).astype(np.uint8); art[~opaque] = (11, 16, 48)
    canvas.paste(Image.fromarray(art).resize((tile, tile)), (0, 0))
    for i, (k, col) in enumerate((('dark', (230, 230, 240)), ('saturated', (60, 220, 120)), ('bright', (250, 220, 90)))):
        t = np.zeros((SIZE, SIZE, 3), np.uint8) + np.array([11, 16, 48], np.uint8)
        t[opaque] = (40, 46, 80); t[masks[k]] = col
        canvas.paste(Image.fromarray(t).resize((tile, tile)), (tile * (i + 1), 0))
    d = ImageDraw.Draw(canvas)
    for i, k in enumerate(('art', 'dark', 'saturated', 'bright')):
        d.text((tile * i + 6, 4), k if k == 'art' else f"{k} {m['materials'][k]*100:.1f}%", fill=(255, 255, 255))
    k = tile / SIZE
    for i in range(4):
        ox, oy = tile * i + cx * k, cy * k
        for rr, col in [(r, (255, 80, 200)) for r in m['rings']] + [(m['inner'], (255, 200, 80)), (m['outer'], (255, 200, 80))]:
            rp = rr * HALF * k
            d.ellipse((ox - rp, oy - rp, ox + rp, oy + rp), outline=col)
    y0, h, w = tile + 20, 120, tile * 4 - 20
    mx = prof.max() or 1
    pts = [(10 + w * i / BINS, y0 + h - h * prof[i] / mx) for i in range(BINS)]
    d.line(pts, fill=(120, 200, 255), width=1)
    for rr in m['rings']:
        x = 10 + w * rr
        d.line((x, y0, x, y0 + h), fill=(255, 80, 200))
        d.text((x + 2, y0), f'{rr:.3f}', fill=(255, 160, 220))
    for rr, col in ((m['inner'], (255, 200, 80)), (m['outer'], (255, 200, 80))):
        x = 10 + w * rr
        d.line((x, y0, x, y0 + h), fill=col)
    d.text((10, y0 + h + 6), f"{name}  centre {m['centre']}  inner {m['inner']}  outer {m['outer']}  rings {m['rings']}  claws {len(m['claws'])} @ {m['claws']}", fill=(220, 240, 255))
    canvas.save(os.path.join(OUT, name + '.png'))
    json.dump(m, open(os.path.join(OUT, name + '.json'), 'w'), indent=1)


def run(names):
    for n in names:
        rgb, opaque = load_part(n)
        m = measure_arrays(rgb, opaque)
        write_review(n, rgb, opaque, m)
        print(n, json.dumps(m))


if __name__ == '__main__':
    run(sys.argv[1:] or part_names())
