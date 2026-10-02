import json, re, sys
best = json.load(open('scripts/tuning.best.json'))['params']
p = 'src/battle/tuning.ts'; s = open(p).read()
for k, v in best.items():
    parts = k.split('.')
    if parts[0] == 'edge':
        a, b = parts[1], parts[2]
        s = re.sub(rf"(\n  {a}: \{{[^}}]*?\b{b}: )[0-9.]+", lambda m: m.group(1) + str(v), s)
    elif len(parts) == 2:
        kind, f = parts
        s = re.sub(rf"({kind}: \{{[^}}]*?\b{f}: )[0-9.]+", lambda m: m.group(1) + str(v), s)
    else:
        s = re.sub(rf"(\n  {k}: )[^,\n]+(,)", lambda m: m.group(1) + str(v) + m.group(2), s)
open(p, 'w').write(s)
