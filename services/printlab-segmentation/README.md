# Printlab Segmentation Service

This service backs Printlab's **Magic Split** and **BG Remove** tools with a real SAM-family segmentation model instead of the browser fallback that guesses from edge colors like a tiny confused photocopier.

The service exposes:

- `GET /health`
- `POST /segment`

Printlab should point `VITE_PRINTLAB_SEGMENTATION_ENDPOINT` at the `/segment` URL.

## Request

```json
{
  "image": "data:image/png;base64,...",
  "mode": "objects",
  "options": {}
}
```

Use `mode: "objects"` for Magic Split and `mode: "foreground"` for BG Remove.

## Response: objects

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

## Response: foreground

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

## Model setup

Model checkpoints are intentionally not committed to git. Download a SAM checkpoint manually and mount or copy it into the service runtime.

Common env vars:

```bash
PRINTLAB_SEGMENTATION_CHECKPOINT=/models/sam_vit_b_01ec64.pth
PRINTLAB_SEGMENTATION_MODEL_TYPE=vit_b
PRINTLAB_SEGMENTATION_DEVICE=cpu
PRINTLAB_SEGMENTATION_CORS_ORIGINS=http://localhost:5173
```

Use `vit_b` first. It is still heavy, because apparently every useful computer vision tool wants to eat the furniture, but it is the least obnoxious of the standard SAM options.

## Local run

```bash
cd services/printlab-segmentation
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PRINTLAB_SEGMENTATION_CHECKPOINT=/models/sam_vit_b_01ec64.pth \
PRINTLAB_SEGMENTATION_MODEL_TYPE=vit_b \
PRINTLAB_SEGMENTATION_DEVICE=cpu \
uvicorn app:app --reload --port 8000
```

Then run the frontend with:

```bash
VITE_PRINTLAB_SEGMENTATION_ENDPOINT=http://localhost:8000/segment npm run dev
```

## Docker

```bash
docker build -t printlab-segmentation services/printlab-segmentation
docker run --rm -p 8000:8000 \
  -e PRINTLAB_SEGMENTATION_CHECKPOINT=/models/sam_vit_b_01ec64.pth \
  -e PRINTLAB_SEGMENTATION_MODEL_TYPE=vit_b \
  -e PRINTLAB_SEGMENTATION_DEVICE=cpu \
  -v /path/to/models:/models \
  printlab-segmentation
```

## Notes

- Magic Split returns image layers, not editable text. OCR/editable-text extraction is a later feature.
- BG Remove chooses the best likely foreground mask. Complex images may still need a future "choose subject" UI.
- The frontend remains state-backed: returned layers become normal Printlab canvas blocks, so undo/redo, crop, resize, delete, duplicate, layer order, print, and export should still work.
