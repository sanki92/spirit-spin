import json, os, sys, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio", "eleven")
BANK = os.path.join(ROOT, "apps", "client", "src", "game", "commentary.json")
LEDGER = os.path.join(ROOT, "docs", "art", "cost-ledger.csv")
API = "https://api.elevenlabs.io/v1"
KEY = os.environ.get("ELEVENLABS_API_KEY") or open(os.path.expanduser("~/.elevenlabs-key"), encoding="utf8").read().strip()
FLOOR = 1000
HARRY = "SOYHLrjzK2X1ezoPC6cr"

ONE = "one-shot, crisp attack, no music, no voice"
UI = "soft muted rounded bubble pop, warm, gentle, very short, modern mobile game button sound, no metal, no ringing, no clank"
CROWD = "indoor anime tournament arena crowd"

SFX = {
    "count-beat": ("single punchy taiko drum hit layered with a bright metallic tick, short tight stadium reverb, " + ONE, 1.0, 0.7),
    "count-go": ("huge bright rising synth stab with a metallic whoosh and an energy burst, triumphant, anime battle start, " + ONE, 1.5, 0.6),
    "rip-1": ("spinning top launcher ripcord pulled hard and fast, ratcheting plastic zip and gear whirr, then a metal top clicking down onto a steel dish, " + ONE, 1.5, 0.6),
    "rip-2": ("fast zip of a toy ripcord tearing through a launcher, sharp whirr, metal top released spinning onto steel, " + ONE, 1.5, 0.6),
    **{f"ui-tap-{i}": (UI + ", single light tap", 0.5, 0.7) for i in range(1, 4)},
    **{f"ui-confirm-{i}": (UI + ", two soft rising marimba blips, positive", 0.5, 0.7) for i in range(1, 4)},
    **{f"ui-back-{i}": (UI + ", soft low pop with a tiny downward swish, going back", 0.5, 0.7) for i in range(1, 4)},
    **{f"ui-error-{i}": (UI + ", soft low muffled double bump, not allowed", 0.5, 0.7) for i in range(1, 4)},
    **{f"ui-toggle-{i}": (UI + ", tiny soft plastic switch click", 0.5, 0.7) for i in range(1, 4)},
    **{f"ui-tab-{i}": (UI + ", very soft quick paper swish", 0.5, 0.7) for i in range(1, 4)},
    **{f"ui-reward-{i}": ("warm soft marimba arpeggio rising with gentle sparkle, reward collected, mobile game, no metal", 1.5, 0.6) for i in range(1, 3)},
    **{f"ui-unlock-{i}": ("warm soft marimba and pad flourish rising, magical, something new unlocked, mobile game, no metal", 2.0, 0.6) for i in range(1, 3)},
    **{f"clash-{i}": ("small metal spinning tops grazing each other, sharp metallic tick with a thin bright ring, " + ONE, 0.5, 0.5) for i in range(1, 6)},
    **{f"clashheavy-{i}": ("two heavy steel spinning tops colliding hard, sharp crack, anvil ring, short, no long reverb tail, impact, " + ONE, 1.0, 0.5) for i in range(1, 6)},
    **{f"wall-{i}": ("metal spinning top striking a steel stadium rail, hard short clank, " + ONE, 0.5, 0.5) for i in range(1, 4)},
    "edge": ("metal spinning top scraping along a steel rim, screeching metallic grind, tense, " + ONE, 1.0, 0.6),
    "hum": ("metal spinning top humming at steady high speed on a steel dish, smooth whirring drone, constant pitch, loopable", 4.0, 0.6, True),
    "crowd-calm": (CROWD + " murmuring and chattering before a match, calm, no music", 15.0, 0.3, True),
    "crowd-excited": (CROWD + " cheering steadily with anticipation, clapping, excited, no music", 15.0, 0.3, True),
    "crowd-roar": (CROWD + " roaring wildly, stomping and screaming, peak excitement, no music", 15.0, 0.3, True),
    "cheer-1": (CROWD + " bursting into a big short cheer", 2.5, 0.3),
    "cheer-2": (CROWD + " cheering loudly after a great hit, whistles", 2.5, 0.3),
    "ooh-1": (CROWD + " going oooh together in suspense", 2.0, 0.3),
    "ooh-2": (CROWD + " reacting with a long tense ooooh", 2.0, 0.3),
    "gasp-1": (CROWD + " gasping in shock all at once", 1.5, 0.3),
    "gasp-2": (CROWD + " sharp collective gasp of surprise", 1.5, 0.3),
    "aww-1": (CROWD + " groaning awww in disappointment", 2.0, 0.3),
    "aww-2": (CROWD + " sighing ohhh in sympathy", 2.0, 0.3),
    "roar-1": (CROWD + " erupting into a huge roar after a knockout", 3.0, 0.3),
    "roar-2": (CROWD + " exploding with screams and applause after a decisive finish", 3.0, 0.3),
    "applause": (CROWD + " applauding and cheering for the winner", 4.0, 0.3),
    "chant": (CROWD + " stomping and clapping together in a steady rhythm building anticipation", 3.0, 0.4),
    "finish-shatter": ("metal spinning top bursting apart, sharp crack, spring pop, small metal parts scattering and clinking, " + ONE, 1.5, 0.6),
    "finish-ringout": ("fast whoosh then a hard metal clank against a wall and a falling clatter, " + ONE, 1.5, 0.6),
    "finish-spin": ("small spinning top winding down, wobbling metal wub speeding up, final rattle and a settling clink, " + ONE, 2.0, 0.6),
    "finish-spirit": ("huge magical energy explosion, shimmering burst and glassy shatter, anime power finish, " + ONE, 2.0, 0.6),
    "victory": ("triumphant short brass and synth fanfare stinger, rising, major key, anime victory", 3.0, 0.5),
    "defeat": ("short falling pizzicato strings with soft brass, gentle, minor key, defeat stinger", 2.0, 0.5),
    "hesitate": ("spirit beast refusing, low unsure growl fading out with a soft magical fizzle, " + ONE, 1.5, 0.6),
}

