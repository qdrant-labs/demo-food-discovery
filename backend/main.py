import os
import logging
from typing import List

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastembed import TextEmbedding
from qdrant_client import QdrantClient
from qdrant_client.http.exceptions import UnexpectedResponse
from starlette.middleware.cors import CORSMiddleware

from discovery import DiscoveryStrategy
from models import SearchQuery, Product

import settings

logger = logging.getLogger(__name__)

# CLIP text encoder (fastembed). The same CLIP ViT-B/32 model the collection's
# image vectors were built with, so text queries land in the same space.
CLIP_TEXT_MODEL = "Qdrant/clip-ViT-B-32-text"
_FASTEMBED_PATH = os.environ.get("FASTEMBED_MODEL_PATH") or None


class ClipTextEncoder:
    def __init__(self):
        if _FASTEMBED_PATH:
            self._model = TextEmbedding(CLIP_TEXT_MODEL, specific_model_path=_FASTEMBED_PATH)
        else:
            self._model = TextEmbedding(CLIP_TEXT_MODEL)

    def encode(self, texts):
        texts = list(texts)
        if not texts:
            return np.zeros((0, 512))
        return np.array(list(self._model.embed(texts)))


# Create a FastAPI app
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create a client to interact with Qdrant (REST; gRPC needs extra setup on Cloud)
client = QdrantClient(
    settings.QDRANT_URL,
    api_key=settings.QDRANT_API_KEY,
)

# Load the CLIP text encoder once at startup
model = ClipTextEncoder()


@app.post("/api/search")
def search(search_query: SearchQuery) -> List[Product]:
    """Search for dishes from liked/disliked example ids and/or text queries."""
    try:
        strategy = DiscoveryStrategy(model, client)
        return strategy.handle(search_query)
    except UnexpectedResponse as e:
        logger.error("Could not perform search: %s", e)
        raise HTTPException(status_code=500, detail=e.reason_phrase)


@app.get("/api/health")
def health():
    """Diagnostics: the config in use and whether Qdrant is reachable (no key)."""
    key = os.environ.get("QDRANT_API_KEY", "") or ""
    info = {
        "qdrant_url": settings.QDRANT_URL,
        "collection": settings.QDRANT_COLLECTION,
        "api_key_present": bool(settings.QDRANT_API_KEY),
        "raw_key_ascii": key.isascii(),
        "sanitized_key_len": len(settings.QDRANT_API_KEY or ""),
    }
    try:
        cols = [c.name for c in client.get_collections().collections]
        info["qdrant_ok"] = True
        info["collection_exists"] = settings.QDRANT_COLLECTION in cols
        info["points"] = client.count(settings.QDRANT_COLLECTION).count
    except Exception as e:
        info["qdrant_ok"] = False
        info["error"] = f"{type(e).__name__}: {str(e)[:200]}"
    return info


# Mount the static files directory once the endpoints are defined
static_dir = os.path.join(settings.BACKEND_DIR, "build")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True))
