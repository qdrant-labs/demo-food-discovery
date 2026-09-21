// Latency, results and scores against the Railway backend this replaces.
//
//   node --env-file=.env test/compare.mjs
//
// Both backends are called from this machine, interleaved, so the same network
// conditions apply to each. The new path is laptop to Qdrant; the old path is
// laptop to Railway to Qdrant. The difference is the hop being removed.
//
// The random "discover" grid is deliberately excluded from the ranking
// comparison: it samples, so two calls to the same backend disagree by design.
const OLD = process.env.OLD ?? "https://demo-food-discovery-production.up.railway.app";
const REPS = Number(process.env.REPS ?? 3);

const handler = (await import("../frontend/api/search.ts")).default;

async function callNew(body) {
  const out = {};
  const res = {
    status(c) {
      out.code = c;
      return this;
    },
    json(b) {
      out.body = b;
    },
  };
  const t = Date.now();
  await handler({ method: "POST", body }, res);
  return { ...out, ms: Date.now() - t };
}

async function callOld(body) {
  const t = Date.now();
  const r = await fetch(`${OLD}/api/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { code: r.status, body: await r.json(), ms: Date.now() - t };
}

// Text queries, the case a user actually types. Plus one id-based
// recommendation and one location-filtered query, which are the other two paths
// through the search.
const CASES = [
  { label: "spicy ramen", body: { queries: ["spicy ramen"] } },
  { label: "cheese pizza", body: { queries: ["cheese pizza"] } },
  { label: "sushi", body: { queries: ["sushi"] } },
  { label: "chocolate cake", body: { queries: ["chocolate cake"] } },
  { label: "green salad", body: { queries: ["green salad"] } },
  { label: "burger and fries", body: { queries: ["burger and fries"] } },
  { label: "thai curry", body: { queries: ["thai curry"] } },
  { label: "breakfast eggs", body: { queries: ["breakfast eggs"] } },
  { label: "grilled chicken", body: { queries: ["grilled chicken"] } },
  { label: "vegan bowl", body: { queries: ["vegan bowl"] } },
  { label: "pasta, average_vector", body: { queries: ["pasta"], strategy: "average_vector" } },
  { label: "soup near Helsinki", body: { queries: ["soup"], location: { latitude: 60.17, longitude: 24.94, radius_km: 10 } } },
];

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const mean = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
const names = (r) => (Array.isArray(r.body) ? r.body : []).map((x) => x.name);

// Warm up both paths: the first call pays a TLS handshake that would otherwise
// land in the numbers.
for (let i = 0; i < 3; i++) {
  await callNew({ queries: ["warmup"] });
  await callOld({ queries: ["warmup"] });
}

const ms = { neu: [], old: [] };
let identical = 0;
let overlapSum = 0;
let pairs = 0;
let maxScoreDelta = 0;
let worst = null;

for (const { label, body } of CASES) {
  let n, o;
  for (let r = 0; r < REPS; r++) {
    if (r % 2 === 0) {
      n = await callNew(body);
      o = await callOld(body);
    } else {
      o = await callOld(body);
      n = await callNew(body);
    }
    if (n.code !== 200 || o.code !== 200) {
      console.log(`  error ${label}: new ${n.code} ${JSON.stringify(n.body).slice(0, 120)}, old ${o.code}`);
      continue;
    }
    ms.neu.push(n.ms);
    ms.old.push(o.ms);
  }
  if (!n?.body || !o?.body) continue;

  const a = names(n);
  const b = names(o);
  pairs++;
  if (JSON.stringify(a) === JSON.stringify(b)) identical++;
  const shared = a.filter((x) => b.includes(x)).length;
  overlapSum += shared / Math.max(1, b.length);

  const oldScore = new Map((Array.isArray(o.body) ? o.body : []).map((x) => [x.name, x.score]));
  for (const row of Array.isArray(n.body) ? n.body : []) {
    if (!oldScore.has(row.name)) continue;
    const d = Math.abs(row.score - oldScore.get(row.name));
    if (d > maxScoreDelta) {
      maxScoreDelta = d;
      worst = `${label} / ${row.name}`;
    }
  }

  console.log(
    `${label.padEnd(24)} ${String(a.length).padStart(2)} results  ${String(n.ms).padStart(5)}ms` +
      ` | old ${String(o.ms).padStart(5)}ms | ${shared}/${b.length} shared` +
      `${JSON.stringify(a) === JSON.stringify(b) ? ", same order" : ""}`,
  );
}

console.log("\n=== latency, ms (measured from this machine) ===");
console.log(`new  p50 ${pct(ms.neu, 50)}  p95 ${pct(ms.neu, 95)}  mean ${mean(ms.neu)}   (n=${ms.neu.length})`);
console.log(`old  p50 ${pct(ms.old, 50)}  p95 ${pct(ms.old, 95)}  mean ${mean(ms.old)}   (n=${ms.old.length})`);

console.log("\n=== results ===");
console.log(`identical order: ${identical}/${pairs}`);
console.log(`mean overlap:    ${(overlapSum / pairs).toFixed(3)}`);
console.log(`max score delta: ${maxScoreDelta.toExponential(2)}${worst ? `  (${worst})` : ""}`);
