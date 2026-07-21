# Status — Food Discovery

**Front end:** Qdrant-styled photo/Discovery UI, wired to `POST /api/search`.
**Back end:** original CLIP + Qdrant Discovery API, Qdrant-Cloud-ready.

## Needs its own collection (correction)
The backend queries a **single unnamed CLIP vector** (`clip-ViT-B-32`, 512-d) and
uses `recommend_groups`. Your existing `products` collection uses **named**
vectors, so it is **NOT compatible** — food-discovery needs a dedicated
single-vector CLIP collection built from the Wolt delivery dataset (see
`processing/`). That data is **not on the cluster yet**.

## To finish:
1. Build the Wolt CLIP collection (single vector, size 512, cosine) via the
   `processing/` pipeline, embedding images/text with `clip-ViT-B-32`.
2. Set env `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION=<that collection>`.
3. Deploy on Render, instance ≥ 2 GB RAM (CLIP is ~600 MB).

Verified: frontend renders. Not verified against a live collection.
