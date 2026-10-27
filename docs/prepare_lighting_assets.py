"""Copy generated lighting states into optimized, local deployment assets.

No image synthesis or relighting occurs here: only loss-bounded WebP export.
Original generated PNGs remain untouched.
"""
from pathlib import Path
import json
import argparse
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent
manifest=json.loads((ROOT/'docs'/'lighting-assets.json').read_text(encoding='utf-8'))
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--destination',choices=['luna','mars','europa','saturn','titan'])
parser.add_argument('--mode',choices=['dawn','day','sunset','night'])
args=parser.parse_args()
for item in manifest:
    if args.destination and item['destination']!=args.destination:
        continue
    if args.mode and item['mode']!=args.mode:
        continue
    image=Image.open(item['source']).convert('RGB')
    for width,suffix in [(1536,''),(768,'-small')]:
        ratio=min(1,width/image.width)
        result=image.resize((round(image.width*ratio),round(image.height*ratio)),Image.Resampling.LANCZOS)
        target=ROOT/'assets'/('lighting-'+item['destination']+'-'+item['mode']+suffix+'.webp')
        result.save(target,quality=88 if not suffix else 84,method=6)
        print(target.name,target.stat().st_size)
