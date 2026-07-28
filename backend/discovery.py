import itertools
import logging
import re
from typing import List

import numpy as np
from qdrant_client import QdrantClient, models

import settings
from models import SearchQuery, Product

logger = logging.getLogger(__name__)

# Over-fetch this many groups per requested result when filtering for English,
# since English is a minority of the multilingual dataset.
ENGLISH_OVERFETCH = 16
MAX_OVERFETCH = 256

# Fast, dependency-free English heuristic: exclude Nordic characters and require
# a common English word. Best-effort (there is no language field in the data).
_EN_WORDS = {
    "the", "and", "with", "of", "a", "in", "on", "for", "served", "fresh",
    "house", "sauce", "topped", "choice", "your", "our", "from", "or", "to",
    "chicken", "cheese", "rice", "salad", "bowl", "fried", "grilled", "spicy",
    "sweet", "beef", "mix", "set", "pork", "fish", "egg", "soup", "roll",
}


def _dish_key(name):
    """Normalized dish name for de-duplication: lowercased, menu numbers like
    "31. " or "A32. " stripped, whitespace collapsed."""
    n = (name or "").strip().lower()
    n = re.sub(r"^[a-z]?\d+\s*[.\)]\s*", "", n)
    return re.sub(r"\s+", " ", n)


def _looks_english(name, desc):
    text = (desc if len(desc or "") > len(name or "") else name) or ""
    t = text.lower()
    if len(t) < 3:
        return False
    if any(ch in t for ch in "åäöøæ"):
        return False
    return len(set(t.replace(",", " ").split()) & _EN_WORDS) >= 1


class DiscoveryStrategy:
    """
    Food discovery search over a Qdrant collection of CLIP image embeddings.

    - No input -> random sampling (the initial "discover" grid).
    - Otherwise -> Qdrant recommendation over the liked/disliked dishes plus any
      CLIP-encoded text queries.

    Results are grouped by restaurant (`cafe.slug`) so each card comes from a
    different place. Uses the current Qdrant query API (`query_points_groups`).
    """

    def __init__(self, embedding_model, qdrant_client: QdrantClient):
        # embedding_model.encode(list[str]) -> np.ndarray of CLIP text vectors
        self.embedding_model = embedding_model
        self.qdrant_client = qdrant_client

    def handle(self, search_query: SearchQuery) -> List[Product]:
        positive = search_query.positive or []
        negative = search_query.negative or []
        queries = search_query.queries or []

        if len(positive) + len(negative) + len(queries) == 0:
            points = self._random(search_query)
        else:
            points = self._recommend(search_query)

        return [Product.from_point(point) for point in points]

    def _location_filter(self, location):
        if location is None:
            return None
        return models.Filter(
            must=[
                models.FieldCondition(
                    key="cafe.location",
                    geo_radius=models.GeoRadius(
                        center=models.GeoPoint(lon=location.longitude, lat=location.latitude),
                        radius=location.radius_km * 1000,
                    ),
                )
            ]
        )

    def _grouped(self, query, search_query: SearchQuery):
        want = search_query.limit
        # Over-fetch so English filtering and de-duplication still leave a full grid.
        factor = ENGLISH_OVERFETCH if settings.FILTER_ENGLISH else 4
        fetch = min(want * factor, MAX_OVERFETCH)
        response = self.qdrant_client.query_points_groups(
            collection_name=settings.QDRANT_COLLECTION,
            query=query,
            group_by=settings.GROUP_BY_FIELD,
            query_filter=self._location_filter(search_query.location),
            limit=fetch,
            group_size=1,
            with_payload=True,
        )
        hits = list(itertools.chain.from_iterable(group.hits for group in response.groups))

        if settings.FILTER_ENGLISH:
            english = [h for h in hits if _looks_english(h.payload.get("name"), h.payload.get("description"))]
            # Fall back to unfiltered results if nothing matched (keeps the grid full).
            hits = english or hits

        # Grouping by restaurant still lets the same dish repeat (same product
        # resold by many places / chain branches). De-duplicate by dish name so
        # the grid shows distinct dishes.
        seen = set()
        deduped = []
        for h in hits:
            key = _dish_key((h.payload or {}).get("name"))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(h)

        return deduped[:want]

    def _random(self, search_query: SearchQuery):
        return self._grouped(models.SampleQuery(sample=models.Sample.RANDOM), search_query)

    def _recommend(self, search_query: SearchQuery):
        queries = search_query.queries or []
        query_vectors = self.embedding_model.encode(queries).tolist() if queries else []
        positive = list(search_query.positive or []) + query_vectors
        negative = list(search_query.negative or [])

        if not positive and negative:
            # Recommendation needs at least one positive example. With only
            # disliked dishes, search the negated mean of their vectors instead.
            disliked, _ = self.qdrant_client.scroll(
                settings.QDRANT_COLLECTION,
                scroll_filter=models.Filter(must=[models.HasIdCondition(has_id=negative)]),
                with_vectors=True,
                limit=len(negative),
            )
            mean_vector = np.mean(np.array([point.vector for point in disliked]), axis=0)
            return self._grouped((-mean_vector).tolist(), search_query)

        query = models.RecommendQuery(
            recommend=models.RecommendInput(
                positive=positive,
                negative=negative,
                strategy=search_query.strategy,
            )
        )
        return self._grouped(query, search_query)
