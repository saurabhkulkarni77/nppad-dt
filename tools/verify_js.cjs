#!/usr/bin/env node
/*
 * Verify the browser port (js/edge.js) against the NumPy NPPAD-Edge
 * reference outputs stored in data/scenarios.json (edgeRef, computed
 * by tools/generate_data.py with the project's own PrimaryModel).
 * Writes the agreement into data/results.json -> jsVerification.
 */
const fs = require("fs");
const path = require("path");
const { EdgeModel } = require(path.join(__dirname, "..", "js", "edge.js"));

const root = path.join(__dirname, "..");
const mj = JSON.parse(fs.readFileSync(path.join(root, "data", "model.json"), "utf8"));
const bin = fs.readFileSync(path.join(root, "data", "model.bin"));
const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
const model = new EdgeModel(mj, buf);

const sc = JSON.parse(fs.readFileSync(path.join(root, "data", "scenarios.json"), "utf8"));
let agree = 0, maxDp = 0;
const rows = [];
for (const s of sc.scenarios) {
  const t0 = Date.now();
  const r = model.predict(s.window);
  const ms = Date.now() - t0;
  const ok = r.pred === s.edgeRef.pred;
  if (ok) agree++;
  let dp = 0;
  for (let j = 0; j < r.proba.length; j++)
    dp = Math.max(dp, Math.abs(r.proba[j] - s.edgeRef.proba[j]));
  maxDp = Math.max(maxDp, dp);
  rows.push({ id: s.id, js: r.pred, ref: s.edgeRef.pred, ok,
              jsConf: +r.conf.toFixed(4), refConf: +s.edgeRef.conf.toFixed(4),
              maxDp: +dp.toFixed(5), nodeMs: ms });
  console.log(`${ok ? "OK " : "DIFF"} ${s.id.padEnd(22)} js=${r.pred} (${r.conf.toFixed(3)}) ref=${s.edgeRef.pred} (${s.edgeRef.conf.toFixed(3)}) maxDp=${dp.toFixed(5)} ${ms}ms`);
}
console.log(`agreement ${agree}/${sc.scenarios.length}, max proba diff ${maxDp}`);

const rp = path.join(root, "data", "results.json");
const results = JSON.parse(fs.readFileSync(rp, "utf8"));
results.jsVerification = {
  scenariosChecked: sc.scenarios.length,
  argmaxAgreement: agree,
  maxProbaDiff: +maxDp.toFixed(5),
  detail: rows,
  note: "Browser port (js/edge.js) vs the pure NumPy NPPAD-Edge runtime, " +
        "checked at build time by tools/verify_js.cjs.",
};
fs.writeFileSync(rp, JSON.stringify(results, null, 1));
if (agree !== sc.scenarios.length) process.exit(2);
