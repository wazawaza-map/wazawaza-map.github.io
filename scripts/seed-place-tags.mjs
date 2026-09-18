// Dry run by default. Apply: node --env-file=.env --experimental-strip-types scripts/seed-place-tags.mjs --apply
import { normalizeTag } from "../src/tags.ts";

const url = (process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Set VITE_SUPABASE_URL and SUPABASE_SECRET_KEY (never a VITE_ secret).");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const seeds = [
  // https://visit-abashiri.jp/feature/event/87ad1e140096b3294aa4f5d6077f90fa8b1f9390.html
  { id: 636, name: "網走監獄", tags: ["anime", "work-golden-kamuy"] },
  // https://www.town.karumai.iwate.jp/article/docs/kouhou/2016/kg-k%202811-0120.pdf
  { id: 42, name: "軽米", tags: ["anime", "work-haikyu"] },
];
const apply = process.argv.includes("--apply");
const arrayLiteral = values => `{${values.map(value => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
let offset = 0;
let changed = 0;
const found = new Set();
while (true) {
  const params = new URLSearchParams({ select: "id,tags,place_translations(name)", order: "id", limit: "500", offset: String(offset) });
  const response = await fetch(`${url}/rest/v1/places?${params}`, { headers });
  if (!response.ok) throw new Error(`Read failed: ${response.status} ${await response.text()}`);
  const rows = await response.json();
  if (!rows.length) break;
  offset += rows.length;
  for (const place of rows) {
    const seed = seeds.find(seed => seed.id === place.id);
    if (seed && !place.place_translations.some(t => t.name.includes(seed.name))) throw new Error(`Place #${place.id} name does not match seed`);
    if (seed) found.add(seed.id);
    const previous = place.tags || [];
    const tags = [...new Set([...previous.map(normalizeTag), ...(seed?.tags || [])])];
    if (JSON.stringify(previous) === JSON.stringify(tags)) continue;
    console.log(`${apply ? "UPDATE" : "WOULD UPDATE"} #${place.id}: ${JSON.stringify(tags)}`);
    if (apply) {
      // Optimistic guard: don't overwrite tags edited after we read them.
      const patchParams = new URLSearchParams({ id: `eq.${place.id}`, tags: place.tags == null ? "is.null" : `eq.${arrayLiteral(previous)}`, select: "id" });
      const patch = await fetch(`${url}/rest/v1/places?${patchParams}`, { method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify({ tags }) });
      if (!patch.ok) throw new Error(`Update #${place.id}: ${patch.status} ${await patch.text()}`);
      if ((await patch.json()).length !== 1) throw new Error(`Place #${place.id} changed concurrently; retry after reviewing it.`);
    }
    changed++;
  }
}
for (const seed of seeds) if (!found.has(seed.id)) throw new Error(`Seed #${seed.id} not found`);
console.log(`${apply ? "Updated" : "Planned"}: ${changed} places`);
