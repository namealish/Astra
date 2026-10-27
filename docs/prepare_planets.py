"""Extract locally cached NASA textures and prepare optimized WebGL materials.

Dependencies: Pillow, NumPy, SciPy. Source provenance: assets/planet-credits.txt.
Run from any directory with: python docs/prepare_planets.py
"""
from pathlib import Path
from io import BytesIO
import json
import struct
import numpy as np
from PIL import Image, ImageEnhance
from scipy.ndimage import gaussian_filter, gaussian_filter1d, map_coordinates
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs' / 'source-maps'
OUT = ROOT / 'assets'


def glb_contents(name):
    raw = (SOURCE / f'{name}.glb').read_bytes()
    json_length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + json_length])
    return doc, raw[28 + json_length:]


def extract(name):
    doc, binary = glb_contents(name)
    result = []
    for index, item in enumerate(doc['images']):
        view = doc['bufferViews'][item['bufferView']]
        start = view.get('byteOffset', 0)
        image = Image.open(BytesIO(binary[start:start + view['byteLength']]))
        image.load()
        image.save(SOURCE / f'{name}-{index}.png')
        print(name, index, item.get('name'), image.size, image.mode)
        result.append(image)
    return result


def saturn_cloud_atlas(source_name='saturn', image_index=0, width=4096):
    """Reproject NASA's six-face atlas using its own source mesh/UV mapping.

    Saturn's source mesh is oblate, so normalize each position axis before
    finding spherical directions. Interpolating the actual mesh coordinates
    avoids guessing an atlas orientation or assuming equidistant cube faces.
    """
    doc, binary = glb_contents(source_name)

    def accessor(index):
        spec = doc['accessors'][index]
        view = doc['bufferViews'][spec['bufferView']]
        count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[spec['type']]
        dtype = {5123: '<u2', 5125: '<u4', 5126: '<f4'}[spec['componentType']]
        offset = view.get('byteOffset', 0) + spec.get('byteOffset', 0)
        item_bytes = np.dtype(dtype).itemsize
        return np.ndarray((spec['count'], count), dtype=dtype, buffer=binary,
                          offset=offset, strides=(view.get('byteStride', count * item_bytes), item_bytes)).copy()

    primitive = doc['meshes'][0]['primitives'][0]
    positions = accessor(primitive['attributes']['POSITION'])
    positions /= np.max(np.abs(positions), axis=0)
    uv = accessor(primitive['attributes']['TEXCOORD_0'])
    indices = accessor(primitive['indices']).reshape(-1, 3)
    tiles = np.floor(uv[indices].mean(axis=1) * [4, 3])
    faces = {}
    for tile in np.unique(tiles, axis=0):
        ids = np.unique(indices[np.all(tiles == tile, axis=1)])
        patch = positions[ids]
        center = patch.mean(axis=0)
        axis = int(np.argmax(np.abs(center)))
        sign = int(center[axis] > 0)
        other = [i for i in range(3) if i != axis]
        xy = patch[:, other] / np.abs(patch[:, axis:axis + 1])
        faces[axis * 2 + sign] = (LinearNDInterpolator(xy, uv[ids]), other, uv[ids].min(axis=0), uv[ids].max(axis=0), NearestNDInterpolator(xy, uv[ids]))
    atlas = np.asarray(extract(source_name)[image_index].convert('RGB'), dtype=np.float32) / 255
    height = width // 2
    result = np.empty((height, width, 3), dtype=np.float32)
    longitude = (np.arange(width, dtype=np.float32) + .5) / width * 2 * np.pi
    for row in range(0, height, 128):
        latitude = (np.arange(row, min(row + 128, height), dtype=np.float32) + .5) / height * np.pi
        directions = np.stack((np.sin(latitude[:, None]) * np.cos(longitude),
                               np.broadcast_to(np.cos(latitude[:, None]), (len(latitude), width)),
                               np.sin(latitude[:, None]) * np.sin(longitude)), axis=-1)
        major = np.argmax(np.abs(directions), axis=-1)
        component = np.take_along_axis(directions, major[:, :, None], axis=2)[:, :, 0]
        which = major * 2 + (component > 0)
        atlas_uv = np.empty((len(latitude), width, 2), dtype=np.float32)
        for face, (interpolator, other, lower, upper, nearest) in faces.items():
            mask = which == face
            selected = directions[mask]
            if not len(selected):
                continue
            xy = selected[:, other] / np.abs(selected[:, face // 2:face // 2 + 1])
            coords = interpolator(np.clip(xy, -.99998, .99998))
            missing = ~np.isfinite(coords).all(axis=1)
            if np.any(missing):
                # Sparse triangulation can leave a thin strip outside the
                # convex hull at cube seams. Use that face's nearest source UV.
                if missing.mean() > .08:
                    raise ValueError('Source UV coverage insufficient for faithful reprojection')
                coords[missing] = nearest(xy[missing])
            # Keep the filter footprint inside each atlas tile at cube edges.
            atlas_uv[mask] = np.clip(coords, lower + [1 / atlas.shape[1], 1 / atlas.shape[0]],
                                    upper - [1 / atlas.shape[1], 1 / atlas.shape[0]])
        coordinates = [atlas_uv[:, :, 1] * (atlas.shape[0] - 1), atlas_uv[:, :, 0] * (atlas.shape[1] - 1)]
        for channel in range(3):
            result[row:row + len(latitude), :, channel] = map_coordinates(atlas[:, :, channel], coordinates, order=1, mode='nearest')
    return rgb(result)


def rgb(array):
    return Image.fromarray(np.uint8(np.clip(array, 0, 1) * 255))


def enhance_source(image, fine, terrain, regional, grade=(1., 1., 1.)):
    """Reveal existing imagery at three scales without inventing landforms.

    The bounded log-luminance gain preserves mineral colors and avoids white
    sharpening halos. Longitude wraps while latitude clamps at the poles.
    This is an artistic visibility grade, not new scientific image data.
    """
    image = image.resize((4096, 2048), Image.Resampling.LANCZOS)
    arr = np.asarray(image, dtype=np.float32) / 255
    arr *= np.asarray(grade, dtype=np.float32)
    luminance = arr @ np.array([.2126, .7152, .0722], dtype=np.float32)
    log_luma = np.log(np.maximum(.03, luminance))
    soft = gaussian_filter(log_luma, 1., mode=('nearest', 'wrap'))
    medium = gaussian_filter(log_luma, 5., mode=('nearest', 'wrap'))
    broad = gaussian_filter(log_luma, 26., mode=('nearest', 'wrap'))
    gain = fine * (log_luma - soft) + terrain * (soft - medium) + regional * (medium - broad)
    # A soft shoulder protects bright ice/polar regions from clipped plateaus.
    gain = .24 * np.tanh(gain / .24)
    arr *= np.exp(gain)[:, :, None]
    return rgb(arr)


def titan_haze(image):
    """Amplify only resolved large cloud/haze features in the NASA map.

    The visible-light map deliberately conceals the surface. Broad source
    latitude differences and cloud gradients are enhanced; no terrain/noise
    is manufactured or used as surface bump.
    """
    arr = np.asarray(image.resize((2048, 1024), Image.Resampling.LANCZOS), dtype=np.float32) / 255
    lum = arr @ np.array([.2126, .7152, .0722], dtype=np.float32)
    broad = gaussian_filter(lum, (6., 9.), mode=('nearest', 'wrap'))
    zonal = np.mean(broad, axis=1, keepdims=True)
    latitude = gaussian_filter1d(zonal, 16., axis=0, mode='nearest')
    # The mean is conserved: only actual hemisphere/cloud variation expands.
    variation = (latitude - np.mean(latitude)) * 1.85 + (broad - latitude) * 2.4
    gain = np.clip(variation / np.maximum(lum, .2), -.16, .16)
    arr *= (1. + gain)[:, :, None]
    # A small, deterministic, seamless aerosol field adds soft optical-depth
    # variety absent from the coarse source. This is an artistic atmosphere
    # enhancement, not observed surface/cloud data or image-derived relief.
    rng = np.random.default_rng(7961)
    seed = rng.standard_normal((64, 128)).astype(np.float32)
    cloud = gaussian_filter(seed, (3.5, 6.), mode=('nearest', 'wrap'))
    cloud += gaussian_filter(seed, (1.2, 3.), mode=('nearest', 'wrap')) * .35
    cloud /= np.std(cloud)
    yy, xx = np.mgrid[0:1024, 0:2048].astype(np.float32)
    v = (yy + .5) / 1024
    shift = .045 * np.sin(v * np.pi * 3.) + .012 * np.sin(v * np.pi * 9.)
    sampling = [v * 63., np.mod(((xx + .5) / 2048 + shift) * 128., 128.)]
    clouds = np.tanh(map_coordinates(cloud, sampling, order=3, mode='grid-wrap') * .65)
    # Longitude dependence vanishes at poles; broad polar haze stays smooth.
    clouds *= np.sin(v * np.pi) ** .5
    polar_hood = np.exp(-((v - .07) / .12) ** 2) * .055
    arr *= (1. + clouds * .14 - polar_hood)[:, :, None]
    # Muted ochre highlights retain the orange-brown aerosol identity.
    arr *= np.array([1.015, .965, 1.14], dtype=np.float32)
    return rgb(arr)


def color_tiers(name, image):
    for suffix, width, quality in [('-mobile', 1024, 90), ('-medium', 2048, 94), ('', 4096, 96)]:
        # Titan's visible-light cloud map has no useful high-frequency detail.
        width = min(width, 2048) if name == 'titan' else width
        scaled = image.resize((width, width // 2), Image.Resampling.LANCZOS)
        scaled.save(OUT / f'planet-{name}{suffix}.webp', quality=quality, method=6)


def normal_tiers(name, image, roughness, elevation=None):
    for suffix, width in [('-mobile', 1024), ('', 2048)]:
        height = width // 2
        if elevation is not None:
            # LOLA uint16: half metres above 1,727,400 m. Actual lunar topography,
            # not albedo interpreted as height. Modest relief exaggeration (2x).
            field = np.asarray(elevation.resize((width, height), Image.Resampling.BILINEAR), dtype=np.float32) * .5
            latitude = np.sin((np.arange(height) + .5) / height * np.pi)[:, None]
            dx = (np.roll(field, -1, 1) - np.roll(field, 1, 1)) / (2 * 1737400 * 2 * np.pi / width * np.maximum(.12, latitude)) * 2.
            dy = -np.gradient(field, axis=0) / (1737400 * np.pi / height) * 2.
            variation = np.clip(np.sqrt(dx * dx + dy * dy), 0, 1)
            rough_map = roughness - variation * .10
        else:
            # Fine image-derived microdetail only, NOT a measured elevation map.
            # Remove large-scale albedo/ice staining first: no raised dark continents
            # or deep artificial trenches at Europa's mineral color boundaries.
            arr = np.asarray(image.resize((width, height), Image.Resampling.LANCZOS), dtype=np.float32) / 255
            luminance = arr @ np.array([.2126, .7152, .0722], dtype=np.float32)
            broad = gaussian_filter(luminance, sigma=6, mode=('nearest', 'wrap'))
            # Local normalization recovers small craters/ridges on dark terrain
            # without converting continents or broad mineral stains to relief.
            detail = (luminance - broad) / np.maximum(.32, broad)
            strength = 1.25 if name == 'mars' else 1.6
            dx = (np.roll(detail, -1, 1) - np.roll(detail, 1, 1)) * .5 * strength
            dy = -np.gradient(detail, axis=0) * strength
            slope = np.sqrt(dx * dx + dy * dy)
            limiter = np.minimum(1., .45 / np.maximum(.001, slope))
            dx *= limiter
            dy *= limiter
            variation = np.clip(np.abs(detail) * 4., 0, 1)
            if name == 'europa':
                mineral = np.clip((arr[:, :, 0] - arr[:, :, 2]) * 4., 0, 1)
                # Frosted mineral fractures are rougher than the cleaner ice,
                # preventing polished specular lines drawn over the surface.
                rough_map = roughness + variation * .16 + mineral * .12
            else:
                rough_map = roughness + variation * .08
        normals = np.stack((-dx, -dy, np.ones_like(dx)), axis=-1)
        normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
        packed = np.empty((height, width, 4), dtype=np.uint8)
        packed[:, :, :3] = np.uint8(np.clip(normals * .5 + .5, 0, 1) * 255)
        packed[:, :, 3] = np.uint8(np.clip(rough_map, .2, 1) * 255)
        # Lossless data texture: RGB tangent normal + A perceptual roughness.
        Image.fromarray(packed).save(OUT / f'planet-{name}-normal{suffix}.webp', lossless=True, method=6)
        print(f'{name} {width}px normal |xy| p95/p99:', np.percentile(np.abs(normals[:, :, :2]), [95, 99]))


def prepare_rings():
    # Preserve all 4096 native radial samples: this strip is inexpensive in
    # memory, unlike increasing the resolution of a complete spherical map.
    strip = extract('saturn')[1].convert('RGBA')
    ring = np.asarray(strip, dtype=np.float32) / 255
    width = ring.shape[1]
    luminance = ring[:, :, :3] @ np.array([.2126, .7152, .0722], dtype=np.float32)
    radial_detail = luminance - gaussian_filter1d(luminance, 16., axis=1, mode='nearest')
    ring[:, :, :3] *= np.exp(np.clip(radial_detail * 5., -.14, .14))[:, :, None]
    alpha = ring[:, :, 3]
    alpha += (alpha - gaussian_filter1d(alpha, 12., axis=1, mode='nearest')) * .65
    # Keep the B ring optically dense but not saturated. The shader converts
    # normal-incidence alpha to viewing-angle optical depth and casts shadows.
    alpha = np.clip(alpha, 0., 1.) * .83
    radius = np.linspace(1.24, 2.30, width)
    division = np.minimum(np.clip((radius - 1.947) / .006, 0, 1), np.clip((2.030 - radius) / .006, 0, 1))
    edge = np.minimum(np.clip((radius - 1.24) / .012, 0, 1), np.clip((2.30 - radius) / .010, 0, 1))
    ring[:, :, 3] = alpha * (1 - division * .94) * edge
    Image.fromarray(np.uint8(np.clip(ring, 0, 1) * 255)).save(OUT / 'saturn-rings.webp', lossless=True, method=6)


def main():
    OUT.mkdir(exist_ok=True)
    luna = Image.open(SOURCE / 'luna-color.tif').convert('RGB')
    luna = enhance_source(ImageEnhance.Contrast(luna).enhance(1.08), .65, .38, .12, (.985, 1., 1.018))
    mars = Image.open(SOURCE / 'mars.jpg').convert('RGB')
    mars = enhance_source(ImageEnhance.Color(mars).enhance(.83), .60, .50, .22)
    europa = extract('europa')[0].convert('RGB')
    # Neutralize the yellow cast in the visualization map while preserving
    # rust-colored fracture deposits. This is an artistic, not scientific grade.
    europa = enhance_source(europa, .55, .48, .17, (.97, .985, 1.09))
    saturn = saturn_cloud_atlas()
    saturn = enhance_source(ImageEnhance.Contrast(saturn).enhance(1.22), .65, .95, .65)
    titan = titan_haze(extract('titan')[0].convert('RGB'))
    for name, image in [('luna', luna), ('mars', mars), ('europa', europa), ('saturn', saturn), ('titan', titan)]:
        color_tiers(name, image)
        print('Prepared color tiers:', name)
    normal_tiers('luna', luna, .95, Image.open(SOURCE / 'luna-height.tif').convert('F'))
    normal_tiers('mars', mars, .87)
    normal_tiers('europa', europa, .53)
    prepare_rings()
    print('Prepared source-preserving multiscale detail, lunar DEM normals, roughness, and 4K radial rings.')


if __name__ == '__main__':
    main()
