"""Split a transparent sprite sheet into one PNG per sprite.
Usage: python split_sheet.py sheet.png out_dir name1 name2 ...   (names in reading order: left->right, top->bottom)
Finds sprites as connected alpha blobs, so uneven AI-generated grids still split cleanly."""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage


def split(path, out_dir, names, pad=12):
    im = Image.open(path).convert("RGBA")
    alpha = np.array(im)[:, :, 3] > 16
    # dilation merges sparkles/strands into their sprite; raise iterations if a sprite splits in two
    labels, n = ndimage.label(ndimage.binary_dilation(alpha, iterations=8))
    boxes = [s for s in ndimage.find_objects(labels)
             if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) > 0.01 * alpha.size]
    rows = 2 if len(names) == 6 else 1
    if len(boxes) != len(names):
        # sprites touch each other: fall back to an even grid, then trim each cell to its own alpha
        cols, (h, w) = len(names) // rows, alpha.shape
        boxes = [(slice(r * h // rows, (r + 1) * h // rows), slice(c * w // cols, (c + 1) * w // cols))
                 for r in range(rows) for c in range(cols)]
        print(f"{path}: blobs merged, using {cols}x{rows} grid")
    rows_h = alpha.shape[0] / rows
    boxes.sort(key=lambda s: (int(((s[0].start + s[0].stop) / 2) // rows_h), s[1].start))
    os.makedirs(out_dir, exist_ok=True)
    h, w = alpha.shape
    for name, (ys, xs) in zip(names, boxes):
        box = (max(xs.start - pad, 0), max(ys.start - pad, 0), min(xs.stop + pad, w), min(ys.stop + pad, h))
        cell = im.crop(box)
        # keep only the dominant sprite in the cell; neighbours' fragments that spill in get cleared
        arr = np.array(cell)
        lab, _ = ndimage.label(ndimage.binary_dilation(arr[:, :, 3] > 16, iterations=8))
        if lab.max() > 1:
            biggest = np.bincount(lab.ravel())[1:].argmax() + 1
            arr[lab != biggest, 3] = 0
            cell = Image.fromarray(arr)
        cell.crop(cell.getbbox() or (0, 0, *cell.size)).save(os.path.join(out_dir, f"{name}.png"))
    print(f"{path}: {len(names)} sprites -> {out_dir}")


if __name__ == "__main__":
    split(sys.argv[1], sys.argv[2], sys.argv[3:])
