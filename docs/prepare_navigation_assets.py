"""Extract NASA VTAD base-color images; deterministic resize/export only."""
from pathlib import Path
from PIL import Image
from prepare_planets import saturn_cloud_atlas

ROOT=Path(__file__).resolve().parent.parent
for name,index in [('earth',1),('jupiter',0)]:
    # NASA's source uses a cube atlas. Reproject its actual mesh UVs first.
    image=saturn_cloud_atlas(name,index,2048)
    print(name,'source',image.size)
    for width,suffix in [(2048,''),(1024,'-small')]:
        result=image.resize((width,width//2),Image.Resampling.LANCZOS)
        target=ROOT/'assets'/f'navigation-{name}{suffix}.webp'
        result.save(target,quality=88,method=6)
        print(target.name,target.stat().st_size)
