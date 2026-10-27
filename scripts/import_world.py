"""Validate an exported v3 world and its local images before replacing the public snapshot."""
import argparse
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent


def validate(world):
    rooms = world.get('rooms')
    if world.get('version') != 3 or not isinstance(rooms, list) or not 1 <= len(rooms) <= 64:
        raise ValueError('Expected a non-empty v3 world')
    addresses = [room.get('address', '') for room in rooms]
    if len(set(addresses)) != len(addresses) or not all(re.fullmatch(r'[A-H]0[1-8]', address) for address in addresses):
        raise ValueError('Invalid or duplicate room addresses')
    def walk(value):
        if isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, str) and value.startswith(('/assets/', '/generated/')):
            path = (ROOT / 'app/public' / value.lstrip('/')).resolve()
            if not path.is_relative_to((ROOT / 'app/public').resolve()) or not path.is_file():
                raise ValueError(f'Missing or unsafe image: {value}')
    walk(rooms)
    return {key: world[key] for key in ['version', 'floor', 'style', 'rooms', 'selectedAddress', 'stage']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('world', type=Path)
    args = parser.parse_args()
    result = validate(json.loads(args.world.read_text(encoding='utf-8')))
    destination = ROOT / 'worlds/personal/world.json'
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Saved {len(result['rooms'])} rooms; run npm run build:public")
