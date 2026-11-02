"use strict";
/* Shared mission chrome: header, MET clock, footer. */
const T0 = Date.now();
function met() {
  const s = Math.floor((Date.now() - T0) / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
function header(active) {
  const pages = [
    ["index.html", "DIGITAL TWIN", "twin"],
    ["ml.html", "HOW ML TAKES PLACE", "ml"],
    ["app.html", "SPACE APP", "app"],
  ];
  const nav = pages.map(([href, label, key]) =>
    `<a href="${href}" class="${key === active ? "on" : ""}">${label}</a>`).join("");
  document.getElementById("hdr").innerHTML = `
  <div class="hbar">
    <div class="brand">
      <h1>NPPAD <span class="thin">// DIGITAL TWIN</span></h1>
      <div class="sub">ONBOARD ACCIDENT DIAGNOSIS FOR DEEP SPACE POWER SYSTEMS</div>
    </div>
    <div class="hud">
      <div class="hudbox"><div class="k">MISSION ELAPSED TIME</div><div class="v" id="met">00:00:00</div></div>
      <div class="hudbox"><div class="k">GROUND LINK</div><div class="v" style="color:var(--amber)">DELAYED</div></div>
      <div class="hudbox"><div class="k">PROCESSING</div><div class="v">ONBOARD</div></div>
    </div>
  </div>
  <nav class="main">${nav}</nav>`;
  setInterval(() => {
    const el = document.getElementById("met");
    if (el) el.textContent = met();
  }, 500);
}
function footer() {
  document.getElementById("ftr").innerHTML = `
  NPPAD DIGITAL TWIN. A ground twin and flight style console for the NPPAD accident
  diagnosis study (Saurabh Sanjay Kulkarni). Every result shown on these pages is
  generated at build time from the study's own computed artifacts by
  tools/generate_data.py. No result is hand typed. The flight model is the
  NPPAD-Edge payload: MultiRocket+HYDRA kernel features with a ridge head,
  built to run at the point of capture with no ground round trip.`;
}
async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}
function fmt(x, d = 4) { return x === null || x === undefined ? "n/a" : Number(x).toFixed(d); }
