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

if __name__ == '__main__':
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith('test_') and callable(fn):
            try:
                fn(); print('PASS', name)
            except Exception as e:
                fails += 1; print('FAIL', name, type(e).__name__, e)
    sys.exit(1 if fails else 0)
