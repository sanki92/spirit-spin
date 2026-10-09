import os, sys, tempfile
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))

SIZE = 512
C = (SIZE - 1) / 2

def polar(cx=C, cy=C):
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    r = np.hypot(xx - cx, yy - cy) / (SIZE / 2)
    ang = (np.degrees(np.arctan2(-(yy - cy), xx - cx)) + 360) % 360
    return r, ang

def synthetic(path, dy=0):
    r, ang = polar(C, C + dy)
    img = np.zeros((SIZE, SIZE, 4), np.uint8)
    bands = [(0.30, 0.40, (200, 200, 205)), (0.40, 0.60, (40, 190, 90)), (0.60, 0.80, (20, 90, 45)), (0.80, 0.90, (40, 190, 90))]
    for a, b, rgb in bands:
        m = (r >= a) & (r < b)
        img[m, :3] = rgb; img[m, 3] = 255
    for k in range(6):
        d = np.abs(((ang - k * 60) + 180) % 360 - 180)
        m = (d < 10) & (r >= 0.82) & (r < 0.90)
        img[m, :3] = (55, 55, 60)
    Image.fromarray(img).save(path)

def near(values, target, tol):
    return any(abs(v - target) <= tol for v in values)

def test_measure_recovers_known_geometry():
    import measure
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, 'synthetic.png'); synthetic(p)
        m = measure.measure_path(p)
        assert abs(m['inner'] - 0.30) <= 0.01, m['inner']
        assert abs(m['outer'] - 0.90) <= 0.01, m['outer']
        for t in (0.40, 0.60, 0.80):
            assert near(m['rings'], t, 0.012), (t, m['rings'])
        assert len(m['claws']) == 6, m['claws']
        for k in range(6):
            assert near(m['claws'], k * 60, 3) or near(m['claws'], k * 60 + 360, 3), m['claws']
        bright = (0.40 ** 2 - 0.30 ** 2) / (0.90 ** 2 - 0.30 ** 2)
        dark = 6 * (20 / 360) * (0.90 ** 2 - 0.82 ** 2) / (0.90 ** 2 - 0.30 ** 2)
        assert abs(m['materials']['bright'] - bright) < 0.006, (m['materials'], bright)
        assert abs(m['materials']['dark'] - dark) < 0.006, (m['materials'], dark)
        assert abs(m['materials']['saturated'] - (1 - bright - dark)) < 0.01, m['materials']
        assert measure.measure_path(p) == m

def test_measure_finds_the_real_centre_of_an_off_centre_part():
    import measure
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, 'shifted.png'); synthetic(p, dy=-40)
        m = measure.measure_path(p)
        assert abs(m['centre'][0]) <= 0.006 and abs(m['centre'][1] - 40 / (SIZE / 2)) <= 0.006, m['centre']
        assert abs(m['inner'] - 0.30) <= 0.01 and abs(m['outer'] - 0.90) <= 0.01, (m['inner'], m['outer'])
        for t in (0.40, 0.60, 0.80):
            assert near(m['rings'], t, 0.012), (t, m['rings'])
        assert len(m['claws']) == 6, m['claws']

def ring_recipe(centre=None):
    return {
        'part': 'synthetic',
        'centre': centre or [0.0, 0.0],
        'layers': [
            {'tier': 'base', 'where': 'all'},
            {'tier': 'mid', 'where': {'r': [0.40, 0.60]}},
            {'tier': 'high', 'where': {'material': 'dark'}},
        ],
        'why': 'test',
    }

def build_synthetic(recipe, dy=0):
    import build
    d = tempfile.mkdtemp()
    p = os.path.join(d, 'synthetic.png'); synthetic(p, dy=dy)
    return build.build_path(p, recipe)

def test_build_ring_passes_every_check():
    import build, check
    data, ctx = build_synthetic(ring_recipe())
    assert check.check_part('synthetic', data, ctx) == [], check.check_part('synthetic', data, ctx)
    hs = [t['h'] for t in data['tiers']]
    assert hs == sorted(hs) and hs[0] == 0.06 and hs[-1] == 0.21, hs
    floor = data['tiers'][0]['shapes']
    assert len(floor) == 1 and len(floor[0]['holes']) == 1, [len(s['holes']) for s in floor]
    assert len(data['tiers'][-1]['shapes']) == 6
    assert len(data['profile']) == 16 and abs(data['inner'] - 0.30) <= 0.01

def test_check_catches_filled_hole():
    import check
    data, ctx = build_synthetic(ring_recipe())
    data['tiers'][0]['shapes'][0]['holes'] = []
    errs = check.check_part('synthetic', data, ctx)
    assert any(e.startswith('holes') for e in errs), errs

def test_check_catches_sliver():
    import check
    data, ctx = build_synthetic(ring_recipe())
    data['tiers'][1]['shapes'].append({'outer': [[0.7, 0.0], [0.705, 0.0], [0.705, 0.005], [0.7, 0.005]], 'holes': []})
    errs = check.check_part('synthetic', data, ctx)
    assert any(e.startswith('sliver') for e in errs), errs

def test_check_catches_floating_tier():
    import check
    data, ctx = build_synthetic(ring_recipe())
    data['tiers'][-1]['shapes'].append({'outer': [[0.0, 0.05], [0.12, 0.05], [0.12, 0.15], [0.0, 0.15]], 'holes': []})
    errs = check.check_part('synthetic', data, ctx)
    assert any(e.startswith('nesting') for e in errs), errs

def test_recipe_errors_are_loud():
    import build
    r = ring_recipe(); r['layers'].append({'tier': 'low', 'where': {'r': [0.95, 0.99]}})
    try:
        build_synthetic(r); raise AssertionError('dead layer accepted')
    except build.RecipeError as e:
        assert 'covers' in str(e)
    r = ring_recipe(centre=[0.2, 0.0])
    try:
        build_synthetic(r); raise AssertionError('stale centre accepted')
    except build.RecipeError as e:
        assert 'centre' in str(e)
    r = ring_recipe(); r['layers'] = r['layers'][1:]
    try:
        build_synthetic(r); raise AssertionError('uncovered pixels accepted')
    except build.RecipeError as e:
        assert 'coverage' in str(e)

def test_well_makes_the_floor():
    import build, check
    r = ring_recipe(); r['layers'].insert(1, {'tier': 'well', 'where': {'r': [0.30, 0.40]}})
    data, ctx = build_synthetic(r)
    assert data['tiers'][0]['h'] == 0.03 and len(data['tiers'][0]['shapes'][0]['holes']) == 1
    assert check.check_part('synthetic', data, ctx) == []

def test_off_centre_part_builds_around_its_centre():
    import build, check
    data, ctx = build_synthetic(ring_recipe(centre=[0.0, round(40 / 256, 4)]), dy=-40)
    assert abs(data['centre'][1] - 40 / 256) < 0.006
    assert check.check_part('synthetic', data, ctx) == []

if __name__ == '__main__':
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith('test_') and callable(fn):
            try:
                fn(); print('PASS', name)
            except Exception as e:
                fails += 1; print('FAIL', name, type(e).__name__, e)
    sys.exit(1 if fails else 0)
