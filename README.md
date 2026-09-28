# Food Discovery with Qdrant

Search for dishes by discovery instead of typing a query: you are shown a grid of
dishes, you like or skip them, and the results adapt to your taste. You can also
start from a text query ("sushi", "vegan salad"). It is a more natural way to
search when you are hungry but do not know exactly what you want.

The demo runs on the [Wolt](https://wolt.com/) dataset, 1,720,611 dish photos
from restaurants, each embedded with CLIP so search works on how the food looks.

## Two Services, Not Three

The demo runs on **Vercel** and **Qdrant Cloud**, and nothing else.

Text queries are embedded inside the cluster by **Qdrant Cloud Inference**, using
`qdrant/clip-vit-b-32-text`: the text tower of the same CLIP model the image
vectors were built with. The FastAPI container that used to load that model and
run on Railway is now two serverless functions that post JSON to Qdrant:
[`frontend/api/search.ts`](frontend/api/search.ts) and
[`frontend/api/locations.ts`](frontend/api/locations.ts). Neither has any
dependencies.

The image-processing scripts are still Python, because they run once, by hand.

## What's Inside

| | |
|-|-|
| Qdrant | Holds the CLIP image embeddings and answers likes and skips through the Recommendation API. |
| Qdrant Cloud Inference | Embeds the typed query in-cluster, so the app ships no model. |
| CLIP `ViT-B/32` | Images and text share one embedding space, so a text query finds matching photos. [Radford et al. 2021](https://arxiv.org/abs/2103.00020). |
| React (Vite) on Vercel | The frontend, styled with the Qdrant design system. |

| Component | |
|-|-|
| `frontend/api/search.ts` | `POST /api/search`. The whole backend. |
| `frontend/api/locations.ts` | `GET /api/locations`, the sampled coverage map. |
| `processing/` | Builds the image embeddings from raw photos. Run once. |

## How It Works

Each dish is a point with a 512-dimension CLIP image vector and a payload
(`name`, `description`, `image`, `cafe`).

A search sends liked and disliked dish ids, and any typed queries, to
`points/query/groups`. The typed queries ride along as text inside the
recommendation's positive list, and the cluster embeds them, so a liked dish and
a typed craving are the same kind of input by the time Qdrant sees them.

Results are grouped by `cafe.slug`, one dish per restaurant, then filtered to
English-looking text and de-duplicated by dish name. Only the typed query is
embedded at search time; the 1.7 million image vectors are reused.

With no input at all, the grid is a random sample. With only dislikes, there is
nothing to recommend from, so the search uses the negated mean of the disliked
vectors instead.

## Data

The collection (`wolt-clip-ViT-B-32`, 512 dimensions, unnamed vectors) is
restored from a Qdrant snapshot straight into your cluster, with no local
processing:

```python
from qdrant_client import QdrantClient, models
client = QdrantClient(url="https://<your-cluster>:6333", api_key="<key>")
client.recover_snapshot(
    "wolt-clip-ViT-B-32",
    location="https://snapshots.qdrant.io/wolt-clip-2108082541245612-2026-06-04-09-56-17.snapshot",
)
# Grouping needs a keyword index on the group field.
client.create_payload_index("wolt-clip-ViT-B-32", "cafe.slug", models.PayloadSchemaType.KEYWORD)
```

To rebuild embeddings from raw images instead, see [`processing/`](/processing).

## Run Locally

**Prerequisites:** Node 20 or newer, and a Qdrant Cloud cluster with Cloud
Inference enabled. A local Qdrant in Docker cannot serve this demo, because
nothing would embed the query.

```bash
cp .env.example .env    # then fill in QDRANT_URL and QDRANT_API_KEY

npm i -g vercel
cd frontend && vercel dev
```

## Configuration

| Variable | Default | |
|-|-|-|
| `QDRANT_URL` | none | Qdrant Cloud endpoint |
| `QDRANT_API_KEY` | none | Qdrant Cloud key |
| `QDRANT_COLLECTION` | `wolt-clip-ViT-B-32` | collection to search |
| `CLIP_TEXT_MODEL` | `qdrant/clip-vit-b-32-text` | the in-cluster text encoder |
| `FILTER_ENGLISH` | `true` | bias results toward English dish text, since the Wolt data is multilingual. Set `false` for the full catalog. |

`VITE_API_BASE` must be **unset**. It pointed the frontend at the old Railway
API; empty means same-origin, which is where the functions now are.

## Measured Against the Backend It Replaces

12 query shapes, 3 repetitions each, both backends called from the same machine
and interleaved so neither gets the warmer socket. `test/compare.mjs` re-runs it.

Latency, milliseconds:

| | p50 | p95 | mean |
|-|-|-|-|
| new | **172** | **231** | **174** |
| old | 308 | 407 | 320 |

The old path was laptop to Railway to Qdrant. The new one is laptop to Qdrant.

Results are close but not identical: 95% of dishes overlap, and the same order
comes back on 2 of 12 queries. That needs the control to interpret. Asked the
same question twice, each backend agrees with itself 99% of the time, so the
remaining 5% is a real difference rather than noise. Its size is visible in the
scores: a dish present in both results scores within 0.002, against cosine
values around 0.61. The in-cluster CLIP text tower and the fastembed one are the
same model, not the same bytes, and 0.002 is enough to reorder the tail of a
1.7 million point collection.

Two checks on whether that costs anything, over 15 typed queries:

| | new | old |
|-|-|-|
| mean CLIP score of the grid | 0.6069 | 0.6069 |
| results whose text matches the query | 70.6% | 70.0% |

The score is identical to four decimals, and the lexical check is a tie within
its own noise. The lexical check is a weak proxy, because CLIP matches pictures
rather than words, but it is measured the same way for both.

## Where This Stops Working

**A cluster without Cloud Inference.** The functions send query text, not
vectors, and nothing in this repository can embed. A cluster with inference off
returns an error on every search rather than degrading.

**The English filter is a heuristic.** The dataset has no language field, so the
filter excludes Nordic characters and requires one common English word. It will
drop English dishes with terse names, and it over-fetches 16 groups per result to
compensate. Set `FILTER_ENGLISH=false` for the unfiltered catalog.

**The coverage map is sampled, not counted.** `GET /api/locations` buckets a
random sample of up to 5,000 dishes into a 0.1 degree grid. It shows where the
data is, not how much.

### What Did Not Work

Text queries were going to be embedded by a separate call and passed in as
vectors, matching the old code exactly. Qdrant accepts a text document directly
inside `recommend.positive`, mixed with point ids, so the extra round trip was
unnecessary. That was checked against the live collection before the code was
written, not assumed.

## Checks

```bash
node --env-file=.env test/compare.mjs   # the latency and ranking tables above
node --env-file=.env test/serve.mjs     # the built frontend and both functions on one port
```
