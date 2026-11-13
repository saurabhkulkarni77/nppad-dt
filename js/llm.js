"use strict";
header("llm"); footer();

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function tel(headers, rows) {
  const th = headers.map(h => `<th>${h}</th>`).join("");
  return `<table class="tel"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}
function num(x, d = 3) { return `<td class="num">${fmt(x, d)}</td>`; }
function block(b) {
  if (!b) return `<td class="num">—</td><td class="num">—</td><td class="num">—</td>`;
  return `${num(b.accuracy)}${num(b.macroF1)}${num(b.parseFailures, 0)}`;
}
function kv(obj, skip = []) {
  return Object.entries(obj)
    .filter(([k, v]) => !skip.includes(k) && v !== null && typeof v !== "object")
    .map(([k, v]) => `<div class="dim small">${esc(k)}: ${esc(v)}</div>`).join("");
}

function extrasHTML(a) {
  const e = a.extras || {};
  let h = "";
  if (a.id === "plugin" && e.argmaxAgreement) {
    const g = e.argmaxAgreement;
    h += `<p class="dim small">Counted at build time from the prompt files (which state the ` +
      `plug-in's top prediction) and the arm's answer files: the final answer matched the ` +
      `plug-in's own top prediction on ${g.t0_100.agree} of ${g.t0_100.windows} onset windows ` +
      `and ${g.t0_20.agree} of ${g.t0_20.windows} early windows.</p>`;
  }
  if (a.id === "reasontsc_full" && e.pluginAnalysis) {
    const pa = e.pluginAnalysis;
    h += tel(["PROTOCOL", "AGREED WITH OWN CLASSIFIER", "CORRECTIONS", "BREAKAGES", "CLASSIFIER ARGMAX ACCURACY"],
      ["t0_100", "t0_20"].map(k => `<tr><td>${k === "t0_100" ? "onset (t0 = 100 s)" : "early (t0 = 20 s)"}</td>` +
        `${num(pa[k].agreeWithPlugin, 0)}${num(pa[k].corrections, 0)}${num(pa[k].breakages, 0)}` +
        `${num(pa[k].pluginArgmaxAccuracyOnSubset)}</tr>`).join(""));
    if (e.deviationsFromPaper) {
      h += `<h4>Deviations from the paper's protocol</h4>` +
        e.deviationsFromPaper.map(d => `<p class="dim small">${esc(d)}</p>`).join("");
    }
  }
  if (a.id === "pet" && e.eliminationRounds) {
    h += `<p class="dim small">Matches decided per round (overall): ` +
      Object.entries(e.eliminationRounds.overall).map(([k, v]) => `${esc(k)} ${v}`).join(" · ") +
      `. By protocol — onset: ` +
      Object.entries(e.eliminationRounds.byProtocol["t0=100"]).map(([k, v]) => `${esc(k)} ${v}`).join(" · ") +
      `; early: ` +
      Object.entries(e.eliminationRounds.byProtocol["t0=20"]).map(([k, v]) => `${esc(k)} ${v}`).join(" · ") +
      `.</p>`;
  }
  if (a.id === "automl" && e.trainCV) {
    const tried = Object.entries(e.trainCV.algorithmsTried).sort((x, y) => y[1] - x[1]);
    h += `<p class="dim small">${esc(e.trainCV.protocol)}</p>` +
      `<p class="dim small">Selected on train cross-validation: <b>${esc(e.trainCV.selected)}</b></p>` +
      tel(["ALGORITHM TRIED (TRAIN CV)", "CV MACRO F1"],
        tried.map(([k, v]) => `<tr><td>${esc(k)}</td>${num(v)}</tr>`).join(""));
    if (e.methodNote) h += `<p class="dim small">${esc(e.methodNote)}</p>`;
  }
  if (a.id === "automl_v2") {
    h += `<p class="dim small">Stage 1 screened ${e.stage1Candidates} candidate pipelines on train ` +
      `cross-validation; the best five:</p>` +
      tel(["STAGE-1 CANDIDATE", "CV MACRO F1"],
        e.stage1Top.map(t => `<tr><td>${esc(t.family)}</td>${num(t.cvMacroF1)}</tr>`).join(""));
    const c = e.comparisonV1vsV2;
    if (c) h += `<p class="dim small">v1 selected ${esc(c.v1.selected)} (train CV macro F1 ` +
      `${fmt(c.v1.trainCvMacroF1, 3)}); v2 selected ${esc(c.v2.selected)} (train CV macro F1 ` +
      `${fmt(c.v2.trainCvMacroF1, 3)}). Their test predictions came out identical.</p>`;
    if (e.methodNote) h += `<p class="dim small">${esc(e.methodNote)}</p>`;
  }
  if (a.id === "agent") {
    h += kv(e.stats || {});
    if (e.stats && e.stats.windowsUsingRetrieval_note)
      h += `<p class="dim small">${esc(e.stats.windowsUsingRetrieval_note)}</p>`;
    if (e.methodNote)
      h += `<details><summary class="dim small">Full method note, including the completion disclosure</summary>` +
        `<p class="dim small" style="white-space:pre-wrap">${esc(e.methodNote)}</p></details>`;
  }
  if (a.id === "sc" && e.agreement) {
    const g = e.agreement;
    h += `<p class="dim small">Across its 5 samples per window: mean pairwise agreement ` +
      `${fmt(g.meanPairwiseAgreement, 3)}; ${g.unanimousWindows} of 96 windows unanimous; ` +
      `vote margins (votes for the winner): ` +
      Object.entries(g.voteMarginDistribution).map(([k, v]) => `${k} votes on ${v} windows`).join(" · ") + `.</p>`;
  }
  if (a.id === "pal" && e.execution) {
    const x = e.execution;
    h += `<p class="dim small">Programs extracted: ${x.programsExtracted}; executed: ${x.programsExecuted}; ` +
      `ran cleanly: ${x.cleanExecutions}.</p>`;
  }
  return h;
}

