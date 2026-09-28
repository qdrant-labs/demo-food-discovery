/**
 * GET /api/locations
 *
 * A coarse map of where the dataset actually has dishes: sample random points
 * and bucket their restaurant coordinates into a ~0.1 degree grid, so the
 * frontend can draw an honest coverage preview instead of guessing cities.
 */

const BASE = (process.env.QDRANT_URL ?? "").replace(/\/+$/, "");
const API_KEY = process.env.QDRANT_API_KEY ?? "";
const COLLECTION = process.env.QDRANT_COLLECTION || "wolt-clip-ViT-B-32";
const TIMEOUT_MS = Number(process.env.QDRANT_TIMEOUT_MS ?? 20000);

// The sample is the same for everyone and costs a scan, so hold it for the life
// of the function instance. The old backend cached it in a module global too.
let cached: { points: unknown[]; sampled: number } | null = null;

type Req = { query?: Record<string, string | string[] | undefined> };
type Res = { status(code: number): Res; json(body: unknown): void };

export default async function handler(req: Req, res: Res) {
  if (cached) {
    res.status(200).json(cached);
    return;
  }

  const asked = Number(req.query?.sample ?? 3000);
  const limit = Math.max(100, Math.min(Number.isFinite(asked) ? asked : 3000, 5000));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE}/collections/${COLLECTION}/points/query`, {
      method: "POST",
      headers: { "api-key": API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        query: { sample: "random" },
        limit,
        with_payload: { include: ["cafe.location"] },
        with_vector: false,
      }),
      signal: controller.signal,
    });
    const payload: any = await r.json();
    if (!r.ok || !payload.result) {
      throw new Error(payload?.status?.error ?? `Qdrant returned ${r.status}`);
    }

    const cells = new Map<string, { lat: number; lon: number; count: number }>();
    for (const p of payload.result.points) {
      const loc = p.payload?.cafe?.location;
      if (loc?.lat == null || loc?.lon == null) continue;
      const lat = Math.round(loc.lat * 10) / 10;
      const lon = Math.round(loc.lon * 10) / 10;
      const key = `${lat},${lon}`;
      const cell = cells.get(key);
      if (cell) cell.count++;
      else cells.set(key, { lat, lon, count: 1 });
    }

    cached = { points: [...cells.values()], sampled: payload.result.points.length };
    res.status(200).json(cached);
  } catch (err) {
    console.error("locations failed:", err);
    res.status(500).json({ detail: `${err}`.slice(0, 200) });
  } finally {
    clearTimeout(timer);
  }
}
