// "Stay curious" experiment: read every bill photo in a folder with two models and compare.
//   npm run ai:compare -- ./bills
// Put an expected.json next to the photos to score accuracy: { "bill1.jpg": 35.2, ... }
// (day rate in cents per kWh, as printed). Models come from OPENROUTER_MODEL and
// OPENROUTER_COMPARE_MODEL, or pass them: npm run ai:compare -- ./bills modelA modelB
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { config } from "../src/config.js";
import { readBill } from "../src/ai.js";

const [folder, modelA = config.openRouterModel, modelB = config.openRouterCompareModel] = process.argv.slice(2);
if (!folder) {
  console.error("Usage: npm run ai:compare -- <folder-of-bill-photos> [modelA] [modelB]");
  process.exit(1);
}
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const files = readdirSync(folder).filter((f) => MIME[extname(f).toLowerCase()]);
const expectedPath = join(folder, "expected.json");
const expected: Record<string, number> = existsSync(expectedPath) ? JSON.parse(readFileSync(expectedPath, "utf8")) : {};

const score: Record<string, { exact: number; read: number; ms: number }> = {
  [modelA]: { exact: 0, read: 0, ms: 0 },
  [modelB]: { exact: 0, read: 0, ms: 0 },
};

for (const file of files) {
  const image = readFileSync(join(folder, file));
  const row: string[] = [file];
  for (const model of [modelA, modelB]) {
    const t = Date.now();
    try {
      const r = await readBill(image, MIME[extname(file).toLowerCase()], model);
      score[model].ms += Date.now() - t;
      if (r.dayRateCents !== null) score[model].read++;
      const want = expected[file];
      const exact = want !== undefined && r.dayRateCents !== null && Math.abs(r.dayRateCents - want) < 0.05;
      if (exact) score[model].exact++;
      row.push(`${r.dayRateCents ?? "-"}c (conf ${r.confidence})${want !== undefined ? (exact ? " ✓" : " ✗") : ""}`);
    } catch (err) {
      score[model].ms += Date.now() - t;
      row.push(`failed: ${(err as Error).message.slice(0, 60)}`);
    }
  }
  console.log(row.join("  |  "));
}

console.log("\nModel | read a rate | exactly right | avg seconds");
for (const [model, s] of Object.entries(score)) {
  const graded = Object.keys(expected).length;
  console.log(`${model} | ${s.read}/${files.length} | ${graded ? `${s.exact}/${graded}` : "no expected.json"} | ${(s.ms / Math.max(files.length, 1) / 1000).toFixed(1)}`);
}
