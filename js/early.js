"use strict";
header("early"); footer();

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function tel(headers, rows) {
  const th = headers.map(h => `<th>${h}</th>`).join("");
  return `<table class="tel"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}
function num(x, d = 3) { return `<td class="num">${fmt(x, d)}</td>`; }
function oneLiner(t) {
  return t ? `<div class="dim small" style="letter-spacing:0;margin-top:2px">${esc(t)}</div>` : "";
}
function int(x) { return Number(x).toLocaleString("en-US"); }
function statBox(k, v) {
  return `<div class="hudbox"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`;
}

async function init() {
  const D = await loadJSON("data/early_study.json");
  const P = D.problem, C = D.census;

  document.getElementById("taskLine").textContent =
    `Two experiments asked whether anything can beat the early score — naming the accident ` +
    `from the window that starts 20 seconds into the run (TIME 20–70). The short answer is no, ` +
    `and the second experiment proves why: in that window, the accident has not started yet.`;
  document.getElementById("protocolLine").textContent =
    `Same protocol as the rest of the study: ${D.classes.length} accident classes, ` +
    `${D.windowSteps} samples per window (60 s at 10 s spacing), the ${D.nChannels} study channels, ` +
    `seed ${D.seed}. Every method is scored twice: on the same frozen 48 windows the whole study ` +
    `uses, and on the full held out test split (244 windows).`;

  // ---- the problem -------------------------------------------------------
  document.getElementById("problemText").textContent = P.explanation;
  document.getElementById("problemStats").innerHTML =
    `<div class="hud" style="margin:10px 0">` +
    statBox("DISTINCT EARLY WINDOWS, ALL RUNS", `${P.distinctWindows}`) +
    statBox("RUNS COUNTED", `${int(P.totalRuns)}`) +
    statBox("BEST POSSIBLE, FROZEN 48", `${C.ceilingFrozen.correct}/${C.ceilingFrozen.n} = ${fmt(C.ceilingFrozen.acc, 3)}`) +
    statBox("BEST POSSIBLE, FULL TEST", `${C.ceilingFull.correct}/${C.ceilingFull.n} = ${fmt(C.ceilingFull.acc, 3)}`) +
    `</div>` +
    `<p class="dim small">The count of distinct windows is ${P.distinctWindows} at every check: ` +
    `in the study pipeline's numbers, recounted at full precision in the ${D.nChannels} study ` +
    `channels, and recounted again across all ${D.nRawChannels} raw channels the simulator records.</p>`;

  // ---- experiment 1: augmentation ---------------------------------------
  document.getElementById("techPipe").innerHTML = D.aug.techniques.map((t, i) =>
    `<div class="step"><div class="n">TECHNIQUE ${i + 1}</div><div class="t">${esc(t.name)}</div>` +
    `<div class="d">${esc(t.oneliner)}</div></div>`).join("");
  const ac = D.aug.counts;
  document.getElementById("augCounts").textContent =
    `Before: ${int(ac.beforeTotal)} training windows, ${ac.beforeMin}–${ac.beforeMax} per class — the ` +
    `imbalance was mild. After: exactly ${ac.targetPerClass} per class, ${int(ac.augmentedTotal)} in ` +
    `total (×${ac.augFactor}), originals always included. A balanced only set (${int(ac.balancedOnlyTotal)} ` +
    `windows, topped up with plain copies) separates the effect of balancing from the effect of ` +
    `augmentation itself.`;
  document.getElementById("augTable").innerHTML = tel(
    ["MODEL AND TRAINING SET", "FROZEN 48 ACC", "FROZEN 48 F1", "FULL TEST ACC", "FULL TEST F1"],
    D.aug.arms.map(a => `<tr><td><b>${esc(a.model)} — ${esc(a.condition)}</b>${oneLiner(a.oneliner)}</td>` +
      `${num(a.frozen48.acc)}${num(a.frozen48.macroF1)}${num(a.fulltest.acc)}${num(a.fulltest.macroF1)}</tr>`).join(""));
  document.getElementById("onsetTable").innerHTML = tel(
    ["MODEL AND TRAINING SET", "FROZEN 48 ACC", "FROZEN 48 F1", "FULL TEST ACC", "FULL TEST F1"],
    D.aug.onsetArms.map(a => `<tr><td><b>${esc(a.model)} — ${esc(a.condition)}</b></td>` +
      `${num(a.frozen48.acc)}${num(a.frozen48.macroF1)}${num(a.fulltest.acc)}${num(a.fulltest.macroF1)}</tr>`).join(""));

  // ---- diagnosis ----------------------------------------------------------
  document.getElementById("diagTable").innerHTML = tel(
    ["MEASUREMENT", "EARLY (t0 = 20)", "ONSET (t0 = 100)"],
    D.diagnostics.map(r => `<tr><td><b>${esc(r.label)}</b>${oneLiner(r.oneliner)}</td>` +
      `${num(r.t0_20)}${num(r.t0_100)}</tr>`).join(""));

  // ---- experiment 2: twelve arms ------------------------------------------
  document.getElementById("boostTable").innerHTML = tel(
    ["ARM", "FROZEN 48 ACC", "FROZEN 48 F1", "FULL TEST ACC", "FULL TEST F1"],
    D.boost.arms.map(a => `<tr><td><b>${esc(a.name)}</b>` +
      (a.variant ? ` <span class="tag amber">EXPANDED CHANNEL VARIANT</span>` : "") +
      `${oneLiner(a.oneliner)}</td>` +
      `${num(a.frozen48.acc)}${num(a.frozen48.macroF1)}${num(a.fulltest.acc)}${num(a.fulltest.macroF1)}</tr>`).join(""));

  document.getElementById("armDetails").innerHTML = D.boost.arms.map(a => {
    let extra = "";
    if (a.groups) extra += `<p class="dim small">Groups used: ` +
      a.groups.map(g => `{${g.join(", ")}}`).join(" · ") + `.</p>`;
    if (a.augmentedTrainTotal) extra += `<p class="dim small">Augmented training set: ` +
      `${int(a.augmentedTrainTotal)} windows.</p>`;
    return `<details style="margin:8px 0"><summary><b>${esc(a.name)}</b> ` +
      `<span class="dim small">(${esc(a.kind)} — frozen F1 ${fmt(a.frozen48.macroF1, 3)})</span></summary>` +
      `<p class="dim small" style="white-space:pre-wrap">${esc(a.recipe)}</p>${extra}</details>`;
  }).join("");

  // ---- the proof ------------------------------------------------------------
  document.getElementById("censusTable").innerHTML = tel(
    ["DISTINCT WINDOW", "RUNS", "CLASSES SHARING IT"],
    C.groups.map(g => {
      const names = Object.entries(g.classes).map(([k, v]) => `${k} ${v}`).join(" · ");
      const pure = Object.keys(g.classes).length === 1;
      return `<tr><td><b>${esc(g.label)}</b></td><td class="num">${g.nRuns}</td>` +
        `<td class="dim small">${esc(names)}${pure ? " — one class only, a pure window" : ""}</td></tr>`;
    }).join(""));
  document.getElementById("ceilingStats").innerHTML =
    `<div class="hud">` +
    statBox("BAYES CEILING, FROZEN 48", `${C.ceilingFrozen.correct} of ${C.ceilingFrozen.n} = ${fmt(C.ceilingFrozen.acc, 4)}`) +
    statBox("BAYES CEILING, FULL TEST", `${C.ceilingFull.correct} of ${C.ceilingFull.n} = ${fmt(C.ceilingFull.acc, 4)}`) +
    statBox("WHAT THE BASELINE SCORES", `${fmt(D.boost.arms[0].frozen48.acc, 4)} / ${fmt(D.boost.arms[0].fulltest.acc, 4)}`) +
    `</div>`;
  document.getElementById("perClassTable").innerHTML = tel(
    ["CLASS", "BEST ARM, FULL TEST F1"],
    D.boost.bestPerClassF1Fulltest.map(r => `<tr><td>${esc(r.class)}</td>${num(r.f1)}</tr>`).join(""));

  // ---- what this means ------------------------------------------------------
  const meaning = [
    ["Call “early” relative to the accident, not the clock.",
     "t0 = 20 measures 30–80 seconds before anything happens. An honest early detection " +
     "protocol anchors windows to initiation (about TIME 100) with small positive offsets — " +
     "t0 = 100, 110, 120 — trading a few seconds of delay for windows that contain the " +
     "transient's first seconds."],
    ["Print the ceiling next to the early score.",
     "Any pre initiation score should be shown beside its Bayes ceiling, so the t0 = 20 " +
     "column reads as “at ceiling” rather than “every method fails”. On this page's " +
     "protocol the baseline is already at that ceiling."],
    ["The scope of the proof, stated plainly.",
     "This ceiling is proven for the trained model benchmark protocol — the frozen 48 " +
     "windows and the full test split used here. The language model study on the LLM page " +
     "used its own window draw, so this exact cap is not claimed for those arms."],
    ["One caveat about the simulator.",
     "The shared plateau is a property of this dataset's simulator output. Real plant " +
     "data would carry sensor noise, so no two windows would be bit identical — but the " +
     "pre initiation signal would still be absent, and the practical conclusion is the " +
     "same. Both experiments ran the study's single fixed seed; the ceiling itself is a " +
     "counting argument, so no seed choice can move it."],
  ];
  document.getElementById("meaningList").innerHTML = meaning.map(([h, t]) =>
    `<h4>${esc(h)}</h4><p class="dim small">${esc(t)}</p>`).join("");
}
init();

