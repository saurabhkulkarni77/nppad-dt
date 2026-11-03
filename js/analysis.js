"use strict";
header("analysis"); footer();
const $ = (id) => document.getElementById(id);
const WS = ["30", "60", "120", "300", "600"];
const MODELS = ["LogReg", "LogReg+", "Random Forest", "CNN", "GRU",
                "MultiRocket+HYDRA", "Rocket", "MiniRocket"];
const CLASSES = ["LOCA", "LOCAC", "SLBIC", "SLBOC", "SGATR", "SGBTR",
                 "RW", "RI", "FLB", "MD", "LR", "LLB"];

function gridTable(grid) {
  const head = `<tr><th>MODEL</th>${WS.map((w) =>
    `<th style="text-align:right">W = ${w} S</th>`).join("")}</tr>`;
  const rows = MODELS.map((m) => `<tr><td>${m}</td>${WS.map((w) => {
    const c = grid[m] && grid[m][w];
    return `<td class="num">${c ? fmt(c.macroF1, 3) : "n/a"}</td>`;
  }).join("")}</tr>`).join("");
  return `<table class="tel"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function drawCeiling(a) {
  const c = a.ceiling;
  const rf = a.grid_t0_20_realistic["Random Forest"]["60"].macroF1;
  $("ceiling").innerHTML = `
    <p><b>The tie.</b> At t0 = 20 s and W = 60 s, ${c.modelsAtCeilingW60} of the 8
    models score exactly ${fmt(c.bestMacroF1, 6)} macro F1; Random Forest scores
    ${fmt(rf, 6)}. At W = 30 s the picture is the same.</p>
    <p><b>Why it happens.</b> The plant does not respond at 20 s: the recorded
    response begins at about t = 100 s, after these windows have already ended.
    Across all 1,211 runs, the W = 60 s window at this placement takes only
    ${c.distinctWindowsW60} distinct values, so most test windows are identical to
    a training window carrying a different label. No model can find a signal that
    is not in the data yet.</p>`;
}

function drawOracle(a) {
  const o = a.oracle;
  const rows = MODELS.map((m) => {
    const v = o.perModelW60[m];
    return `<tr><td>${m}</td><td class="num">${fmt(v.all, 3)}</td>
      <td class="num">${fmt(v.realistic, 3)}</td>
      <td class="num">${fmt(v.drop, 3)}</td></tr>`;
  }).join("");
  $("oracle").innerHTML = `
    <table class="tel"><thead><tr><th>MODEL</th>
      <th style="text-align:right">ALL 96</th>
      <th style="text-align:right">REALISTIC 88</th>
      <th style="text-align:right">DROP</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p style="margin-top:8px">Macro F1 at t0 = 100 s, W = 60 s. Dropping the 8
    oracle leak channels costs at most ${fmt(o.maxDropW60, 3)} for any model, and
    the mean gain from keeping them, averaged over models and window lengths at
    t0 = 100 s, is ${fmt(o.meanGainAllWindows, 3)}. The realistic sensor set
    already carries nearly all of the signal, and the headline results need no
    leaked information.</p>`;
}

function drawGrowth(a) {
  const g = a.growth;
  $("growth").innerHTML = `
    <p><b>Thirty seconds is nearly enough, once the plant has responded.</b> At
    t0 = 100 s and W = 30 s, realistic macro F1 already runs from
    ${fmt(g.w30RealisticMin, 3)} (LogReg) to ${fmt(g.w30RealisticMax, 3)}
    (MiniRocket) across the eight models.</p>
    <p><b>Placement beats length.</b> At t0 = 20 s the scores sit on the ceiling
    until W = 120 s, the first window that reaches past the response onset, where
    they jump to ${fmt(g.t0_20_W120_min, 3)} to ${fmt(g.t0_20_W120_max, 3)} for the
    models the combined grid carries at that window. Extending the window beyond
    120 s at t0 = 100 s buys any model at most a further
    ${fmt(g.maxGainBeyond120, 3)}. The practical problem is where the window
    starts, not how long it is.</p>
    <div style="margin-top:8px">${gridTable(a.grid_t0_20_realistic)}</div>
    <p class="dim small">The t0 = 20 s realistic grid (macro F1). The combined
    results file carries the three kernel models at this protocol at W = 60 s
    only; those cells are marked n/a rather than filled in.</p>`;
}

function matrixTable(M) {
  const head = `<tr><th></th>${CLASSES.map((c) =>
    `<th style="text-align:right">${c.slice(0, 4)}</th>`).join("")}</tr>`;
  const rows = M.map((row, i) => `<tr><td>${CLASSES[i]}</td>${row.map((v, j) =>
    `<td class="num" style="${i === j ? "color:var(--cyan)" : v > 0 ? "color:var(--amber)" : ""}">${v || ""}</td>`).join("")}</tr>`).join("");
  return `<table class="tel"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function drawConfusion(a) {
  const cf = a.confusionRF;
  const per = Object.entries(cf.t0_100.perClassCorrect).map(([c, v]) =>
    `<tr><td>${c}</td><td class="num">${v.correct}</td>
     <td class="num">${v.total}</td></tr>`).join("");
  const errs = Object.entries(cf.t0_100.topErrors).map(([k, v]) =>
    `<div class="kv"><span class="k">${k}</span><span class="v">${v} RUNS</span></div>`).join("");
  $("confusion").innerHTML = `
    <div class="grid g2">
      <div>
        <p><b>Conventional placement collapses.</b> At t0 = 20 s the Random Forest
        scores ${fmt(cf.t0_20.macroF1, 3)} macro F1 on ${cf.t0_20.n} test windows:
        the matrix below is the onset aligned one; at the early placement most
        classes are swept into a couple of labels and the score sits on the
        ceiling.</p>
        <p><b>Onset aligned placement is nearly diagonal.</b> At t0 = 100 s the same
        model scores ${fmt(cf.t0_100.macroF1, 3)} macro F1 on ${cf.t0_100.n} test
        windows, and the residual errors are structured, not random (top errors
        below).</p>
        <h3 style="margin-top:12px">TOP RESIDUAL ERRORS, T0 = 100 S</h3>
        ${errs}
      </div>
      <div>
        <h3>CORRECT RUNS PER CLASS, T0 = 100 S</h3>
        <table class="tel"><thead><tr><th>TRUE CLASS</th>
          <th style="text-align:right">CORRECT</th>
          <th style="text-align:right">TOTAL</th></tr></thead>
          <tbody>${per}</tbody></table>
        <p class="dim small" style="margin-top:6px">Weakest class:
        ${cf.t0_100.weakestClass}, with
        ${cf.t0_100.perClassCorrect[cf.t0_100.weakestClass].correct} of
        ${cf.t0_100.perClassCorrect[cf.t0_100.weakestClass].total} runs correct.</p>
      </div>
    </div>
    <h3 style="margin-top:14px">CONFUSION MATRIX, T0 = 100 S (ROWS: TRUE CLASS, COLUMNS: PREDICTED)</h3>
    ${matrixTable(cf.t0_100.matrix)}`;
}

function drawHardPairs(a) {
  const hp = a.hardPairs;
  const rows = Object.entries(hp).map(([pair, byModel]) =>
    Object.entries(byModel).map(([m, byW], i) =>
      `<tr>${i === 0 ? `<td rowspan="2">${pair}</td>` : ""}<td>${m}</td>${WS.map((w) =>
        `<td class="num">${byW[w] !== undefined ? fmt(byW[w], 3) : "n/a"}</td>`).join("")}</tr>`).join("")).join("");
  $("hardpairs").innerHTML = `
    <table class="tel"><thead><tr><th>PAIR</th><th>MODEL</th>${WS.map((w) =>
      `<th style="text-align:right">${w}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table>`;
}

function drawRamps(a) {
  const t = a.ramps.table;
  const order = ["LogReg", "LogReg+", "Random Forest", "CNN", "GRU"];
  const rows = order.filter((m) => t[m]).map((m) =>
    `<tr><td>${m}</td>${WS.map((w) =>
      `<td class="num">${t[m][w] ? fmt(t[m][w].rampF1, 3) : "n/a"}</td>`).join("")}</tr>`).join("");
  const [lo, hi] = a.ramps.degradationRangeW120Plus;
  const [bf, bm, bw] = a.ramps.best;
  $("ramps").innerHTML = `
    <table class="tel"><thead><tr><th>MODEL</th>${WS.map((w) =>
      `<th style="text-align:right">${w}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table>
    <p style="margin-top:8px">At W = 120 s and longer, ramp scores fall
    ${fmt(lo, 2)} to ${fmt(hi, 2)} below the same models' standard test scores.
    The best ramp score anywhere in the table is ${fmt(bf, 3)} (${bm},
    W = ${bw} s). A classifier trained only on standard onsets does not carry
    across power manoeuvres.</p>`;
}

function drawUnknown(a) {
  const sig = a.unknown.signals;
  const rf = sig.filter((s) => s.signal.startsWith("RF entropy"));
  const cnn = sig.find((s) => s.signal.startsWith("CNN MC-dropout") && s.W === 600);
  const rows = rf.map((s) =>
    `<tr><td class="num">${s.W}</td><td class="num">${fmt(s.auroc, 3)}</td>
     <td class="num">${fmt(s.detectionRate, 2)}</td>
     <td class="num">${fmt(s.fpr, 3)}</td></tr>`).join("");
  $("unknown").innerHTML = `
    <p>Setup: LOCAC is held out of training entirely and the models are retrained
    on the remaining 11 classes. The alarm threshold is the 95th percentile of
    validation entropy. Signal: Random Forest entropy, all variables.</p>
    <table class="tel"><thead><tr><th>W (S)</th>
      <th style="text-align:right">AUROC</th>
      <th style="text-align:right">DETECTION RATE</th>
      <th style="text-align:right">FALSE POSITIVE RATE</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p style="margin-top:8px">At W = 120 s the held out class is flagged every
    time, at a false positive rate of ${fmt(rf[0].fpr, 3)}. As W grows the same
    signal fades: with more signal, LOCAC is absorbed into LOCA, its known twin.
    ${cnn ? `The CNN MC dropout signal is worse than uninformative at W = 600 s
    (AUROC ${fmt(cnn.auroc, 3)}): the held out class is classified more
    confidently than the known classes.` : ""}</p>`;
}

(async () => {
  const a = await loadJSON("data/analysis.json");
  $("grid100").innerHTML = gridTable(a.grid_t0_100_realistic);
  drawCeiling(a);
  drawOracle(a);
  drawGrowth(a);
  drawConfusion(a);
  drawHardPairs(a);
  drawRamps(a);
  drawUnknown(a);
})();
