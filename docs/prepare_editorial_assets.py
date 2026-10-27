"""Optimize generated editorial artwork without changing its art direction."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / 'docs/editorial-assets.json').read_text(encoding='utf-8'))
for item in manifest['assets']:
    source = Path(item['source'])
    if not source.exists():
        print(f"Original unavailable locally: {item['name']}; preserving deployed derivative")
        continue
    with Image.open(source) as original:
        image = original.convert('RGB')
        limit = 960 if item['name'].startswith('crew-') else 1600
        image.thumbnail((limit, limit * 2), Image.Resampling.LANCZOS)
        destination = ROOT / 'assets' / f"{item['name']}.webp"
        image.save(destination, 'WEBP', quality=88, method=6)
        print(f'{destination.name}: {image.size}, {destination.stat().st_size // 1024} KiB')
        image.thumbnail((640, 1280), Image.Resampling.LANCZOS)
        image.save(ROOT / 'assets' / f"{item['name']}-small.webp", 'WEBP', quality=84, method=6)
