import base64
import io
import os
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image, ImageOps


class SegmentRequest(BaseModel):
    image: str
    mode: str = Field(pattern='^(objects|foreground)$')
    options: Dict[str, Any] = Field(default_factory=dict)


app = FastAPI(title='Printlab Segmentation Service', version='0.2.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv('PRINTLAB_SEGMENTATION_CORS_ORIGINS', '*').split(','),
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'OPTIONS'],
    allow_headers=['*'],
)


def read_image_from_bytes(raw: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(raw))
    return ImageOps.exif_transpose(image).convert('RGB')


def fetch_image_url(url: str) -> bytes:
    request = Request(
        url,
        headers={
            'user-agent': 'PrintlabSegmentation/0.2',
            'accept': 'image/*,*/*;q=0.8',
        },
    )
    with urlopen(request, timeout=float(os.getenv('PRINTLAB_SEGMENTATION_FETCH_TIMEOUT', '20'))) as response:
        content_type = response.headers.get('content-type', '')
        raw = response.read(int(os.getenv('PRINTLAB_SEGMENTATION_MAX_IMAGE_BYTES', '25000000')))
        if not raw:
            raise ValueError('empty image response')
        if content_type and 'image' not in content_type.lower() and not content_type.lower().startswith('application/octet-stream'):
            raise ValueError(f'URL did not return an image content-type: {content_type}')
        return raw


def resolve_image_url(value: str) -> str:
    if value.startswith('//'):
        return f'https:{value}'
    parsed = urlparse(value)
    if parsed.scheme in ('http', 'https'):
        return value
    if value.startswith('/'):
        public_origin = os.getenv('PRINTLAB_SEGMENTATION_PUBLIC_ORIGIN', 'http://localhost:8788')
        return urljoin(public_origin.rstrip('/') + '/', value.lstrip('/'))
    raise ValueError('image was not a data URL, absolute URL, or root-relative URL')


def decode_input_image(image_value: str) -> Image.Image:
    value = str(image_value or '').strip()
    if not value:
        raise HTTPException(status_code=400, detail={'error': 'No image provided', 'code': 'NO_IMAGE'})

    try:
        if value.startswith('data:image/'):
            payload = value.split(',', 1)[1] if ',' in value else ''
            if not payload:
                raise ValueError('missing data URL payload')
            return read_image_from_bytes(base64.b64decode(payload, validate=False))

        parsed = urlparse(value)
        if value.startswith('/') or parsed.scheme in ('http', 'https') or value.startswith('//'):
            return read_image_from_bytes(fetch_image_url(resolve_image_url(value)))

        return read_image_from_bytes(base64.b64decode(value, validate=False))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={'error': f'Could not decode image: {exc}', 'code': 'BAD_IMAGE', 'imagePreview': value[:90]},
        ) from exc


def image_to_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format='PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')


def bbox_iou(a: List[float], b: List[float]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ax2, ay2 = ax + aw, ay + ah
    bx2, by2 = bx + bw, by + bh
    ix1, iy1 = max(ax, bx), max(ay, by)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    intersection = iw * ih
    union = (aw * ah) + (bw * bh) - intersection
    return intersection / union if union else 0.0


def mask_bounds(mask: np.ndarray) -> Optional[Tuple[int, int, int, int, int]]:
    if not np.any(mask):
        return None
    ys, xs = np.where(mask > 0)
    x1 = int(xs.min())
    y1 = int(ys.min())
    x2 = int(xs.max()) + 1
    y2 = int(ys.max()) + 1
    return x1, y1, x2 - x1, y2 - y1, int(mask.sum())


def crop_rgb_with_mask(rgb: np.ndarray, mask: np.ndarray, bbox: Tuple[int, int, int, int], rectangular_alpha: bool = False) -> str:
    x, y, width, height = bbox
    crop_rgb = rgb[y:y + height, x:x + width]
    crop_mask = mask[y:y + height, x:x + width]
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[:, :, :3] = crop_rgb
    rgba[:, :, 3] = 255 if rectangular_alpha else np.where(crop_mask > 0, 255, 0).astype(np.uint8)
    return image_to_data_url(Image.fromarray(rgba, mode='RGBA'))


@lru_cache(maxsize=1)
def get_rembg_session():
    model_name = os.getenv('PRINTLAB_REMBG_MODEL', 'u2netp').strip() or 'u2netp'
    from rembg import new_session
    return new_session(model_name)


def run_rembg(image: Image.Image) -> Image.Image:
    from rembg import remove

    session = get_rembg_session()
    rgba = remove(image.convert('RGBA'), session=session)
    if not isinstance(rgba, Image.Image):
        rgba = Image.open(io.BytesIO(rgba)).convert('RGBA')
    return rgba.convert('RGBA')


def foreground_response_from_rgba(rgba_image: Image.Image, source_width: int, source_height: int, options: Dict[str, Any], source: str) -> Dict[str, Any]:
    alpha_threshold = int(options.get('alphaThreshold', os.getenv('PRINTLAB_ALPHA_THRESHOLD', '12')))
    alpha = np.asarray(rgba_image.convert('RGBA').getchannel('A'))
    bounds = mask_bounds((alpha > alpha_threshold).astype(np.uint8))
    if not bounds:
        raise ValueError('background remover produced an empty foreground')
    x, y, width, height, area = bounds
    crop = rgba_image.convert('RGBA').crop((x, y, x + width, y + height))
    return {
        'sourceWidth': source_width,
        'sourceHeight': source_height,
        'foreground': {
            'src': image_to_data_url(crop),
            'bbox': [float(x), float(y), float(width), float(height)],
            'score': 1.0,
            'area': area,
            'foregroundRatio': area / max(1, source_width * source_height),
            'source': source,
        },
    }


def remove_background_with_rembg(image: Image.Image, options: Dict[str, Any]) -> Dict[str, Any]:
    source_width, source_height = image.size
    return foreground_response_from_rgba(run_rembg(image), source_width, source_height, options, 'rembg')


def estimate_layout_background(rgb: np.ndarray) -> np.ndarray:
    edges = np.concatenate([rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]], axis=0).astype(np.float32)
    return np.median(edges, axis=0)


