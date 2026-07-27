# Food Discovery with Qdrant

Search for dishes by **discovery** instead of typing a query: you're shown a grid
of dishes and you **like** or **skip** them, and the results adapt to your taste.
You can also start from a **text query** ("sushi", "vegan salad"). It's a more
natural way to search when you're hungry but don't know exactly what you want.

The demo runs on the [Wolt](https://wolt.com/) dataset — ~1.7M dish photos from
restaurants, each embedded with **CLIP** so search works on how the food *looks*.

## What's inside

| | |
|-|-|
| Qdrant | Vector database storing the CLIP image embeddings; powers likes/skips via the Recommendation API. |
| CLIP `ViT-B/32` | Image + text share one embedding space, so a text query finds matching photos. |
| FastEmbed | Encodes the text query with `Qdrant/clip-ViT-B-32-text` (same space as the image vectors). |
| React (Vite) | The frontend, styled with the Qdrant design system. |
| FastAPI | Backend exposing `POST /api/search`. |

## How it works

Each dish is a point in Qdrant with a 512-d CLIP image vector and payload
(`name`, `description`, `image`, `cafe`). A search sends liked/disliked dish ids
and/or text queries; the backend encodes text with CLIP and calls Qdrant's
grouped recommendation (`query_points_groups`), returning one dish per restaurant
(`cafe.slug`). Only text queries are vectorized at search time — the image
vectors are reused — so search stays fast.

## Data

The collection (`wolt-clip-ViT-B-32`, 512-d, unnamed vectors) is restored from a
Qdrant snapshot straight into your cluster — no local processing needed:

```python
from qdrant_client import QdrantClient
client = QdrantClient(url="https://<your-cluster>:6333", api_key="<key>")
client.recover_snapshot(
    "wolt-clip-ViT-B-32",
    location="https://snapshots.qdrant.io/wolt-clip-2108082541245612-2026-06-04-09-56-17.snapshot",
)
# grouping needs a keyword index on the group field:
from qdrant_client import models
client.create_payload_index("wolt-clip-ViT-B-32", "cafe.slug", models.PayloadSchemaType.KEYWORD)
```

(To rebuild embeddings from raw images instead, see [`processing/`](/processing).)

## Run locally

**Backend**

```bash
pip install "fastapi" "uvicorn" "qdrant-client[fastembed]"

export QDRANT_URL="https://<your-cluster>:6333"
export QDRANT_API_KEY="<your-key>"
export QDRANT_COLLECTION="wolt-clip-ViT-B-32"

uvicorn main:app --host 0.0.0.0 --port 8000   # from the backend/ directory
```

**Frontend** (another terminal)

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_API_BASE` to the backend URL if it's on a different host.

## Configuration

| Variable | Default | |
|-|-|-|
| `QDRANT_URL` | `http://localhost:6333` | Qdrant endpoint |
| `QDRANT_API_KEY` | — | Qdrant Cloud key |
| `QDRANT_COLLECTION` | `wolt-clip-ViT-B-32` | collection to search |
| `FILTER_ENGLISH` | `true` | bias results toward English dish text (the Wolt data is multilingual); set `0` for the full catalog |

## Deploy

Two services against Qdrant Cloud.

**Backend — Railway (or any Docker host).** Deploy this repo; the `Dockerfile`
installs deps, bakes the CLIP text model, and runs FastAPI bound to `$PORT`. Set
`QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION=wolt-clip-ViT-B-32`.

**Frontend — Vercel.** Import with **Root Directory = `frontend`** and set
`VITE_API_BASE` to the backend URL. The resulting URL is the public demo.
