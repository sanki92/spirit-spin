import hashlib, json, os
import lameenc
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "audio", "eleven")
OUT = os.path.join(ROOT, "apps", "client", "public", "assets", "audio")
MANIFEST = os.path.join(ROOT, "apps", "client", "src", "assets", "audio.json")
VOICES = os.path.join(ROOT, "apps", "client", "src", "assets", "voice.json")
BEASTS = ["voltfang", "aegiron", "nagara", "agnyx", "zephyra", "umbrax"]

TARGET = {"sfx": -17, "ui": -20, "bed": -27, "crowd": -21, "sting": -17, "voice": -15}

MAP = {
    "count": ("sfx", ["count-beat"]),
    "go": ("sfx", ["count-go"]),
    "rip": ("sfx", ["rip-1", "rip-2"]),
    "clash": ("sfx", [f"clash-{i}" for i in range(1, 6)]),
    "clashHeavy": ("sfx", [f"clashheavy-{i}" for i in range(1, 6)]),
    "wall": ("sfx", [f"wall-{i}" for i in range(1, 4)]),
    "edge": ("sfx", ["edge"]),
    "hum": ("loop", ["hum"]),
    "ringout": ("sfx", ["finish-ringout"]),
    "shatter": ("sfx", ["finish-shatter"]),
    "spinDown": ("sfx", ["finish-spin"]),
    "finish": ("sfx", ["finish-spirit"]),
    "spirit": ("sfx", ["finish-spirit"]),
    "hesitate": ("sfx", ["hesitate"]),
    "victory": ("sting", ["victory"]),
    "defeat": ("sting", ["defeat"]),
    "ui": ("ui", ["ui-tap-2"]),
    "callout": ("ui", ["ui-confirm-2"]),
    "uiBack": ("ui", ["ui-back-1"]),
    "uiError": ("ui", ["ui-error-2"]),
    "uiToggle": ("ui", ["ui-toggle-2"]),
    "uiTab": ("ui", ["ui-tab-2"]),
    "reward": ("ui", ["ui-reward-2"]),
    "unlock": ("ui", ["ui-unlock-2"]),
    "crowdCalm": ("bed", ["crowd-calm"]),
    "crowdExcited": ("bed", ["crowd-excited"]),
    "crowdRoar": ("bed", ["crowd-roar"]),
    "cheer": ("crowd", ["cheer-1", "cheer-2"]),
    "ooh": ("crowd", ["ooh-1", "ooh-2"]),
    "gasp": ("crowd", ["gasp-1", "gasp-2"]),
    "aww": ("crowd", ["aww-1", "aww-2"]),
    "roar": ("crowd", ["roar-1", "roar-2"]),
    "applause": ("crowd", ["applause"]),
    "chant": ("crowd", ["chant"]),
    **{f"{b}{part.title()}": ("sfx", [f"{b}-{part}"]) for b in BEASTS for part in ("charge", "release", "impact")},
    **{f"{b}Select": ("sfx", [f"{b}-select-1", f"{b}-select-2"]) for b in BEASTS},
}
COUNT_VO = {"vo3": "count-3", "vo2": "count-2", "vo1": "count-1"}

HP = {"ui": 150, "voice": 90}


def loudness(x, rate):
    block = int(rate * 0.4)
    if len(x) < block:
        return None
    hop = block // 4
    ms = np.array([np.mean(x[i:i + block] ** 2) for i in range(0, len(x) - block + 1, hop)])
    ms = ms[ms > 1e-7]
    if not len(ms):
        return None
    rel = ms[ms > np.mean(ms) * 0.1]
    return 10 * np.log10(np.mean(rel if len(rel) else ms))


def trim(x, rate, keep_tail):
    a = np.abs(x)
    on = np.where(a > 10 ** (-50 / 20))[0]
    if not len(on):
        return x
    start = max(0, on[0] - int(rate * 0.003))
    end = len(x) if keep_tail else min(len(x), on[-1] + int(rate * 0.02))
    return x[start:end]


def fade(x, rate, fin=0.004, fout=0.03):
    x = x.copy()
    n, m = min(len(x), int(rate * fin)), min(len(x), int(rate * fout))
    x[:n] *= np.linspace(0, 1, n)
    x[len(x) - m:] *= np.linspace(1, 0, m)
    return x


def loop_bake(x, rate, xf=0.4):
    n = int(rate * xf)
    head, body, tail = x[:n], x[n:len(x) - n], x[len(x) - n:]
    ramp = np.linspace(0, 1, n)
    return np.concatenate([body, tail * (1 - ramp) + head * ramp])


def process(path, kind):
    x, rate = sf.read(path, dtype="float64", always_2d=True)
    x = x.mean(axis=1)
    x = sosfilt(butter(2, HP.get(kind, 110), "highpass", fs=rate, output="sos"), x)
    if kind in ("loop", "bed"):
        x = loop_bake(x, rate)
    else:
        x = fade(trim(x, rate, kind == "sting"), rate)
    lufs = loudness(x, rate)
    target = TARGET.get(kind, TARGET["sfx"])
    gain = 10 ** ((target - lufs) / 20) if lufs is not None else 10 ** (-3 / 20) / max(1e-6, np.abs(x).max())
    x = x * gain
    peak = np.abs(x).max()
    if peak > 10 ** (-1.5 / 20):
        x *= 10 ** (-1.5 / 20) / peak
    return x, rate


def write_mp3(x, rate, dst, kbps):
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    data = enc.encode(pcm.tobytes()) + enc.flush()
    base, ext = os.path.splitext(dst)
    dst = f"{base}.{hashlib.sha1(data).hexdigest()[:8]}{ext}"
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, "wb").write(data)
    return os.path.basename(dst)


def main():
    for d in (OUT, os.path.join(OUT, "vo")):
        for f in os.listdir(d) if os.path.isdir(d) else []:
            if f.endswith(".mp3"):
                os.remove(os.path.join(d, f))
    manifest = {}
    for sid, (kind, names) in MAP.items():
        urls = []
        for i, name in enumerate(names):
            src = os.path.join(SRC, "sfx", name + ".mp3")
            if not os.path.exists(src):
                print("missing", name)
                continue
            x, rate = process(src, kind)
            fname = write_mp3(x, rate, os.path.join(OUT, f"{sid}-{i}.mp3"), 64 if kind == "bed" else 96)
            urls.append(f"/assets/audio/{fname}")
        if urls:
            manifest[sid] = urls
    vo_dir = os.path.join(SRC, "vo")
    voices = {}
    for f in sorted(os.listdir(vo_dir)):
        x, rate = process(os.path.join(vo_dir, f), "voice")
        if f.startswith("count-"):
            x = fade(x[: int(rate * 0.6)], rate, fout=0.1)
        voices[f[:-4]] = "/assets/audio/vo/" + write_mp3(x, rate, os.path.join(OUT, "vo", f), 96)
    for sid, name in COUNT_VO.items():
        manifest[sid] = [voices[name]]
    json.dump(manifest, open(MANIFEST, "w"), indent=1)
    json.dump(voices, open(VOICES, "w"), indent=1)
    size = sum(os.path.getsize(os.path.join(d, f)) for d in (OUT, os.path.join(OUT, "vo")) for f in os.listdir(d) if f.endswith(".mp3"))
    print(f"{sum(len(v) for v in manifest.values())} clips, {size / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
