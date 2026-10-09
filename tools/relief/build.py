import json, os, sys
import numpy as np
from scipy import ndimage as ndi
from skimage import filters, measure as skm, morphology
from common import C, HALF, ROOT, load_part, load_path, part_names, radius_map
import measure
import check

TIERS = {'well': 0.03, 'base': 0.06, 'low': 0.10, 'mid': 0.14, 'high': 0.21}
MIN_PART = 0.0015
MIN_LAYER = 0.005
HOLE_MIN = 0.0005
TOLERANCES = (1.0, 1.5, 2.0, 3.0, 4.0)
RECIPES = os.path.join(os.path.dirname(__file__), 'recipes')
OUT = os.path.join(ROOT, 'apps', 'client', 'public', 'assets', 'relief')


class RecipeError(Exception):
    pass


def height(t):
    if isinstance(t, (int, float)):
        if not 0.03 <= t <= 0.24:
            raise RecipeError(f'explicit height {t} outside 0.03-0.24')
        return float(t)
    if t not in TIERS:
        raise RecipeError(f'unknown tier {t}')
    return TIERS[t]


def where_mask(where, opaque, masks, rad, ang):
    if where == 'all':
        return opaque.copy()
    m = opaque.copy()
    if 'material' in where:
        if where['material'] not in masks:
            raise RecipeError(f"unknown material {where['material']}")
        m &= masks[where['material']]
    if 'r' in where:
        a, b = where['r']
        m &= (rad >= a) & (rad < b)
    if 'angles' in where:
        hit = np.zeros_like(m)
        for a, b in where['angles']:
            hit |= ((ang - a) % 360) < ((b - a) % 360)
        m &= hit
    return m


def seam_mask(rgb, opaque, pct=85, min_len=0):
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    edge = filters.sobel(ndi.gaussian_filter(lum, 0.8))
    sk = morphology.skeletonize((edge > np.percentile(edge[opaque], pct)) & opaque)
    if min_len > 0:
        sk = morphology.remove_small_objects(sk, min_len, connectivity=2)
    return sk


def px_to_norm(contour):
    c = contour - 2
    return [((x - C) / HALF, -(y - C) / HALF) for y, x in c]


def longest(mask):
    cs = skm.find_contours(np.pad(mask, 2).astype(float), 0.5)
    return max(cs, key=len) if cs else None


def mask_geom(mask, total):
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    polys = []
    for i in range(1, n + 1):
        comp = lab == i
        if comp.sum() < MIN_PART * total:
            continue
        filled = ndi.binary_fill_holes(comp)
        outer = longest(filled)
        if outer is None or len(outer) < 4:
            continue
        holes = []
        hl, hn = ndi.label(filled & ~comp)
        for j in range(1, hn + 1):
            hm = hl == j
            if hm.sum() < HOLE_MIN * total:
                continue
            c = longest(hm)
            if c is not None and len(c) >= 4:
                holes.append(px_to_norm(c))
        p = Polygon(px_to_norm(outer), holes).buffer(0)
        if not p.is_empty:
            polys.append(p)
    return unary_union(polys) if polys else None


def geom_shapes(g, min_area):
    if g is None or g.is_empty:
        return []
    parts = [g] if g.geom_type == 'Polygon' else [x for x in getattr(g, 'geoms', []) if x.geom_type == 'Polygon']
    out = []
    for p in parts:
        if p.area < min_area:
            continue
        r = lambda ring: [[round(float(x), 4), round(float(y), 4)] for x, y in list(ring.coords)[:-1]]
        holes = [r(h) for h in p.interiors if len(h.coords) >= 4]
        outer = r(p.exterior)
        if len(outer) >= 3:
            out.append({'outer': outer, 'holes': holes})
    return out


def emit(tiers, total, tol):
    from shapely.geometry import MultiPolygon, Polygon
    min_area = MIN_PART * 1.05 * total / (HALF * HALF)
    out, prev = [], None
    for k, t in enumerate(tiers):
        g = mask_geom(t['mask'], total)
        if g is None:
            continue
        g = g.simplify((1.0 if k == 0 else tol) / HALF, preserve_topology=True)
        if prev is not None:
            g = g.intersection(prev.buffer(-0.5 / HALF, join_style='mitre'))
        shapes = geom_shapes(g, min_area)
        if not shapes:
            continue
        out.append({'h': t['h'], 'wall': t['wall'], 'shapes': shapes})
        prev = MultiPolygon([Polygon(s['outer'], s['holes']) for s in shapes]).buffer(0)
    return out


