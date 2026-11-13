"use strict";
/* Shared page frame: header, clock, footer. Same on all pages. */
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
    ["plant.html", "THE PLANT", "plant"],
    ["index.html", "TRY THE AI", "ai"],
    ["ml.html", "WHAT WE LEARNED", "ml"],
    ["results.html", "RESULTS", "results"],
    ["llm.html", "LLM STUDY", "llm"],
    ["seccode.html", "SECURE CODE", "seccode"],
  ];
  const nav = pages.map(([href, label, key]) =>
    `<a href="${href}" class="${key === active ? "on" : ""}">${label}</a>`).join("");
  document.getElementById("hdr").innerHTML = `
  <div class="hbar">
    <div class="brand">
      <h1>NPPAD <span class="thin">// DIGITAL TWIN</span></h1>
      <div class="sub">A COMPUTER COPY OF A NUCLEAR PLANT, WITH AN AI THAT SPOTS ACCIDENTS</div>
    </div>
    <div class="hud">
      <div class="hudbox"><div class="k">TIME ON THIS PAGE</div><div class="v" id="met">00:00:00</div></div>
      <div class="hudbox"><div class="k">WHERE THE AI RUNS</div><div class="v">AT THE PLANT</div></div>
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
  NPPAD DIGITAL TWIN. A working copy of the NPPAD nuclear accident study
  (Saurabh Sanjay Kulkarni). The story in six pages: look at the plant, try the
  AI yourself, read what the study learned, then dig into the full trained-model
  results and the complete language-model prompt study. A sixth page adds a
  separate prompt benchmark on secure code generation, included alongside the
  NPPAD study. Every number on these pages is
  computed from the study's own result files by the scripts in tools/. Nothing is
  typed in by hand. The AI model (MultiRocket+HYDRA) is small enough to run on a
  computer at the plant itself, so it gives its answer on the spot.`;
}
async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}
function fmt(x, d = 4) { return x === null || x === undefined ? "n/a" : Number(x).toFixed(d); }
