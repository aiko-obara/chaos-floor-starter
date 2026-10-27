"""Process generated sprites from a saved recipe and record all finishing passes."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def checked_file(name, expected=None):
    path = (ROOT / name).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise ValueError(f'Missing or unsafe source: {name}')
    if expected and hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f'Changed source: {name}')
    return path


def replay(recipe_path, output):
    recipe = json.loads(recipe_path.read_text())
    if recipe.get('schemaVersion') != 1:
        raise ValueError('Unsupported recipe')
    processor = checked_file(recipe['processor'], recipe.get('processorSha256'))
    raw = checked_file(recipe['input'], recipe.get('inputSha256'))
    checked_file(recipe['prompt'])
    output = output.resolve()
    # Replays must never overwrite accepted production assets or code.
    if not any(output.is_relative_to(ROOT / directory) for directory in ['.local/reproduction', '.local/theme-work']):
        raise ValueError('Use an output directory under .local/theme-work or .local/reproduction')
    args = [sys.executable, str(processor), 'process', '--input', recipe['input'], '--target', recipe['target'],
            '--mode', recipe['mode'], '--rows', str(recipe['rows']), '--cols', str(recipe['cols']),
            '--cell-size', str(recipe['cellSize']), '--fit-scale', str(recipe['fitScale']),
            '--align', 'bottom', '--component-mode', recipe['componentMode'], '--reject-edge-touch',
            '--prompt-file', recipe['prompt'],
            '--output-dir', str(output)]
    if recipe['sharedScale']:
        args.append('--shared-scale')
    subprocess.run(args, cwd=ROOT, check=True, capture_output=True, text=True)
    spec = importlib.util.spec_from_file_location('frozen_sprite_processor', processor)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    frames = []
    bottoms = []
    for index in range(1, recipe['rows'] * recipe['cols'] + 1):
        image = Image.open(output / f"{recipe['mode']}-{index}.png").convert('RGBA')
        for step in recipe.get('postScaleBackgroundPasses', []):
            image = module.remove_bg_magenta(image, step['threshold'], step['edgeThreshold'])
        if 'postScaleChromaSpillMargin' in recipe:
            margin = recipe['postScaleChromaSpillMargin']
            if not isinstance(margin, int) or not 1 <= margin <= 255:
                raise ValueError('Chroma spill margin must be 1..255')
            image.putdata([(0, 0, 0, 0) if a and min(r, b) - g > margin else (r, g, b, a)
                           for r, g, b, a in image.get_flattened_data()])
        box = image.getbbox()
        if not box or box[0] <= 0 or box[1] <= 0 or box[2] >= image.width or box[3] >= image.height:
            raise ValueError(f'Empty or edge-touching final frame: {index}')
        bottoms.append(box[3])
        image.save(output / f'final-{index}.png', optimize=True)
        frames.append(image)
    if recipe.get('anchorPolicy', 'grounded') == 'grounded' and len(set(bottoms)) != 1:
        raise ValueError('Grounded frames do not share a bottom anchor')
    target = output / 'atlas.png'
    module.compose_sheet(frames, recipe['rows'], recipe['cols'], recipe['cellSize']).save(target, optimize=True)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    if recipe.get('expectedAtlas'):
        checked_file(recipe['expectedAtlas'], recipe['expectedSha256'])
        actual = hashlib.sha256(module.compose_sheet(frames, recipe['rows'], recipe['cols'], recipe['cellSize']).tobytes()).hexdigest() if recipe.get('expectedPixelSha256') else digest
        expected = recipe.get('expectedPixelSha256', recipe['expectedSha256'])
        if actual != expected:
            raise ValueError('Replayed atlas differs from the accepted result')
    module.save_transparent_gif(frames, output / 'final-animation.gif', recipe.get('previewDurationMs', 200))
    resolved = {**recipe, 'processorSha256': hashlib.sha256(processor.read_bytes()).hexdigest(),
                'inputSha256': hashlib.sha256(raw.read_bytes()).hexdigest(), 'outputSha256': digest}
    (output / 'recipe-resolved.json').write_text(json.dumps(resolved, ensure_ascii=False, indent=2) + '\n')
    qc = {'recipe': recipe['id'], 'frames': len(frames), 'edgeTouchFrames': [], 'emptyFrames': [],
          'bottoms': bottoms, 'footAnchor': bottoms[0] / recipe['cellSize'], 'sha256': digest,
          'acceptedAtlasMatched': bool(recipe.get('expectedAtlas')), 'visualReview': 'not performed by this script'}
    (output / 'qc.json').write_text(json.dumps(qc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(qc, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('recipe', nargs='?', default='recipes/gintoki-reaction.json')
    parser.add_argument('--output', default=str(ROOT / '.local/reproduction/recipe-replay'))
    options = parser.parse_args()
    replay(checked_file(options.recipe), Path(options.output))
