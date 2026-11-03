"use strict";
header("ml"); footer();
/* $ comes from js/ml.js, loaded before this file on ml.html. */
const WS = ["30", "60", "120", "300", "600"];
const MODELS = ["LogReg", "LogReg+", "Random Forest", "CNN", "GRU",
                "MultiRocket+HYDRA", "Rocket", "MiniRocket"];
const CLASSES = ["LOCA", "LOCAC", "SLBIC", "SLBOC", "SGATR", "SGBTR",
                 "RW", "RI", "FLB", "MD", "LR", "LLB"];

function gridTable(grid) {
  const head = `<tr><th>PROGRAM</th>${WS.map((w) =>
    `<th style="text-align:right">${w} S WINDOW</th>`).join("")}</tr>`;
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
    <p><b>Every program ends up tied.</b> With windows starting at 20 seconds and
    lasting 60 seconds, ${c.modelsAtCeilingW60} of the 8 programs score exactly
    ${fmt(c.bestMacroF1, 6)}; Random Forest scores ${fmt(rf, 6)}. With 30 second
    windows the picture is the same.</p>
    <p><b>Why it happens.</b> At 20 seconds the plant has not responded yet: the
    recorded response only begins at about 100 seconds, after these windows have
    already ended. Across all 1,211 runs, the 60 second window at this position
    takes only ${c.distinctWindowsW60} distinct values, so most test windows are
    exact copies of training windows that carry a different accident label. No
    program can find a signal that is not in the data yet.</p>`;
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
    <table class="tel"><thead><tr><th>PROGRAM</th>
      <th style="text-align:right">ALL 96 CHANNELS</th>
      <th style="text-align:right">HONEST 88</th>
      <th style="text-align:right">SCORE LOST</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p style="margin-top:8px">Scores with windows starting at 100 seconds and
    lasting 60 seconds. Dropping the 8 oracle channels costs at most
    ${fmt(o.maxDropW60, 3)} for any program, and the average gain from keeping
    them, across programs and window lengths, is only
    ${fmt(o.meanGainAllWindows, 3)}. The honest sensor set already carries nearly
    all of the signal, so the headline results need no leaked information.</p>`;
}

function drawGrowth(a) {
  const g = a.growth;
  $("growth").innerHTML = `
    <p><b>Thirty seconds is nearly enough, once the plant has responded.</b> With
    windows starting at 100 seconds and lasting 30 seconds, scores already run
    from ${fmt(g.w30RealisticMin, 3)} (LogReg) to ${fmt(g.w30RealisticMax, 3)}
    (MiniRocket) across the eight programs.</p>
    <p><b>Where the window starts beats how long it is.</b> Starting at 20 seconds,
    scores sit on the low ceiling until the window lasts 120 seconds, the first
    length that reaches past the moment the plant starts responding, where they
    jump to between ${fmt(g.t0_20_W120_min, 3)} and ${fmt(g.t0_20_W120_max, 3)}.
    Making the window longer than 120 seconds, at a 100 second start, buys any
    program at most a further ${fmt(g.maxGainBeyond120, 3)}. The real problem is
    where the window starts, not how long it is.</p>
    <div style="margin-top:8px">${gridTable(a.grid_t0_20_realistic)}</div>
    <p class="dim small">The early start table: scores for windows starting at
    20 seconds, honest 88 channels. The study's combined results only carry the
    three shape matching programs at this start position for the 60 second window;
    the missing cells are marked n/a rather than filled in.</p>`;
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
        <p><b>Started too early, it collapses.</b> With windows starting at
        20 seconds, Random Forest scores ${fmt(cf.t0_20.macroF1, 3)} on
        ${cf.t0_20.n} test windows: almost every accident gets swept into one or
        two labels, and the score sits on the ceiling described above. (The table
        below is for the 100 second start.)</p>
        <p><b>Started when the accident starts, it is nearly perfect.</b> At a
        100 second start, the same program scores ${fmt(cf.t0_100.macroF1, 3)} on
        ${cf.t0_100.n} test windows, and its few remaining mistakes follow a
        pattern, listed below.</p>
        <h3 style="margin-top:12px">ITS MOST COMMON MISTAKES (100 S START)</h3>
        ${errs}
      </div>
      <div>
        <h3>RUNS IT GOT RIGHT, PER ACCIDENT (100 S START)</h3>
        <table class="tel"><thead><tr><th>WHAT REALLY HAPPENED</th>
          <th style="text-align:right">RIGHT</th>
          <th style="text-align:right">TOTAL RUNS</th></tr></thead>
          <tbody>${per}</tbody></table>
        <p class="dim small" style="margin-top:6px">Its weakest accident:
        ${cf.t0_100.weakestClass}, with
        ${cf.t0_100.perClassCorrect[cf.t0_100.weakestClass].correct} of
        ${cf.t0_100.perClassCorrect[cf.t0_100.weakestClass].total} runs right.</p>
      </div>
    </div>
    <h3 style="margin-top:14px">THE FULL TABLE OF CONFUSIONS (ROWS: WHAT REALLY HAPPENED, COLUMNS: WHAT IT SAID)</h3>
    ${matrixTable(cf.t0_100.matrix)}`;
}

function drawHardPairs(a) {
  const hp = a.hardPairs;
  const rows = Object.entries(hp).map(([pair, byModel]) =>
    Object.entries(byModel).map(([m, byW], i) =>
      `<tr>${i === 0 ? `<td rowspan="2">${pair}</td>` : ""}<td>${m}</td>${WS.map((w) =>
        `<td class="num">${byW[w] !== undefined ? fmt(byW[w], 3) : "n/a"}</td>`).join("")}</tr>`).join("")).join("");
  $("hardpairs").innerHTML = `
    <table class="tel"><thead><tr><th>ACCIDENT PAIR</th><th>PROGRAM</th>${WS.map((w) =>
      `<th style="text-align:right">${w} S</th>`).join("")}</tr></thead>
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
    <table class="tel"><thead><tr><th>PROGRAM</th>${WS.map((w) =>
      `<th style="text-align:right">${w} S</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table>
    <p style="margin-top:8px">At windows of 120 seconds and longer, the ramp
    scores fall ${fmt(lo, 2)} to ${fmt(hi, 2)} below the same programs' normal
    test scores. The best ramp score anywhere in the table is ${fmt(bf, 3)}
    (${bm}, at a ${bw} s window). A program trained only on sudden accidents does
    not carry over to slow power changes.</p>`;
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
    <p>How the test works: the LOCAC accident (loss of coolant, cold leg) was
    removed from training completely, and the programs were retrained on the other
    11 accidents. The alarm below uses Random Forest's uncertainty: it rings when
    the uncertainty passes a level that 95% of ordinary validation windows stay
    under. All channels are used.</p>
    <table class="tel"><thead><tr><th>WINDOW (S)</th>
      <th style="text-align:right">ALARM SCORE (AUROC)</th>
      <th style="text-align:right">TIMES IT CAUGHT THE UNKNOWN</th>
      <th style="text-align:right">FALSE ALARM RATE</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p style="margin-top:8px">At a 120 second window, the hidden accident is
    flagged every time, with a false alarm rate of ${fmt(rf[0].fpr, 3)}. At longer
    windows the signal fades: with more data, LOCAC gets absorbed into LOCA, its
    close twin. ${cnn ? `The CNN's uncertainty signal is worse than useless at a
    600 second window (alarm score ${fmt(cnn.auroc, 3)}): the hidden accident is
    classified more confidently than the known ones.` : ""}</p>`;
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
