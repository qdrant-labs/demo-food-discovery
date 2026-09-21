/**
 * POST /api/search
 *
 * Replaces the FastAPI service that ran on Railway. That service loaded a CLIP
 * text encoder into the process to turn a typed query into a vector. Qdrant
 * Cloud Inference runs the same model, `Qdrant/clip-ViT-B-32-text`, inside the
 * cluster, so the text goes over as text and nothing here loads a model.
 *
 * Request and response shapes are unchanged, and so is the search itself:
 * grouped by restaurant, filtered to English-looking dishes, de-duplicated by
 * dish name.
 */

const BASE = (process.env.QDRANT_URL ?? "").replace(/\/+$/, "");
const API_KEY = process.env.QDRANT_API_KEY ?? "";
const COLLECTION = process.env.QDRANT_COLLECTION || "wolt-clip-ViT-B-32";
const GROUP_BY = "cafe.slug";
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;
const TIMEOUT_MS = Number(process.env.QDRANT_TIMEOUT_MS ?? 20000);

// The text tower of the CLIP model the image vectors were built with, so a
// typed query lands in the same space as the pictures.
const TEXT_MODEL = process.env.CLIP_TEXT_MODEL || "qdrant/clip-vit-b-32-text";

// The Wolt dataset is multilingual; bias results toward English dish text.
const FILTER_ENGLISH = (process.env.FILTER_ENGLISH ?? "true").toLowerCase() !== "false";

// Over-fetch this many groups per requested result when filtering for English,
// since English is a minority of the dataset.
const ENGLISH_OVERFETCH = 16;
const MAX_OVERFETCH = 256;

// Fast, dependency-free English heuristic: exclude Nordic characters and require
// a common English word. Best-effort, because the data has no language field.
const EN_WORDS = new Set([
  "the", "and", "with", "of", "a", "in", "on", "for", "served", "fresh",
  "house", "sauce", "topped", "choice", "your", "our", "from", "or", "to",
  "chicken", "cheese", "rice", "salad", "bowl", "fried", "grilled", "spicy",
  "sweet", "beef", "mix", "set", "pork", "fish", "egg", "soup", "roll",
]);

type Payload = Record<string, any>;
type Hit = { id: string | number; score: number; payload: Payload };

async function post(path: string, body: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "api-key": API_KEY, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload: any = await res.json();
    if (!res.ok || payload.result === undefined) {
      throw new Error(payload?.status?.error ?? `Qdrant returned ${res.status}`);
    }
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Normalized dish name for de-duplication: lowercased, menu numbers like
 * "31. " or "A32. " stripped, whitespace collapsed. */
export function dishKey(name: unknown): string {
  const n = String(name ?? "").trim().toLowerCase();
  return n.replace(/^[a-z]?\d+\s*[.)]\s*/, "").replace(/\s+/g, " ");
}

export function looksEnglish(name: unknown, desc: unknown): boolean {
  const n = String(name ?? "");
  const d = String(desc ?? "");
  const t = (d.length > n.length ? d : n).toLowerCase();
  if (t.length < 3) return false;
  if (/[åäöøæ]/.test(t)) return false;
  return t.replace(/,/g, " ").split(/\s+/).some((w) => EN_WORDS.has(w));
}

function locationFilter(location: any) {
  if (!location) return undefined;
  return {
    must: [
      {
        key: "cafe.location",
        geo_radius: {
          center: { lon: location.longitude, lat: location.latitude },
          radius: location.radius_km * 1000,
        },
      },
    ],
  };
}

async function grouped(query: unknown, location: any, want: number): Promise<Hit[]> {
  const factor = FILTER_ENGLISH ? ENGLISH_OVERFETCH : 4;
  const result = await post(`/collections/${COLLECTION}/points/query/groups`, {
    query,
    group_by: GROUP_BY,
    filter: locationFilter(location),
    limit: Math.min(want * factor, MAX_OVERFETCH),
    group_size: 1,
    with_payload: true,
  });

  let hits: Hit[] = result.groups.flatMap((g: any) => g.hits);

  if (FILTER_ENGLISH) {
    const english = hits.filter((h) => looksEnglish(h.payload?.name, h.payload?.description));
    // Fall back to unfiltered results if nothing matched, so the grid stays full.
    hits = english.length ? english : hits;
  }

  // Grouping by restaurant still lets the same dish repeat, because chains and
  // resellers list it separately. De-duplicate by dish name.
  const seen = new Set<string>();
  const deduped: Hit[] = [];
  for (const h of hits) {
    const key = dishKey(h.payload?.name);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(h);
  }
  return deduped.slice(0, want);
}

/** Recommendation needs at least one positive example. With only disliked
 * dishes, search the negated mean of their vectors instead. */
async function negatedMean(negative: (string | number)[]): Promise<number[]> {
  const result = await post(`/collections/${COLLECTION}/points/scroll`, {
    filter: { must: [{ has_id: negative }] },
    with_vector: true,
    limit: negative.length,
  });
  const vectors: number[][] = result.points.map((p: any) => p.vector);
  if (!vectors.length) throw new Error("none of the disliked dishes were found");
  return vectors[0].map((_, i) => -vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length);
}

function toProduct(hit: Hit) {
  const cafe = hit.payload.cafe ?? {};
  return {
    id: hit.id,
    name: hit.payload.name,
    description: hit.payload.description,
    image_url: hit.payload.image,
    restaurant: {
      name: cafe.name,
      rating: cafe.rating ?? null,
      location: { latitude: cafe.location?.lat, longitude: cafe.location?.lon },
      slug: cafe.slug ?? null,
      address: cafe.address ?? null,
    },
    payload: hit.payload,
    score: hit.score,
  };
}

type Req = { method?: string; body?: any };
type Res = { status(code: number): Res; json(body: unknown): void };

export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== "POST") {
    res.status(405).json({ detail: "method not allowed" });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
  const positive: (string | number)[] = body.positive ?? [];
  const negative: (string | number)[] = body.negative ?? [];
  const queries: string[] = (body.queries ?? []).filter((q: string) => q && q.trim());
  const strategy = body.strategy === "average_vector" ? "average_vector" : "best_score";
  const location = body.location ?? null;
  const limit = Math.max(1, Math.min(Number(body.limit) || DEFAULT_LIMIT, MAX_LIMIT));

  try {
    let hits: Hit[];

    if (positive.length + negative.length + queries.length === 0) {
      // The initial "discover" grid.
      hits = await grouped({ sample: "random" }, location, limit);
    } else if (positive.length === 0 && queries.length === 0) {
      hits = await grouped(await negatedMean(negative), location, limit);
    } else {
      hits = await grouped(
        {
          recommend: {
            // Typed queries ride along as text. The cluster embeds each one with
            // the CLIP text tower and treats it as another liked example, which
            // is what the old backend did after encoding it locally.
            positive: [...positive, ...queries.map((text) => ({ text, model: TEXT_MODEL }))],
            negative,
            strategy,
          },
        },
        location,
        limit,
      );
    }

    res.status(200).json(hits.map(toProduct));
  } catch (err) {
    console.error("search failed:", err);
    res.status(500).json({ detail: "Search is temporarily unavailable." });
  }
}
