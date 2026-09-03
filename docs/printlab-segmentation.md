# Printlab Segmentation

Printlab's Canvas tools use normal React canvas blocks only. Magic Split creates new top-level image blocks, and BG Remove updates the selected image block source through canvas state. The tools must not create DOM-only layers, inject toolbar buttons, or use grid slicing.

## Tools

- **Magic Split** tries to separate a selected flat image into movable object layers. Each result is inserted as a normal canvas image block so it appears in Layers and supports select, crop, resize, duplicate, delete, layer order, keyboard shortcuts, print, and export.
- **BG Remove** replaces the selected image block with a transparent foreground cutout. The selected block remains a normal image block.

## Endpoint Configuration

The browser adapter checks for a segmentation endpoint in this order:

1. `window.__PRINTLAB_SEGMENTATION_ENDPOINT__`
2. `VITE_PRINTLAB_SEGMENTATION_ENDPOINT`
3. The bundled Cloudflare Pages stub at `/api/printlab/segment`

The bundled endpoint returns `501 SEGMENTATION_NOT_CONFIGURED` until a real model service is connected. No `.onnx`, `.pth`, `.pt`, or other model checkpoint files are committed to this repo.

## Model-backed service

A SAM-backed reference service now lives at:

```txt
services/printlab-segmentation/
```

It exposes:

- `GET /health`
- `POST /segment`

Run it locally, then set:

```bash
VITE_PRINTLAB_SEGMENTATION_ENDPOINT=http://localhost:8000/segment
```

Common service env vars:

```bash
PRINTLAB_SEGMENTATION_CHECKPOINT=/models/sam_vit_b_01ec64.pth
PRINTLAB_SEGMENTATION_MODEL_TYPE=vit_b
PRINTLAB_SEGMENTATION_DEVICE=cpu
PRINTLAB_SEGMENTATION_CORS_ORIGINS=http://localhost:5173
```

Use `vit_b` first. Bigger models can produce better masks, but they are heavier and should be treated like machinery, not decorative confetti.

See `services/printlab-segmentation/README.md` for local and Docker setup.

## Request Shape

Both tools send a `POST` request:

```json
{
  "image": "data:image/png;base64,...",
  "mode": "objects",
  "options": {}
}
```

Use `mode: "objects"` for Magic Split and `mode: "foreground"` for BG Remove.

## Magic Split Response

Preferred response:

```json
{
  "sourceWidth": 1200,
  "sourceHeight": 800,
  "objects": [
    {
      "id": "object-1",
      "src": "data:image/png;base64,...",
      "bbox": [120, 80, 320, 260],
      "score": 0.94,
      "area": 12345
    }
  ]
}
```

If `src` is omitted, the adapter can composite a transparent PNG from `mask` plus `bbox`. Masks may be binary arrays, base64 bytes, simple RLE objects with `counts`, or mask image data URLs.

## BG Remove Response

Preferred response:

```json
{
  "sourceWidth": 1200,
  "sourceHeight": 800,
  "foreground": {
    "src": "data:image/png;base64,...",
    "bbox": [90, 42, 900, 690],
    "score": 0.96,
    "area": 12345
  }
}
```

If `foreground.src` is omitted, the adapter can composite from `foreground.mask` plus `foreground.bbox`.

## Fallback

When no endpoint is configured, or the endpoint returns `404`, `501`, times out, or fails at the network layer, Printlab uses a local browser fallback. The fallback estimates the background from image edges, flood-fills likely background, then extracts connected foreground components.

This fallback is intentionally lightweight and is not Canva/SAM-quality. It is meant to keep the tool present until the model-backed service is running. If Magic Split cannot find separate objects, or BG Remove removes too much, the browser fallback has reached its limit. That is not a UI bug; it means the real segmentation service is not configured or not responding.

## Backend Notes

The service should:

- run SAM/MobileSAM/SAM2 or an equivalent ONNX segmentation model;
- generate object masks for Magic Split;
- generate a primary foreground mask for BG Remove;
- return transparent PNGs when practical;
- otherwise return masks with bounding boxes.

Keep model URLs and service endpoints configurable. Do not commit large model files to git.