// ---- entire run classification (2026-11-23 study) -------------------------
async function initEntireRun() {
  let E;
  try { E = await loadJSON("data/entire_run_study.json"); } catch (e) { return; }
  const P = E.protocol, R = E.references;
  const best = E.results[0];
  document.getElementById("entireRunStats").innerHTML =
    `<div class="hud" style="margin:10px 0">` +
    statBox("RUNS IN THE STUDY", `${int(P.nRuns)}`) +
    statBox("HELD OUT TEST RUNS", `${int(P.nTest)}`) +
    statBox("BEST ENTIRE RUN ACCURACY", `${fmt(best.accuracy, 4)}`) +
    statBox("BEST ENTIRE RUN MACRO F1", `${fmt(best.macroF1, 4)}`) +
    statBox("EARLY CEILING AT t0 = 20", `${fmt(R.earlyCeilingAcc, 4)} ACC / ${fmt(R.earlyCeilingF1, 4)} F1`) +
    statBox("ONSET REFERENCE MACRO F1", `${fmt(R.onsetMacroF1, 3)}`) +
    `</div>`;
  document.getElementById("entireRunTable").innerHTML = tel(
    ["MODEL", "TEST ACCURACY, PER RUN", "TEST MACRO F1, PER RUN"],
    E.results.map(r => `<tr><td><b>${esc(r.model)}</b></td>${num(r.accuracy, 4)}${num(r.macroF1, 4)}</tr>`).join(""));
  const notes = E.results.filter(r => r.note);
  if (notes.length) {
    document.getElementById("entireRunTable").innerHTML += notes.map(r =>
      `<p class="dim small">Compute note, ${esc(r.model)}: ${esc(r.note)}</p>`).join("");
  }
  const fr = E.fractionModels;
  const rowsF = [0.25, 0.5, 0.75, 1].map(f => {
    const cells = fr.map(m => {
      const p = E.fractionCurve[m].find(q => Math.abs(q.fraction - f) < 1e-9);
      return `${num(p.accuracy, 4)}${num(p.macroF1, 4)}`;
    }).join("");
    return `<tr><td><b>${Math.round(f * 100)}%</b></td>${cells}</tr>`;
  }).join("");
  document.getElementById("fractionTable").innerHTML = tel(
    ["OBSERVED FRACTION OF EACH RUN", ...fr.flatMap(m => [`${m} ACC`, `${m} F1`])],
    rowsF);
  document.getElementById("entireRunPerClass").innerHTML = tel(
    ["CLASS", `${esc(E.bestModel)} F1, ENTIRE RUN`],
    E.bestPerClassF1.map(r => `<tr><td>${esc(r.class)}</td>${num(r.f1, 4)}</tr>`).join(""));
}
initEntireRun();
