"""Build the read-only personal world, copying only its runtime dependencies."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'app/public'
OUTPUT = ROOT / 'dist-public'


def build():
    world = json.loads((ROOT / 'worlds/personal/world.json').read_text())
    if world.get('version') != 3 or not 0 < len(world.get('rooms', [])) <= 64:
        raise ValueError('Expected a non-empty v3 world')
    addresses = [room['address'] for room in world['rooms']]
    if len(set(addresses)) != len(addresses):
        raise ValueError('Duplicate room addresses')
    files = set()

    def add_module(name):
        if name in files:
            return
        files.add(name)
        text = (PUBLIC / name).read_text()
        for dependency in re.findall(r"from\s+['\"]\./([^'\"]+)['\"]", text):
            add_module(dependency)
        for image in re.findall(r"['\"](/assets/[^'\"$]+\.(?:png|jpg|jpeg|webp))['\"]", text):
            files.add(image.lstrip('/'))

    def add_references(value):
        if isinstance(value, dict):
            for item in value.values():
                add_references(item)
        elif isinstance(value, list):
            for item in value:
                add_references(item)
        elif isinstance(value, str) and value.startswith(('/assets/', '/generated/')):
            if '..' in value or not re.fullmatch(r'/(assets|generated)/[A-Za-z0-9_./-]+', value):
                raise ValueError('Invalid asset path')
            files.add(value.lstrip('/'))

    add_module('published-viewer.js')
    add_references(world)
    props = json.loads(subprocess.check_output([
        'node', '--input-type=module', '-e',
        "import {STATION_PROPS} from './app/public/room-layout.js'; console.log(JSON.stringify(STATION_PROPS))"
    ], cwd=ROOT, text=True))
    for name in [*props, 'planet', 'botanical', 'signal', 'cargo', 'wall-fan/atlas']:
        files.add(f'assets/station/{name}.png')
    files.update(['style.css', 'viewer.css'])
    # Fail before replacing a valid build if any dependency is missing.
    sources = {}
    for name in sorted(files):
        source = (ROOT / '.local' / name) if name.startswith('generated/') else (PUBLIC / name)
        if not source.is_file() or source.stat().st_size > 25 * 1024 * 1024:
            raise ValueError(f'Missing or oversized dependency: {name}')
        sources[name] = source
    html = (PUBLIC / 'index.html').read_text()
    html = html.replace('src="/app.js"', 'src="/published-viewer.js"')
    html = re.sub(r'<button id="open-studio".*?</button>', '', html, flags=re.S)
    start = html.index('<aside id="studio-panel"')
    end = html.index('<aside id="reference-panel"')
    html = html[:start] + html[end:]
    html = html.replace('</head>', '<meta name="description" content="好きなものが動き続ける、わたしのカオス。ドラッグとズームで宇宙ステーションを探索。">\n</head>')
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    for name, source in sources.items():
        target = OUTPUT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    (OUTPUT / 'index.html').write_text(html)
    shutil.copyfile(ROOT / 'worlds/personal/world.json', OUTPUT / 'world.json')
    (OUTPUT / '404.html').write_text('<!doctype html><html lang="ja"><meta charset="utf-8"><title>見つかりません</title><p>ページが見つかりません。<a href="/">カオスに戻る</a></p></html>')
    (OUTPUT / '_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n/world.json\n  Cache-Control: no-cache\n')
    manifest = {name: hashlib.sha256((OUTPUT / name).read_bytes()).hexdigest() for name in sorted(files)}
    manifest['world.json'] = hashlib.sha256((OUTPUT / 'world.json').read_bytes()).hexdigest()
    (OUTPUT / 'asset-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'rooms': len(addresses), 'actors': sum(len(r['actors']) for r in world['rooms']),
                      'files': len(list(OUTPUT.rglob('*'))), 'bytes': sum(p.stat().st_size for p in OUTPUT.rglob('*') if p.is_file())}))


if __name__ == '__main__':
    build()
