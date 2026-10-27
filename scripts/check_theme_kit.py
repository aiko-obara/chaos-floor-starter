"""Verify the portable theme kit's processing tools, dependencies and style inputs."""
import hashlib
from importlib.metadata import version
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def assert_hash(path, expected):
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f'Changed kit input: {path.relative_to(ROOT)}')


def check():
    tools = ROOT / 'tools/sprite-processor'
    source = json.loads((tools / 'source.json').read_text())
    assert_hash(tools / 'generate2dsprite.py', source['sha256'])
    assert_hash(tools / 'make_layout_guide.py', source['layoutGuideSha256'])
    for package, expected in source['dependencies'].items():
        if version(package) != expected:
            raise ValueError(f'Install requirements-sprites.txt: {package} {expected} required')
    baseline = json.loads((ROOT / 'recipes/style-baseline.json').read_text())
    for reference in baseline['references']:
        path = (ROOT / reference['path']).resolve()
        if not path.is_relative_to(ROOT):
            raise ValueError('Style input outside the project')
        assert_hash(path, reference['sha256'])
    for path in (ROOT / '.agents/skills/chaos-theme').rglob('*'):
        if path.is_file() and '/Users/' in path.read_text():
            raise ValueError('The theme skill must not depend on a personal Mac path')
    print(json.dumps({'tools': 2, 'styleInputs': len(baseline['references']),
                      'dependencies': source['dependencies'], 'status': 'passed'}))


if __name__ == '__main__':
    check()