def add_object(objects: List[Dict[str, Any]], rgb: np.ndarray, mask: np.ndarray, bbox: Tuple[int, int, int, int], area: int, source: str, rectangular_alpha: bool = False) -> None:
    x, y, width, height = bbox
    candidate_bbox = [float(x), float(y), float(width), float(height)]
    if any(bbox_iou(candidate_bbox, item.get('bbox', [])) >= 0.72 for item in objects):
        return
    image_area = max(1, rgb.shape[0] * rgb.shape[1])
    objects.append({
        'id': f'object-{len(objects) + 1}',
        'src': crop_rgb_with_mask(rgb, mask, bbox, rectangular_alpha),
        'bbox': candidate_bbox,
        'score': float(area / image_area),
        'area': int(area),
        'source': source,
    })


def collect_component_objects(objects: List[Dict[str, Any]], rgb: np.ndarray, mask: np.ndarray, options: Dict[str, Any], source: str, relaxed: bool = False) -> None:
    try:
        import cv2
    except Exception as exc:
        raise ValueError(f'OpenCV is required for layout splitting: {exc}') from exc

    height, width = mask.shape[:2]
    image_area = max(1, width * height)
    min_side = max(1, min(width, height))
    min_area_ratio = float(options.get('layoutMinAreaRatio', options.get('minAreaRatio', 0.00035 if relaxed else 0.00075)))
    max_bbox_ratio = float(options.get('layoutMaxAreaRatio', options.get('maxAreaRatio', 0.96 if relaxed else 0.82)))
    min_area = max(8, int(round(image_area * min_area_ratio)))
    min_dimension = int(options.get('layoutMinDimension', max(2, round(min_side * (0.008 if relaxed else 0.012)))))
    edge_margin = int(options.get('layoutEdgeMargin', max(2, round(min_side * 0.01))))
    huge_edge_ratio = float(options.get('layoutHugeEdgeRatio', 0.86 if relaxed else 0.62))
    rect_density = float(options.get('layoutRectAlphaDensity', 0.62))

    labels_count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    candidates = []
    for label in range(1, labels_count):
        x, y, box_width, box_height, area = [int(value) for value in stats[label]]
        if box_width <= 0 or box_height <= 0:
            continue
        bbox_area_ratio = (box_width * box_height) / image_area
        touches_edges = sum([
            x <= edge_margin,
            y <= edge_margin,
            x + box_width >= width - edge_margin,
            y + box_height >= height - edge_margin,
        ])
        if area < min_area:
            continue
        if bbox_area_ratio > max_bbox_ratio:
            continue
        if touches_edges >= 3 and bbox_area_ratio > huge_edge_ratio:
            continue
        if box_width < min_dimension and box_height < min_dimension:
            continue
        density = area / max(1, box_width * box_height)
        candidates.append((label, x, y, box_width, box_height, area, density))

    candidates.sort(key=lambda item: item[5], reverse=True)
    for label, x, y, box_width, box_height, area, density in candidates:
        if len(objects) >= int(options.get('maxObjects', 24)):
            break
        component_mask = (labels == label).astype(np.uint8)
        add_object(objects, rgb, component_mask, (x, y, box_width, box_height), area, source, density >= rect_density)


