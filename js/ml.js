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

(async () => {
  const results = await loadJSON("data/results.json");
  drawGrid(results);
  const b = results.edge.benchmarks;
  const row = (name, w) => {
    const p = b[w].primary, f = b[w].fallback;
    return `<tr><td>${name}</td>
      <td class="num">${fmt(p.macro_F1)}</td><td class="num">${fmt(p.latency_ms_mean, 1)} ms</td>
      <td class="num">${fmt(f.macro_F1)}</td><td class="num">${fmt(f.latency_ms_mean, 2)} ms</td></tr>`;
  };
  $("bench").innerHTML = `
    <table class="tel"><thead><tr><th>FLIGHT WINDOW</th>
      <th style="text-align:right">PRIMARY F1</th><th style="text-align:right">PRIMARY LATENCY</th>
      <th style="text-align:right">FALLBACK F1</th><th style="text-align:right">FALLBACK LATENCY</th>
      </tr></thead><tbody>${row("W = 60 s", "W60")}${row("W = 120 s", "W120")}</tbody></table>
    <div class="kv" style="margin-top:8px"><span class="k">UPLINK BUNDLE, BOTH WINDOWS + FALLBACKS</span>
      <span class="v">${(results.edge.bundleBytes / 1e6).toFixed(2)} MB</span></div>
    <div class="kv"><span class="k">PAYLOAD PEAK MEMORY</span>
      <span class="v">${fmt(b.payload_only_peak_rss_mb, 1)} MB OF 512 MB BUDGET</span></div>
    <div class="kv"><span class="k">DOWNLINK PER EVENT</span><span class="v">~150 BYTES · EVENT ONLY</span></div>
    <div class="kv"><span class="k">BROWSER PORT VERIFICATION</span>
      <span class="v">${results.jsVerification.argmaxAgreement}/${results.jsVerification.scenariosChecked} SCENARIOS MATCH NUMPY RUNTIME</span></div>`;
})();
