"use strict";
header("ml"); footer();
const $ = (id) => document.getElementById(id);

const COLORS = ["#38e1ff", "#ffb454", "#3dff8e", "#ff5470", "#b78cff",
                "#ffd23e", "#4dd0a6", "#7fb2ff"];

function drawGrid(results) {
  const cv = $("gridChart"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height, padL = 44, padR = 12, padT = 14, padB = 28;
  const grid = results.grid_t0_100_realistic;
  const Ws = results.windows_s;
  const models = Object.keys(grid);
  ctx.clearRect(0, 0, W, H);
  ctx.font = "10px Consolas, monospace"; ctx.fillStyle = "#4d6a8c";
  ctx.strokeStyle = "#16324f";
  const yMin = 0.8, yMax = 1.0;
  const X = (w) => padL + (Math.log10(w) - Math.log10(Ws[0])) /
    (Math.log10(Ws[Ws.length - 1]) - Math.log10(Ws[0])) * (W - padL - padR);
  const Y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * i / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(v.toFixed(2), 8, y + 3);
  }
  Ws.forEach((w) => ctx.fillText(w + "s", X(w) - 8, H - 8));
  models.forEach((m, mi) => {
    ctx.strokeStyle = COLORS[mi % COLORS.length];
    ctx.lineWidth = m === "MultiRocket+HYDRA" ? 2.6 : 1.3;
    ctx.beginPath();
    Ws.forEach((w, i) => {
      const cell = grid[m][String(w)];
      if (!cell) return;
      const x = X(w), y = Y(cell.macroF1);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  });
  $("gridLegend").innerHTML = models.map((m, mi) =>
    `<span style="color:${COLORS[mi % COLORS.length]}">■</span> ${m}`).join(" &nbsp; ");
}

function drawFindings(f) {
  const el = $("findings");
  if (!el || !f) return;
  el.innerHTML = `
    <p><b>Too early is hopeless.</b> If the window starts at 20 seconds, before the
    plant has reacted to the accident, the best score any of the eight programs
    reaches is ${fmt(f.ceiling.bestMacroF1, 3)} (with a 30 or 60 second window, on
    either channel set). The accident simply is not visible in the numbers yet, and
    no program can find what is not there.</p>
    <p><b>Once the accident has started, the best program is excellent.</b> With
    windows lined up to the accident's start (100 seconds into the run),
    MultiRocket+HYDRA scores between ${fmt(f.onset.multiRocketHydraMin, 3)} and
    ${fmt(f.onset.multiRocketHydraMax, 3)} at every window length. The single best
    score in the whole study is ${f.onset.bestSingle.model} at a window of
    ${f.onset.bestSingle.W} s, with ${fmt(f.onset.bestSingle.macroF1, 3)}.</p>
    <p><b>Leaving out the "cheating" channels costs almost nothing.</b> The honest
    sensor set leaves out 8 oracle channels that no real sensor could measure. At a
    100 second start and a 60 second window, that costs at most
    ${fmt(f.oracleCost.maxDrop, 3)} score for any program. The 88 honest channels
    carry nearly all of the signal.</p>
    <p><b>Slow, creeping accidents are the weak spot.</b> When accidents arrive as
    slow ramps instead of sudden breaks, the best score any program reaches is
    ${fmt(f.ramps.bestMacroF1, 3)} (${f.ramps.model}, window
    ${f.ramps.W} s), far below the sudden accident scores.</p>
    <p><b>An accident it never learned is nearly invisible.</b> Spotting an accident
    type the programs never trained on works only at the longest window. The best
    alarm score is ${fmt(f.unknown.bestAuroc, 3)} at a window of
    ${f.unknown.W} s, from the ${f.unknown.signal} signal (an alarm score of 1.0
    would be perfect and 0.5 is pure guessing). The shape matching "kernel"
    programs score ${fmt(f.unknown.kernelAurocValues[0], 3)}: pure guessing. As
    alarms for the unknown, they tell you nothing.</p>`;
}

function drawLLM(b) {
  const el = $("llmbench");
  if (!el || !b) return;
  const m = b.method;
  const lat = (s) => s === null || s === undefined ? "n/a"
    : s >= 90 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(0)} s`;
  const rows = b.models.map((md) => `
    <tr><td>${md.name}</td>
      <td class="num">${fmt(md.t0_100.accuracy, 3)}</td>
      <td class="num">${fmt(md.t0_100.macroF1, 3)}</td>
      <td class="num">${md.t0_100.parseFailures}</td>
      <td class="num">${fmt(md.t0_20.accuracy, 3)}</td>
      <td class="num">${fmt(md.t0_20.macroF1, 3)}</td>
      <td class="num">${md.t0_20.parseFailures}</td>
      <td class="num">${lat(md.latencySeconds)}</td></tr>`).join("");
  const ref = b.trainedReferences;
  const refRows = Object.keys(ref.t0_100).map((name) => `
    <tr><td>${name}</td><td class="num">${fmt(ref.t0_100[name], 3)}</td>
      <td class="num">${fmt(ref.t0_20[name], 3)}</td></tr>`).join("");
  const chans = m.channels.map((c) => c.code).join(", ");
  el.innerHTML = `
    <p>How the test worked: each chatbot was given the same windows the study
    programs read, written out as text, and asked one identical question per
    window: which accident is this? No training and no examples were given. Each
    window is ${m.windowSeconds} s of readings, one every ${m.samplingSeconds} s
    (${m.samplesPerChannel} readings per channel), with ${m.windowsPerProtocol}
    test windows per start position (4 runs per accident type, chosen at random
    with seed ${m.seed}). Two start positions were tried: lined up with the
    accident's start (100 s in) and very early (20 s in, the study's "Task E"
    setting). Twelve honest channels were written out at 3 significant figures:
    ${chans}. The scoring is strict: an answer counts only if it is exactly one
    accident code.</p>
    <table class="tel"><thead><tr><th>CHATBOT (LANGUAGE MODEL)</th>
      <th style="text-align:right">START 100 S: ACCURACY</th>
      <th style="text-align:right">START 100 S: F1</th>
      <th style="text-align:right">BAD FORMAT</th>
      <th style="text-align:right">START 20 S: ACCURACY</th>
      <th style="text-align:right">START 20 S: F1</th>
      <th style="text-align:right">BAD FORMAT</th>
      <th style="text-align:right">TOTAL TIME</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p class="dim small" style="margin-top:6px">${b.models.map((md) =>
      `${md.name}: ${md.access}`).join("<br>")}</p>
    <h3 style="margin-top:14px">THE TRAINED STUDY PROGRAMS, FOR COMPARISON (FULL TEST SET)</h3>
    <table class="tel"><thead><tr><th>PROGRAM</th>
      <th style="text-align:right">START 100 S: F1 SCORE</th>
      <th style="text-align:right">START 20 S: F1 SCORE</th></tr></thead>
      <tbody>${refRows}</tbody></table>
    <p class="dim small" style="margin-top:6px">${ref.note}</p>
    ${Object.keys(b.notRun || {}).length ? `<p style="margin-top:8px"><b>Not run:</b> ` +
      Object.keys(b.notRun).map((k) => k === "ChatGPT"
        ? "ChatGPT, because the OpenAI account was out of credits"
        : k === "Gemini"
          ? "Gemini, because its key is on the free tier and hit the daily request limit"
          : k).join("; ") + `.</p>` : ""}
    ${b.apiAccess ? `<p style="margin-top:8px">${b.apiAccess}</p>` : ""}`;
}

(async () => {
  const results = await loadJSON("data/results.json");
  drawGrid(results);
  drawFindings(results.findings);
  try { drawLLM(await loadJSON("data/llm_benchmark.json")); } catch (e) {}
  const b = results.edge.benchmarks;
  const row = (name, w) => {
    const p = b[w].primary, f = b[w].fallback;
    return `<tr><td>${name}</td>
      <td class="num">${fmt(p.macro_F1)}</td><td class="num">${fmt(p.latency_ms_mean, 1)} ms</td>
      <td class="num">${fmt(f.macro_F1)}</td><td class="num">${fmt(f.latency_ms_mean, 2)} ms</td></tr>`;
  };
  $("bench").innerHTML = `
    <table class="tel"><thead><tr><th>WINDOW</th>
      <th style="text-align:right">MAIN MODEL SCORE (F1)</th><th style="text-align:right">MAIN MODEL TIME</th>
      <th style="text-align:right">BACKUP MODEL SCORE (F1)</th><th style="text-align:right">BACKUP MODEL TIME</th>
      </tr></thead><tbody>${row("60 s window", "W60")}${row("120 s window", "W120")}</tbody></table>
    <div class="kv" style="margin-top:8px"><span class="k">SIZE OF THE WHOLE MODEL PACKAGE</span>
      <span class="v">${(results.edge.bundleBytes / 1e6).toFixed(2)} MB</span></div>
    <div class="kv"><span class="k">MEMORY USED</span>
      <span class="v">${fmt(b.payload_only_peak_rss_mb, 1)} MB OF THE 512 MB BUDGET</span></div>
    <div class="kv"><span class="k">SENT TO EARTH PER EVENT</span><span class="v">~150 BYTES · THE ANSWER ONLY</span></div>
    <div class="kv"><span class="k">CHECK AGAINST THE STUDY REFERENCE</span>
      <span class="v">${results.jsVerification.argmaxAgreement}/${results.jsVerification.scenariosChecked} SCENARIOS MATCH</span></div>`;
})();