def build_arrays(rgb, opaque, recipe):
    m = measure.measure_arrays(rgb, opaque)
    rc = recipe.get('centre')
    if not rc or max(abs(rc[0] - m['centre'][0]), abs(rc[1] - m['centre'][1])) > 0.002:
        raise RecipeError(f"centre {rc} does not match measured {m['centre']}")
    cx, cy = C + m['centre'][0] * HALF, C - m['centre'][1] * HALF
    rad, ang = radius_map(cx, cy), measure.angle_map(cx, cy)
    ov = recipe.get('materials', {})
    masks = measure.material_masks(rgb, opaque, dark=tuple(ov.get('dark', (0.42, 0.35))), bright=tuple(ov.get('bright', (0.55, 0.22))), sat=ov.get('saturated', 0.35))
    total = int(opaque.sum())
    h = np.full(opaque.shape, np.nan, np.float32)
    for i, layer in enumerate(recipe['layers']):
        mm = where_mask(layer['where'], opaque, masks, rad, ang)
        if mm.sum() < MIN_LAYER * total:
            raise RecipeError(f"layer {i} ({layer}) covers {mm.sum() / total:.4f} of the part, under {MIN_LAYER}")
        h[mm] = height(layer['tier'])
    if np.isnan(h[opaque]).any():
        raise RecipeError(f'coverage: {int(np.isnan(h[opaque]).sum())} opaque pixels have no tier')
    if 'seams' in recipe:
        sm = recipe['seams']
        cut = morphology.binary_dilation(seam_mask(rgb, opaque, sm.get('pct', 85), sm.get('min_len', 0)), morphology.disk(max(0, sm.get('width', 2) // 2)))
        cut &= where_mask(sm.get('where', 'all'), opaque, masks, rad, ang)
        h[cut] = np.minimum(h[cut], height(sm.get('tier', 'base')))
    levels = sorted(set(np.unique(h[opaque]).round(4).tolist()))
    tiers, below = [], None
    for k, lv in enumerate(levels):
        if k == 0:
            mk = opaque.copy()
        else:
            mk = (h >= lv - 1e-6) & opaque
            mk = morphology.binary_opening(mk, morphology.disk(1))
            mk = morphology.remove_small_objects(mk, int(MIN_PART * total))
            mk &= below
        if not mk.any():
            continue
        above = ((h >= levels[k + 1] - 1e-6) & opaque) if k + 1 < len(levels) else np.zeros_like(mk)
        own = mk & ~above
        src = rgb[own] if own.any() else rgb[mk]
        wall = '#%02x%02x%02x' % tuple((src.mean(0) * 0.6 * 255).clip(0, 255).astype(int))
        tiers.append({'h': round(float(lv), 4), 'wall': wall, 'mask': mk})
        below = mk
    profile = []
    for i in range(16):
        b = opaque & (rad >= i / 16) & (rad < (i + 1) / 16)
        profile.append(round(float(np.max(h[b])), 4) if b.any() else 0.0)
    for tol in TOLERANCES:
        data = {'v': 1, 'centre': m['centre'], 'inner': m['inner'], 'outer': m['outer'], 'profile': profile, 'tiers': emit(tiers, total, tol), 'tol': tol}
        if check.triangles(data) <= check.TRI_MAX:
            break
    ctx = {'opaque': opaque, 'total': total, 'rgb': rgb, 'h': h}
    return data, ctx


def build_path(path, recipe):
    return build_arrays(*load_path(path), recipe)


def build_part(name, recipe):
    return build_arrays(*load_part(name), recipe)


def main(names=None):

    names = names or part_names()
    missing = [n for n in names if not os.path.exists(os.path.join(RECIPES, n + '.json'))]
    if missing:
        print('relief: missing recipe for', ', '.join(missing))
        return 1
    os.makedirs(OUT, exist_ok=True)
    bad = 0
    for n in names:
        recipe = json.load(open(os.path.join(RECIPES, n + '.json'), encoding='utf-8'))
        try:
            data, ctx = build_part(n, recipe)
        except RecipeError as e:
            print('relief:', n, 'recipe error:', e)
            bad += 1
            continue
        errs = check.check_part(n, data, ctx)
        check.write_tiers(n, data, ctx)
        if errs:
            print('relief:', n, 'FAILED', '; '.join(errs))
            bad += 1
            continue
        json.dump(data, open(os.path.join(OUT, n + '.json'), 'w'), separators=(',', ':'))
        print('relief:', n, 'ok', [t['h'] for t in data['tiers']], 'tris', check.triangles(data))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:] or None))
