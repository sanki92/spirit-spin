"""Batch image gen via OpenAI. Usage: python gen_images.py jobs.json
jobs.json: [{"out": "path.png", "prompt": "...", "size": "1536x1024", "refs": ["a.png"],
             "model": "gpt-image-2", "background": "transparent", "quality": "high"}]
Key from OPENAI_API_KEY env. Jobs with refs use /images/edits (reference-conditioned).
Existing outputs are skipped, so a failed batch can simply be re-run.
Every generation's real token usage x price is appended to docs/art/cost-ledger.csv."""
import base64, datetime, json, os, sys, threading, time, uuid, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

KEY = os.environ["OPENAI_API_KEY"]
DEFAULT_MODEL = os.environ.get("IMG_MODEL", "gpt-image-2")
LEDGER = "F:/tmp/tp-proj-game/docs/art/cost-ledger.csv"
# USD per 1M tokens: (text in, image in, image out). Source: developers.openai.com/api/docs/pricing, checked 2026-10-02
PRICES = {"gpt-image-2": (5, 8, 30), "gpt-image-2.5-sunburst": (5, 8, 30), "gpt-image-2.5-flare": (5, 8, 30),
          "gpt-image-1.5": (5, 8, 32), "gpt-image-1": (5, 10, 40), "gpt-image-1-mini": (2, 2.5, 8)}
_lock = threading.Lock()


def log_cost(job, model, usage):
    d = usage.get("input_tokens_details", {})
    t_in, i_in, out = d.get("text_tokens", 0), d.get("image_tokens", 0), usage.get("output_tokens", 0)
    p = PRICES[model]
    cost = (t_in * p[0] + i_in * p[1] + out * p[2]) / 1e6
    with _lock:
        new = not os.path.exists(LEDGER)
        with open(LEDGER, "a", encoding="utf-8") as f:
            if new:
                f.write("timestamp,file,model,size,quality,text_in_tokens,image_in_tokens,image_out_tokens,usd,source\n")
            f.write(f"{datetime.datetime.now().isoformat(timespec='seconds')},{os.path.basename(job['out'])},{model},"
                    f"{job.get('size', '1536x1024')},{job.get('quality', 'high')},{t_in},{i_in},{out},{cost:.4f},api-usage\n")
    return cost


def post_json(url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {
        "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=600).read()


def post_multipart(url, fields, files):
    b = uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for k, path in files:
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{os.path.basename(path)}"\r\n'
                     f'Content-Type: image/png\r\n\r\n'.encode() + open(path, "rb").read() + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    req = urllib.request.Request(url, b"".join(parts), {
        "Authorization": f"Bearer {KEY}", "Content-Type": f"multipart/form-data; boundary={b}"})
    return urllib.request.urlopen(req, timeout=600).read()


def run(job):
    if os.path.exists(job["out"]):
        return f"SKIP {job['out']}"
    model = job.get("model", DEFAULT_MODEL)
    fields = {"model": model, "prompt": job["prompt"], "size": job.get("size", "1536x1024"),
              "quality": job.get("quality", "high"), "n": 1}
    if job.get("background"):  # "transparent" works on gpt-image-1.5, not gpt-image-2
        fields["background"] = job["background"]
    if job.get("input_fidelity"):  # "high" = preserve reference features (character design locks)
        fields["input_fidelity"] = job["input_fidelity"]
    for attempt in range(3):
        try:
            if job.get("refs"):
                raw = post_multipart("https://api.openai.com/v1/images/edits",
                                     {k: str(v) for k, v in fields.items()},
                                     [("image[]", r) for r in job["refs"]])
            else:
                raw = post_json("https://api.openai.com/v1/images/generations", fields)
            resp = json.loads(raw)
            os.makedirs(os.path.dirname(job["out"]), exist_ok=True)
            open(job["out"], "wb").write(base64.b64decode(resp["data"][0]["b64_json"]))
            return f"OK   ${log_cost(job, model, resp.get('usage', {})):.3f} {job['out']}"
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(20 * (attempt + 1))
                continue
            return f"FAIL {job['out']}: {e.code} {e.read().decode()[:300]}"
        except Exception as e:
            if attempt < 2:
                continue
            return f"FAIL {job['out']}: {e!r}"


if __name__ == "__main__":
    jobs = json.load(open(sys.argv[1], encoding="utf-8"))
    with ThreadPoolExecutor(int(os.environ.get("CONCURRENCY", "4"))) as ex:
        for line in ex.map(run, jobs):
            print(line, flush=True)