async function init() {
  const D = await loadJSON("data/llm_study.json");
  document.getElementById("taskLine").textContent = D.task;
  document.getElementById("protocolLine").textContent =
    `${D.protocols.t0_100}. ${D.protocols.t0_20}. ${D.sample.windowsPerProtocol} windows per protocol ` +
    `(seed ${D.seed}), each a 60 s window of ${D.channels.length} channels (${D.channels.join(", ")}), ` +
    `6 samples at 10 s spacing, values rounded to 3 significant figures. Scoring is strict: anything ` +
    `but exactly one valid class code counts as a parse failure and a wrong answer. Guessing at ` +
    `random scores about ${fmt(D.chance, 3)} accuracy.`;

  let lastGroup = null, rows = "";
  for (const a of D.arms) {
    if (a.group !== lastGroup) {
      rows += `<tr><td colspan="8" class="dim" style="letter-spacing:1.5px">${esc(a.group.toUpperCase())}</td></tr>`;
      lastGroup = a.group;
    }
    const status = a.status === "run" ? "scored"
      : a.status === "incomplete" ? "INCOMPLETE" : "NOT RUN";
    rows += `<tr><td>${esc(a.name)}${a.oneliner ? `<div class="dim small" style="letter-spacing:0;margin-top:2px">${esc(a.oneliner)}</div>` : ""}</td>${block(a.t0_100)}${block(a.t0_20)}` +
      `<td class="${a.status === "run" ? "" : "bad"}">${status}</td></tr>`;
  }
  document.getElementById("masterTable").innerHTML = tel(
    ["ARM", "ONSET ACC", "ONSET F1", "ONSET PARSE FAILURES", "EARLY ACC", "EARLY F1", "EARLY PARSE FAILURES", "STATUS"],
    rows);

  document.getElementById("refTable").innerHTML = tel(
    ["TRAINED MODEL", "ONSET ACC", "ONSET F1", "EARLY ACC", "EARLY F1", "SCORED ON"],
    D.trainedReferences.map(r => `<tr><td>${esc(r.name)}</td>${num(r.t0_100.accuracy)}${num(r.t0_100.macroF1)}` +
      `${num(r.t0_20.accuracy)}${num(r.t0_20.macroF1)}<td class="dim small">${esc(r.scope)}</td></tr>`).join(""));

  document.getElementById("armDetails").innerHTML = D.arms.map(a => {
    const head = a.t0_100 ? `onset F1 ${fmt(a.t0_100.macroF1, 3)}` : a.status.replace("_", " ");
    const flags = (a.flags || []).map(f =>
      `<div class="note" style="border-left:3px solid var(--amber);margin:8px 0">${esc(f)}</div>`).join("");
    return `<details style="margin:8px 0"><summary><b>${esc(a.name)}</b> ` +
      `<span class="dim small">(${esc(a.group)} — ${head})</span></summary>` +
      `<p class="dim small" style="white-space:pre-wrap">${esc(a.description)}</p>` +
      flags + extrasHTML(a) + `</details>`;
  }).join("");

  document.getElementById("promptNote").textContent = D.promptConditionsNote || "";
  const pb = document.getElementById("promptBlocks");
  for (const v of ["v1", "v2", "v3", "v4"]) {
    const det = document.createElement("details");
    det.style.margin = "8px 0";
    const sum = document.createElement("summary");
    sum.innerHTML = `<b>Prompt ${v}</b>` + (D.promptChanged[v]
      ? ` <span class="dim small">— ${esc(D.promptChanged[v])}</span>` : "");
    const pre = document.createElement("pre");
    pre.style.cssText = "font-family:var(--mono);font-size:11px;white-space:pre-wrap;overflow-x:auto";
    pre.textContent = D.prompts[v];
    det.appendChild(sum); det.appendChild(pre); pb.appendChild(det);
  }

  document.getElementById("caveatList").innerHTML = D.caveats.map(c =>
    `<h4>${esc(c.title)}</h4><p class="dim small">${esc(c.text)}</p>`).join("");

  const agg = D.uea.aggregate, labels = D.uea.armLabels;
  const aggRows = Object.keys(agg).sort((x, y) => agg[y].mean_macro_f1 - agg[x].mean_macro_f1)
    .map(k => `<tr><td>${esc(labels[k] || k)}${agg[k].reference ? " (reference)" : ""}</td>` +
      `${num(agg[k].mean_accuracy)}${num(agg[k].mean_macro_f1)}</tr>`).join("");
  document.getElementById("ueaAgg").innerHTML = tel(
    ["ARM", "MEAN ACCURACY", "MEAN MACRO F1"], aggRows);
  document.getElementById("ueaPerDataset").innerHTML = Object.entries(D.uea.perDataset).map(([ds, arms]) => {
    const rs = Object.keys(arms).sort((x, y) => arms[y].macro_f1 - arms[x].macro_f1)
      .map(k => `<tr><td>${esc(labels[k] || k)}</td>${num(arms[k].accuracy)}${num(arms[k].macro_f1)}` +
        `<td class="num">${arms[k].n_valid_answers}/${arms[k].n}</td></tr>`).join("");
    return `<h4>${esc(ds)}</h4>` + tel(["ARM", "ACCURACY", "MACRO F1", "VALID ANSWERS"], rs);
  }).join("");
  document.getElementById("ueaCaveats").textContent = D.uea.caveats || "";
}
init();