def objects_response_from_layout(image: Image.Image, options: Dict[str, Any]) -> Dict[str, Any]:
    try:
        import cv2
    except Exception as exc:
        raise ValueError(f'OpenCV is required for layout splitting: {exc}') from exc

    source_width, source_height = image.size
    rgb = np.asarray(image.convert('RGB'), dtype=np.uint8)
    background = estimate_layout_background(rgb)
    distance = np.linalg.norm(rgb.astype(np.float32) - background.reshape(1, 1, 3), axis=2)
    gray = np.mean(rgb.astype(np.float32), axis=2)

    objects: List[Dict[str, Any]] = []
    base_tolerance = float(options.get('layoutTolerance', options.get('colorTolerance', 28)))
    masks = [
        ('layout-visible', (distance > base_tolerance).astype(np.uint8), False),
        ('layout-soft', (distance > max(12, base_tolerance * 0.55)).astype(np.uint8), True),
        ('layout-dark', (gray < float(options.get('layoutDarkThreshold', 205))).astype(np.uint8), True),
        ('layout-deep-dark', (gray < float(options.get('layoutDeepDarkThreshold', 155))).astype(np.uint8), True),
    ]

    for source, mask, relaxed in masks:
        if int(mask.sum()) <= 0:
            continue
        collect_component_objects(objects, rgb, mask, options, source, relaxed=relaxed)
        if len(objects) >= int(options.get('maxObjects', 24)):
            break

    if len(objects) < int(options.get('layoutMinObjects', 2)):
        dark_mask = (gray < float(options.get('layoutFallbackDarkThreshold', 215))).astype(np.uint8)
        bounds = mask_bounds(dark_mask)
        if bounds:
            x, y, box_width, box_height, area = bounds
            add_object(objects, rgb, dark_mask, (x, y, box_width, box_height), area, 'layout-dark-fallback', False)

    if len(objects) < int(options.get('layoutMinObjects', 2)):
        content_mask = (distance > max(10, base_tolerance * 0.45)).astype(np.uint8)
        bounds = mask_bounds(content_mask)
        if bounds:
            x, y, box_width, box_height, area = bounds
            add_object(objects, rgb, content_mask, (x, y, box_width, box_height), area, 'layout-content-fallback', False)

    if not objects:
        raise ValueError('layout splitter did not find visible objects')

    objects.sort(key=lambda item: (item['bbox'][1], item['bbox'][0], -item['area']))
    return {'sourceWidth': source_width, 'sourceHeight': source_height, 'objects': objects[:int(options.get('maxObjects', 24))]}


def objects_response_from_rembg(image: Image.Image, options: Dict[str, Any]) -> Dict[str, Any]:
    rgba_image = run_rembg(image)
    source_width, source_height = image.size
    rgb = np.asarray(image.convert('RGB'), dtype=np.uint8)
    alpha_threshold = int(options.get('alphaThreshold', os.getenv('PRINTLAB_ALPHA_THRESHOLD', '12')))
    alpha = np.asarray(rgba_image.getchannel('A'))
    mask = (alpha > alpha_threshold).astype(np.uint8)
    objects: List[Dict[str, Any]] = []
    collect_component_objects(objects, rgb, mask, options, 'rembg-alpha-split', relaxed=True)
    if not objects:
        bounds = mask_bounds(mask)
        if bounds:
            x, y, box_width, box_height, area = bounds
            add_object(objects, rgb, mask, (x, y, box_width, box_height), area, 'rembg-alpha-fallback', False)
    if not objects:
        raise ValueError('background remover produced no object masks')
    return {'sourceWidth': source_width, 'sourceHeight': source_height, 'objects': objects[:int(options.get('maxObjects', 24))]}


@app.get('/health')
def health():
    return {
        'ok': True,
        'configured': False,
        'modelLoaded': False,
        'modelType': 'layout-rembg',
        'backgroundModel': os.getenv('PRINTLAB_REMBG_MODEL', 'u2netp'),
        'backgroundModelLoaded': get_rembg_session.cache_info().currsize > 0,
    }


@app.post('/segment')
def segment(request: SegmentRequest):
    image = decode_input_image(request.image)
    options = request.options or {}

    if request.mode == 'foreground' and not options.get('disableRembg'):
        try:
            return remove_background_with_rembg(image, options)
        except Exception as exc:
            raise HTTPException(status_code=502, detail={'error': f'Background remover failed: {exc}', 'code': 'REMBG_FAILED'}) from exc

    if request.mode == 'objects' and not options.get('disableLayoutObjects'):
        try:
            return objects_response_from_layout(image, options)
        except Exception as layout_exc:
            if options.get('failOnLayoutError'):
                raise HTTPException(status_code=502, detail={'error': f'Layout splitter failed: {layout_exc}', 'code': 'LAYOUT_OBJECTS_FAILED'}) from layout_exc

    if request.mode == 'objects' and not options.get('disableRembgObjects'):
        try:
            return objects_response_from_rembg(image, options)
        except Exception as rembg_exc:
            raise HTTPException(status_code=422, detail={'error': f'Could not identify separate objects: {rembg_exc}', 'code': 'NO_OBJECT_MASKS'}) from rembg_exc

    raise HTTPException(status_code=422, detail={'error': 'Could not identify separate objects', 'code': 'NO_OBJECT_MASKS'})
