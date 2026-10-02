import json, os
import lameenc
import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "audio", "src")
OUT = os.path.join(ROOT, "apps", "client", "public", "assets", "audio")
MANIFEST = os.path.join(ROOT, "apps", "client", "src", "assets", "audio.json")

I = "kenney_impact-sounds/Audio/"
S = "kenney_sci-fi-sounds/Audio/"
U = "kenney_interface-sounds/Audio/"
J = "kenney_music-jingles/Audio/"

MAP = {
    "tick": [U + "tick_002.ogg"],
    "launch": [S + "forceField_000.ogg"],
    "rip": [S + "thrusterFire_000.ogg", S + "thrusterFire_001.ogg"],
    "clash": [I + f"impactMetal_light_00{i}.ogg" for i in range(5)],
    "clashHeavy": [I + f"impactMetal_heavy_00{i}.ogg" for i in range(5)],
    "wall": [I + f"impactPlate_light_00{i}.ogg" for i in range(3)],
    "ringout": [S + "explosionCrunch_000.ogg"],
    "shatter": [I + "impactGlass_heavy_000.ogg", I + "impactGlass_heavy_001.ogg"],
    "spirit": [S + "forceField_002.ogg"],
    "spinDown": [S + "spaceEngineLow_000.ogg"],
    "finish": [I + "impactBell_heavy_000.ogg"],
    "victory": [J + "Hit jingles/jingles_HIT00.ogg"],
    "defeat": [J + "Pizzicato jingles/jingles_PIZZI04.ogg"],
    "ui": [U + "click_002.ogg"],
    "callout": [U + "confirmation_002.ogg"],
    "hesitate": [U + "error_004.ogg"],
    "hum": [S + "engineCircular_000.ogg"],
}


def to_mp3(src, dst):
    data, rate = sf.read(src, dtype="int16", always_2d=True)
    mono = data.mean(axis=1).astype(np.int16)
    enc = lameenc.Encoder()
    enc.set_bit_rate(96)
    enc.set_in_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)
    mp3 = enc.encode(mono.tobytes()) + enc.flush()
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, "wb").write(mp3)


if __name__ == "__main__":
    manifest = {}
    for sid, files in MAP.items():
        urls = []
        for i, f in enumerate(files):
            name = f"{sid}-{i}.mp3"
            to_mp3(os.path.join(SRC, f), os.path.join(OUT, name))
            urls.append(f"/assets/audio/{name}")
        manifest[sid] = urls
    json.dump(manifest, open(MANIFEST, "w"), indent=1)
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"{sum(len(v) for v in manifest.values())} clips, {size / 1e3:.0f} KB")
