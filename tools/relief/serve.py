import http.server, json, os, socketserver, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')


def bundle():
    os.makedirs(OUT, exist_ok=True)
    names = sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, 'apps', 'client', 'public', 'assets', 'relief')) if f.endswith('.json'))
    json.dump(names, open(os.path.join(OUT, 'names.json'), 'w'))
    esbuild = os.path.join(ROOT, 'node_modules', '.bin', 'esbuild.cmd' if os.name == 'nt' else 'esbuild')
    subprocess.run([esbuild, os.path.join(HERE, 'review.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + os.path.join(OUT, 'review.js')], check=True, cwd=ROOT)


if __name__ == '__main__':
    bundle()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    os.chdir(ROOT)
    handler = http.server.SimpleHTTPRequestHandler
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', port), handler) as s:
        print(f'relief review: http://127.0.0.1:{port}/tools/relief/review.html', flush=True)
        s.serve_forever()