BEASTS = {
    "voltfang": ("electric storm wolf", "Vicious electric wolf snarling and barking, crackling lightning burst, aggressive, menacing", "Lightning bolt strike, crackling electric arc burst into a wolf howl", "thunder crack with electric sizzle"),
    "aegiron": ("crystal stone titan", "Massive armored titan roaring, heavy stone crunch, ground shaking, menacing growl", "Massive stone impact, rocks cracking, glassy crystal shards ringing out, braam", "stone slam with crystal shards shattering"),
    "nagara": ("water moon serpent", "Giant serpent hissing menacingly, venomous rattle, sudden strike with a water splash, dangerous", "Tidal water surge whoosh crashing into a heavy splash, serpent hiss", "heavy water splash with a serpent hiss"),
    "agnyx": ("fire phoenix firebird", "Fierce phoenix screeching, roaring fire burst, aggressive, dangerous", "Fireball burst, roaring flame whoomph, crackling ember tail, bird screech", "fiery explosion whoomph with crackling embers"),
    "zephyra": ("wind storm griffin", "Fierce griffin screeching, violent wind blast, aggressive, dangerous", "Cyclone whoosh spinning up into a sharp wind gust burst, airy, no low end", "sharp wind blast with a whistling air cut"),
    "umbrax": ("shadow panther", "Deep menacing panther snarling growl, dark ominous shadow swell, aggressive, dangerous", "Deep reversed whoosh into a dark energy burst, ghostly whisper, dark tail", "dark energy slash with a ghostly whisper"),
}
for b, (stem, select, release, impact) in BEASTS.items():
    for i in (1, 2):
        SFX[f"{b}-select-{i}"] = (f"{select}, {ONE}", 1.5, 0.6)
    SFX[f"{b}-charge"] = (f"{stem} power charging up, rising energy riser building fast, magical, {ONE}", 1.5, 0.65)
    SFX[f"{b}-release"] = (f"{release}, anime special attack, {ONE}", 2.0, 0.65)
    SFX[f"{b}-impact"] = (f"{impact}, short impact sweetener, {ONE}", 1.0, 0.65)

VO_EXTRA = {
    "count-3": "[shouting] THREE!",
    "count-2": "[shouting] TWO!",
    "count-1": "[shouting] ONE!",
    "beast-voltfang": "[excited] VOLTFANG... Storm Wolf, UNLEASHED!",
    "beast-aegiron": "[excited] AEGIRON... the Crystal Fortress RISES!",
    "beast-nagara": "[excited] NAGARA... Moon Serpent, STRIKE!",
    "beast-agnyx": "[excited] AGNYX... Crimson Firebird, IGNITE!",
    "beast-zephyra": "[excited] ZEPHYRA... Storm Griffin, TAKE FLIGHT!",
    "beast-umbrax": "[excited] UMBRAX... Shadow Panther, POUNCE!",
}


def call(path, body=None):
    req = urllib.request.Request(API + path, None if body is None else json.dumps(body).encode(), {"xi-api-key": KEY, "Content-Type": "application/json"})
    for wait in (2, 4, 8, 16, 32):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                raise RuntimeError(f"{path} {e.code} {e.read().decode()[:300]}")
            time.sleep(wait)
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            time.sleep(wait)
    raise RuntimeError("gave up: " + path)


def used():
    s = json.loads(call("/user/subscription"))
    return s["character_count"], s["character_limit"]


def vo_lines():
    lines = {l["id"]: l["text"] for cue in json.load(open(BANK, encoding="utf-8")).values() for l in cue}
    tagged = {k: ("[excited] " + v) for k, v in lines.items()}
    return {**tagged, **VO_EXTRA}


def jobs(only):
    out = []
    for name, spec in SFX.items():
        text, sec, infl, *loop = spec
        out.append((name, f"sfx/{name}", "/sound-generation?output_format=mp3_44100_128", {"text": text, "duration_seconds": sec, "prompt_influence": infl, "loop": bool(loop and loop[0]), "model_id": "eleven_text_to_sound_v2"}))
    for name, text in vo_lines().items():
        out.append((name, f"vo/{name}", f"/text-to-speech/{HARRY}?output_format=mp3_44100_128", {"text": text, "model_id": "eleven_v3", "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "use_speaker_boost": True, "speed": 1.0}}))
    return [j for j in out if not only or j[0] in only or j[1] in only]


def main(args):
    redo = "--redo" in args
    only = {a for a in args if not a.startswith("--")}
    start, limit = used()
    spent = 0
    for name, rel, path, body in jobs(only):
        dst = os.path.join(OUT, rel + ".mp3")
        if os.path.exists(dst) and not redo:
            continue
        before, _ = used()
        if limit - before < FLOOR:
            raise SystemExit(f"credit floor reached at {before}/{limit}")
        data = call(path, body)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, "wb").write(data)
        print(f"{rel} {len(data)}B", flush=True)
        time.sleep(0.4)
    time.sleep(8)
    end, _ = used()
    spent = end - start
    if spent:
        with open(LEDGER, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')},sound-revamp,elevenlabs,-,-,{spent},0,0,0,credits\n")
    print(f"credits used {spent}, account {end}/{limit}")


if __name__ == "__main__":
    main(sys.argv[1:])
