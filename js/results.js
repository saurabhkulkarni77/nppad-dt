"use strict";
header("results"); footer();

let SR = null, EP = null;

function tel(headers, rows) {
  const th = headers.map(h => `<th>${h}</th>`).join("");
  return `<table class="tel"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}
function num(x, d = 3) { return `<td class="num">${fmt(x, d)}</td>`; }

function drawBars(cv, labels, values) {
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const max = Math.max(...values, 0.01);
  const rowH = H / labels.length;
  ctx.font = "11px monospace";
  labels.forEach((lab, i) => {
    const y = i * rowH + rowH * 0.22;
    const bw = (W - 240) * (values[i] / max);
    ctx.fillStyle = "#8fb8dd";
    ctx.textAlign = "right";
    ctx.fillText(lab, 168, y + 11);
    ctx.fillStyle = "#22b8e6";
    ctx.fillRect(176, y, Math.max(bw, 1), rowH * 0.52);
    ctx.fillStyle = "#d7e6f5";
    ctx.textAlign = "left";
    ctx.fillText(fmt(values[i], 3), 184 + bw, y + 11);
  });
}

function renderGrid() {
  const t0 = Number(document.getElementById("fT0").value);
  const W = Number(document.getElementById("fW").value);
  const vars = document.getElementById("fVars").value;
  const rows = SR.results
    .filter(r => r.t0 === t0 && r.W === W && r.vars === vars)
    .sort((a, b) => b.macroF1 - a.macroF1);
  document.getElementById("gridTable").innerHTML = tel(
    ["MODEL", "VALIDATION F1", "TEST ACCURACY", "TEST MACRO F1", "WHERE THE ROW CAME FROM"],
    rows.map(r => `<tr><td>${r.model}</td>${num(r.valF1)}${num(r.accuracy)}${num(r.macroF1)}` +
      `<td class="dim small">${r.source}</td></tr>`).join(""));
  drawBars(document.getElementById("gridChart"),
    rows.map(r => r.model), rows.map(r => r.macroF1));
}

function renderLookup() {
  const i = Number(document.getElementById("winSel").value);
  const w = EP.windows[i];
  const rows = Object.keys(EP.models).map(m => {
    const p = EP.models[m].preds[i];
    const ok = p.p === w.label;
    return `<tr><td>${m}</td><td>${p.p}</td>${num(p.c, 3)}` +
      `<td class="${ok ? "ok" : "bad"}">${ok ? "RIGHT" : "WRONG"}</td>` +
      `${num(EP.models[m].metrics.accuracy)}${num(EP.models[m].metrics.macroF1)}</tr>`;
  }).join("");
  document.getElementById("winTable").innerHTML = tel(
    ["MODEL", "ITS CALL", "CONFIDENCE", "VERDICT", "ITS ACCURACY ON ALL 244 WINDOWS", "ITS MACRO F1 ON ALL 244"],
    rows);
}

async function init() {
  SR = await loadJSON("data/study_results.json");
  EP = await loadJSON("data/explorer_preds.json");
  const meta = SR.meta;
  document.getElementById("splitLine").textContent =
    `Split (seed ${meta.splitSeed}): ${meta.splits.train} train / ${meta.splits.validation} ` +
    `validation / ${meta.splits.test} test windows. Accident classes: ${meta.classes.join(", ")}.`;

  const fill = (id, vals, def) => {
    const el = document.getElementById(id);
    el.innerHTML = vals.map(v => `<option value="${v}">${v}</option>`).join("");
    el.value = String(def);
    el.addEventListener("change", renderGrid);
  };
  fill("fT0", [...new Set(SR.results.map(r => r.t0))].sort((a, b) => a - b), 100);
  fill("fW", [...new Set(SR.results.map(r => r.W))].sort((a, b) => a - b), 60);
  fill("fVars", [...new Set(SR.results.map(r => r.vars))], "all");
  renderGrid();

  document.getElementById("e5Table").innerHTML = tel(
    ["MODEL", "W (S)", "TEST MACRO F1", "TEST ACCURACY"],
    SR.e5runs.slice().sort((a, b) => a.model.localeCompare(b.model) || a.W - b.W)
      .map(r => `<tr><td>${r.model}</td>${num(r.W, 0)}${num(r.macroF1)}${num(r.accuracy)}</tr>`).join(""));

  const tr = SR.transformer, a = tr.architecture;
  document.getElementById("transArch").textContent =
    `${tr.model}. Input: ${a.input}; projection ${a.in_proj}; ${a.num_layers} encoder layers, ` +
    `model width ${a.d_model}, ${a.nhead} attention heads, feed-forward ${a.dim_feedforward}, ` +
    `${Number(a.n_parameters).toLocaleString("en-US")} parameters. Split inside the arm: ` +
    `${tr.per_t0["100"].n_train} train / ${tr.per_t0["100"].n_val} validation / ` +
    `${tr.per_t0["100"].n_test} test at onset.`;
  document.getElementById("transTable").innerHTML = tel(
    ["WINDOW START", "TEST ACCURACY", "TEST MACRO F1"],
    ["100", "20"].map(k => `<tr><td>t0 = ${k} s</td>${num(tr.per_t0[k].test_accuracy_seedmean_proba)}` +
      `${num(tr.per_t0[k].test_macro_F1_seedmean_proba)}</tr>`).join(""));
  document.getElementById("transPerClass").textContent =
    "Per-accident F1 at onset (t0 = 100 s): " +
    Object.entries(tr.per_t0["100"].per_class_F1).map(([c, v]) => `${c} ${fmt(v, 3)}`).join(" · ");

  document.getElementById("lookupNote").textContent =
    `${EP.setting}. ${EP.windows.length} windows. Every call and confidence below is ` +
    `recomputed at build time from the study's recorded prediction files; the two score ` +
    `columns on the right are each model's totals over all ${EP.windows.length} windows ` +
    `in this same setting.`;
  const sel = document.getElementById("winSel");
  sel.innerHTML = EP.windows.map((w, i) =>
    `<option value="${i}">${w.file} — true class ${w.label} (severity ${w.severity})</option>`).join("");
  sel.addEventListener("change", renderLookup);
  renderLookup();

  document.getElementById("xTable").innerHTML = tel(
    ["EXTENSION", "TRAIN / TEST WINDOWS", "RMSE", "MAE", "90% INTERVAL: RAW COVERAGE", "90% INTERVAL: CALIBRATED"],
    SR.x1x2.map(r => `<tr><td>${r.extension}</td><td>${fmt(r.n_train, 0)} / ${fmt(r.n_test, 0)}</td>` +
      `${num(r.rmse)}${num(r.mae)}${num(r.pi90_coverage_raw)}${num(r.pi90_coverage_calibrated)}</tr>`).join(""));

  document.getElementById("officialNote").textContent = SR.officialReport.model + ".";
  document.getElementById("officialTable").innerHTML = tel(
    ["MEASURED ON THE OFFICIAL FILE", "VALUE"],
    `<tr><td>Accuracy</td>${num(SR.officialReport.accuracy)}</tr>` +
    `<tr><td>Macro F1</td>${num(SR.officialReport.macroF1)}</tr>`);
  document.getElementById("dlLinks").innerHTML = EP.files.map(f =>
    `<a href="preds/${f}">${f}</a>`).join(" · ");

  const scenModels = ["CNN", "GRU", "LogReg", "Random Forest"];
  document.getElementById("r1Note").textContent =
    `Trained severities are swapped for nearby untrained ones (for example a 100% break ` +
    `becomes 80%). The table scores the drop; the small matrix under it shows each model's ` +
    `actual call on ${SR.r1Scenarios.length} swapped scenarios.`;
  document.getElementById("r1Table").innerHTML = tel(
    ["SETTING", "MODEL", "W (S)", "TEST F1", "SWAPPED-SEVERITY F1", "DROP"],
    SR.r1.map(r => `<tr><td>${r.setting}</td><td>${r.model}</td>${num(r.W, 0)}${num(r.testF1)}` +
      `${num(r.rampF1)}${num(r.degradation)}</tr>`).join("")) +
    tel(["SCENARIO", "TRUE CLASS", ...scenModels.map(m => m.toUpperCase())],
      SR.r1Scenarios.map(s => `<tr><td>${s.scenario}</td><td>${s.true}</td>` +
        scenModels.map(m => `<td class="${s[m] === s.true ? "ok" : "bad"}">${s[m]}</td>`).join("") +
        `</tr>`).join(""));

  document.getElementById("r2Table").innerHTML = tel(
    ["UNCERTAINTY SIGNAL", "W (S)", "F1 ON KNOWN CLASSES", "AUROC", "DETECTION AT 5% FALSE ALARMS", "FALSE-ALARM RATE"],
    SR.r2.map(r => `<tr><td>${r.signal}</td>${num(r.W, 0)}${num(r.knownF1)}${num(r.AUROC)}` +
      `${num(r.detection)}${num(r.FPR)}</tr>`).join(""));

  document.getElementById("w60Table").innerHTML = tel(
    ["MODEL", "ACCURACY", "MACRO F1", "RECOMPUTED FROM"],
    SR.w60Study.map(r => `<tr><td>${r.model}</td>${num(r.accuracy)}${num(r.macroF1)}` +
      `<td class="dim small">${r.source}</td></tr>`).join(""));
}
init();
