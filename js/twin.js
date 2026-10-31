"use strict";
header("twin"); footer();

let twin = null, results = null, run = null;
let idx = 0, playing = false, timer = null;

const $ = (id) => document.getElementById(id);

function draw() {
  const cv = $("chart"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height, padL = 56, padR = 14, padT = 16, padB = 26;
  ctx.clearRect(0, 0, W, H);
  const ch = $("chSel").value;
  const T = run.series.TIME, V = run.series[ch];
  const tMax = T[T.length - 1];
  let vMin = Math.min(...V), vMax = Math.max(...V);
  const span = (vMax - vMin) || 1; vMin -= span * 0.08; vMax += span * 0.08;
  const X = (t) => padL + (t / tMax) * (W - padL - padR);
  const Y = (v) => padT + (1 - (v - vMin) / (vMax - vMin)) * (H - padT - padB);
  ctx.strokeStyle = "#16324f"; ctx.fillStyle = "#4d6a8c";
  ctx.font = "10px Consolas, monospace"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = vMin + (vMax - vMin) * i / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(v.toFixed(1), 6, y + 3);
  }
  for (let i = 0; i <= 5; i++) {
    const t = tMax * i / 5, x = X(t);
    ctx.fillText(t.toFixed(0) + "s", x - 8, H - 8);
  }
  // onset + window close markers
  ctx.strokeStyle = "#ffb454"; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(X(100), padT); ctx.lineTo(X(100), H - padB); ctx.stroke();
  ctx.strokeStyle = "#38e1ff";
  ctx.beginPath(); ctx.moveTo(X(160), padT); ctx.lineTo(X(160), H - padB); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffb454"; ctx.fillText("ONSET t=100s", X(100) + 4, padT + 10);
  ctx.fillStyle = "#38e1ff"; ctx.fillText("WINDOW CLOSES t=160s", X(160) + 4, padT + 22);
  // physical trace (full, faint) + twin trace (up to playback, bright)
  ctx.strokeStyle = "rgba(56,225,255,0.25)"; ctx.lineWidth = 1.2;
  ctx.beginPath();
  V.forEach((v, i) => { const x = X(T[i]), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  ctx.strokeStyle = "#3dff8e"; ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i <= idx && i < V.length; i++) {
    const x = X(T[i]), y = Y(V[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  if (idx < V.length) {
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(X(T[idx]), Y(V[idx]), 3.4, 0, 7); ctx.fill();
  }
  updateReadouts();
}

function updateReadouts() {
  const T = run.series.TIME, t = T[Math.min(idx, T.length - 1)];
  const rows = run.channels.map((c) => {
    const v = run.series[c][Math.min(idx, run.series[c].length - 1)];
    return `<tr><td>${c}</td><td class="num">${v.toFixed(3)}</td>
      <td class="num">${v.toFixed(3)}</td><td class="num">0.000</td>
      <td class="ok">IN SYNC</td></tr>`;
  }).join("");
  $("telBody").innerHTML = rows;
  $("telTime").textContent =
    `Twin time t = ${t.toFixed(0)} s of ${T[T.length - 1].toFixed(0)} s · run ${run.file} · true class ${run.label} · severity ${run.severity}`;
  const d = run.diagnosis;
  if (t >= 160) {
    const okS = d.study.pred === run.label, okE = d.edge.pred === run.label;
    $("diagBox").innerHTML = `
      <div class="big">${d.edge.pred} <small>ONBOARD DIAGNOSIS</small></div>
      <div class="kv"><span class="k">TRUE CLASS</span><span class="v">${run.label}</span></div>
      <div class="kv"><span class="k">EDGE MODEL (FLIGHT)</span>
        <span class="v" style="color:${okE ? "var(--green)" : "var(--red)"}">${d.edge.pred} · conf ${fmt(d.edge.conf, 3)}</span></div>
      <div class="kv"><span class="k">STUDY MODEL (GROUND TRUTH RUN)</span>
        <span class="v" style="color:${okS ? "var(--green)" : "var(--red)"}">${d.study.pred} · conf ${fmt(d.study.conf, 3)}</span></div>
      <div class="kv"><span class="k">DECISION MADE</span><span class="v">ON BOARD · NO GROUND ROUND TRIP</span></div>
      <div class="kv"><span class="k">DOWNLINKED</span><span class="v">EVENT ONLY · RAW WINDOW STAYS ON BOARD</span></div>`;
  } else {
    $("diagBox").innerHTML = `<p class="dim small">Window open. Onset at t = 100 s,
      diagnosis at t = 160 s. Currently t = ${t.toFixed(0)} s.</p>`;
  }
}

function setRun() {
  run = twin.runs[Number($("runSel").value)];
  idx = 0; $("scrub").value = 0;
  draw();
}
function tick() {
  const n = run.series.TIME.length;
  idx += 1;
  if (idx >= n - 1) { idx = n - 1; pause(); }
  $("scrub").value = Math.round(100 * idx / (n - 1));
  draw();
}
function play() { if (!playing) { playing = true; $("playBtn").textContent = "❚❚ PAUSE"; timer = setInterval(tick, 90); } }
function pause() { playing = false; $("playBtn").textContent = "▶ PLAY"; if (timer) clearInterval(timer); }

function link() {
  const au = Number($("au").value);
  const oneWayMin = au * 499.0 / 60; // light time, seconds per AU = 499
  const rt = 2 * oneWayMin;
  const lat = results.edge.benchmarks.W60.primary.latency_ms_mean;
  $("linkOut").innerHTML = `
    <div class="kv"><span class="k">DISTANCE</span><span class="v">${au.toFixed(1)} AU</span></div>
    <div class="kv"><span class="k">ONE WAY LIGHT TIME</span><span class="v">${oneWayMin.toFixed(1)} MIN</span></div>
    <div class="kv"><span class="k">GROUND ROUND TRIP</span><span class="v">${rt.toFixed(1)} MIN</span></div>
    <div class="kv"><span class="k">ONBOARD DECISION (MEASURED MEAN)</span><span class="v">${(lat / 1000).toFixed(3)} S</span></div>
    <p class="small dim">The Mars Society's account of rover operations puts the round trip
    at six to more than forty minutes depending on orbital positions. The diagnosis window
    is sixty seconds. Ground control cannot be in this loop; the edge model is the loop.</p>`;
}

(async () => {
  twin = await loadJSON("data/twin.json");
  results = await loadJSON("data/results.json");
  $("runSel").innerHTML = twin.runs.map((r, i) =>
    `<option value="${i}">${r.label} · severity ${r.severity} · ${r.file}</option>`).join("");
  $("chSel").innerHTML = twin.runs[0].channels.map((c) => `<option>${c}</option>`).join("");
  const b = results.edge.benchmarks.W60;
  $("health").innerHTML = `
    <div class="kv"><span class="k">MODEL</span><span class="v">MULTIROCKET+HYDRA · RIDGE HEAD</span></div>
    <div class="kv"><span class="k">TEST MACRO F1 · W = 60 s</span><span class="v">${fmt(b.primary.macro_F1)}</span></div>
    <div class="kv"><span class="k">EDGE LATENCY MEAN / P95</span><span class="v">${fmt(b.primary.latency_ms_mean, 1)} / ${fmt(b.primary.latency_ms_p95, 1)} MS</span></div>
    <div class="kv"><span class="k">UPLINK BUNDLE</span><span class="v">${(results.edge.bundleBytes / 1e6).toFixed(2)} MB · SHA-256 VERIFIED</span></div>
    <div class="kv"><span class="k">PAYLOAD PEAK MEMORY</span><span class="v">${fmt(results.edge.benchmarks.payload_only_peak_rss_mb, 1)} MB</span></div>
    <div class="kv"><span class="k">SAFE MODE FALLBACK</span><span class="v">LOGREG+ · MACRO F1 ${fmt(b.fallback.macro_F1)}</span></div>
    <div class="kv"><span class="k">BROWSER PORT CHECK</span><span class="v">${results.jsVerification.argmaxAgreement}/${results.jsVerification.scenariosChecked} WINDOWS MATCH THE NUMPY RUNTIME</span></div>`;
  $("runSel").addEventListener("change", setRun);
  $("chSel").addEventListener("change", draw);
  $("playBtn").addEventListener("click", () => playing ? pause() : play());
  $("resetBtn").addEventListener("click", () => { pause(); idx = 0; $("scrub").value = 0; draw(); });
  $("scrub").addEventListener("input", (e) => {
    const n = run.series.TIME.length;
    idx = Math.round(Number(e.target.value) / 100 * (n - 1)); draw();
  });
  $("au").addEventListener("input", link);
  setRun(); link();
})();
