from PIL import Image
import numpy as np


def unpremultiply(rgb: np.ndarray, a: np.ndarray) -> np.ndarray:
    safe = np.maximum(a, 1e-3)[..., None]
    return np.clip(rgb / safe, 0, 1)


def radial_fade(h: int, w: int) -> np.ndarray:
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.hypot((x + 0.5) / w - 0.5, (y + 0.5) / h - 0.5)
    t = np.clip((0.49 - r) / 0.15, 0, 1)
    return t * t * (3 - 2 * t)


def key_black(src: Image.Image) -> Image.Image:
    rgb = np.asarray(src.convert('RGB'), dtype=np.float32) / 255
    lum = rgb.max(axis=2)
    a = np.clip((lum - 0.06) / 0.94, 0, 1) * radial_fade(*lum.shape)
    out = np.dstack([unpremultiply(rgb, np.maximum(a, 1e-3)), a])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def smooth(lo: float, hi: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def key_slab(src: Image.Image) -> Image.Image:
    rgb = np.asarray(src.convert('RGB'), dtype=np.float32) / 255
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    border = np.concatenate([lum[:24].ravel(), lum[-24:].ravel(), lum[:, :24].ravel(), lum[:, -24:].ravel()])
    bg = float(np.median(border))
    dark = smooth(0.3, 0.75, (bg - lum) / bg)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    glow = smooth(0.18, 0.6, np.maximum((lum - bg) / (1 - bg), sat))
    a = np.maximum(dark, glow)
    lit = glow >= dark
    color = np.where(lit[..., None], unpremultiply(np.clip(rgb - bg * (1 - a[..., None]), 0, 1), a), rgb * 0.3)
    out = np.dstack([np.clip(color, 0, 1), a])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def key_ribbon(src: Image.Image) -> Image.Image:
    rgb = np.asarray(src.convert('RGB'), dtype=np.float32) / 255
    lum = rgb.max(axis=2)
    h = lum.shape[0]
    y = (np.arange(h, dtype=np.float32) + 0.5) / h
    edge = np.clip(np.minimum(y, 1 - y) / 0.18, 0, 1)
    edge = edge * edge * (3 - 2 * edge)
    a = np.clip((lum - 0.06) / 0.94, 0, 1) * edge[:, None]
    out = np.dstack([unpremultiply(rgb, np.maximum(a, 1e-3)), a])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def key_vfx(name: str, src: Image.Image) -> Image.Image:
    if name == 'crack-decal' or name.startswith('power/shadow-'):
        return key_slab(src)
    if name.endswith('-surface'):
        return src.convert('RGB')
    if name.endswith('-ribbon'):
        return key_ribbon(src)
    return key_black(src)
