import json, os, shutil, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK = os.path.join(ROOT, "apps", "client", "src", "game", "commentary.json")
SRC = os.path.join(ROOT, "assets", "audio", "vo")
OUT = os.path.join(ROOT, "apps", "client", "public", "assets", "audio", "vo")
LEDGER = os.path.join(ROOT, "docs", "art", "cost-ledger.csv")
KEY = os.environ["OPENAI_API_KEY"]
MODEL = "gpt-4o-mini-tts"
VOICE = os.environ.get("VOICE", "ash")
STYLE = ("You are the hype announcer of an anime spinning-top tournament. Shout with huge energy and joy, fast and punchy, "
         "like a stadium MC calling a big moment. Clear diction, short and exciting.")


def speak(text, dst):
    body = json.dumps({"model": MODEL, "voice": VOICE, "input": text, "instructions": STYLE, "response_format": "mp3"}).encode()
    req = urllib.request.Request("https://api.openai.com/v1/audio/speech", data=body, headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    with open(dst, "wb") as f:
        f.write(data)
    return len(data)


def main(only=None):
    bank = json.load(open(BANK, encoding="utf-8"))
    os.makedirs(SRC, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    chars = 0
    for lines in bank.values():
        for line in lines:
            if only and line["id"] not in only:
                continue
            dst = os.path.join(SRC, line["id"] + ".mp3")
            if not os.path.exists(dst):
                size = speak(line["text"], dst)
                chars += len(line["text"])
                print("OK", line["id"], size, "bytes")
                time.sleep(0.3)
            shutil.copy(dst, os.path.join(OUT, line["id"] + ".mp3"))
    if chars:
        usd = chars * 0.000015
        with open(LEDGER, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')},voice-lines,{MODEL},-,-,{chars},0,0,{usd:.4f},tts-estimate\n")
        print(f"chars {chars} est ${usd:.4f}")


if __name__ == "__main__":
    main(set(sys.argv[1:]) or None)
