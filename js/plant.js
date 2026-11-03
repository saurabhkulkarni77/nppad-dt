"use strict";
header("plant"); footer();
const $ = (id) => document.getElementById(id);

/* Plain names for the accident codes, from the dataset's own class table. */
const NAMES = {
  LOCA: "loss of coolant accident, hot leg",
  LOCAC: "loss of coolant accident, cold leg",
  SLBIC: "steam line break inside the reactor building",
  SLBOC: "steam line break outside the reactor building",
  SGATR: "steam generator A tube rupture",
  SGBTR: "steam generator B tube rupture",
  RW: "control rods pulled out by mistake",
  RI: "control rods pushed in by mistake",
  FLB: "feedwater line break",
  MD: "moderator dilution (extra unborated water)",
  LR: "load rejection (the grid suddenly stops taking power)",
  LLB: "letdown line break in the auxiliary building",
};
const plain = (c) => NAMES[c] ? `${c} (${NAMES[c]})` : c;

let plant = null, cur = null, idx = 0, timer = null;

function fv(v) {
  if (v === null || v === undefined) return "n/a";
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

/* Schematic layout. Component shapes are fixed; readout text elements
   carry ids of the form val_<CHANNEL> and are filled from the data. */
function svgMarkup() {
  const line = "#2b5876", fill = "#0d2036", cyan = "#38e1ff",
        amber = "#ffb454", txt = "#cfe3f5", dim = "#7d99b8";
  const val = (id, x, y, anchor) =>
    `<text id="val_${id}" x="${x}" y="${y}" fill="${cyan}" font-size="12.5" font-family="Consolas, monospace" text-anchor="${anchor || "start"}"></text>`;
  const lab = (x, y, s, anchor, size, color) =>
    `<text x="${x}" y="${y}" fill="${color || txt}" font-size="${size || 13}" font-weight="bold" text-anchor="${anchor || "start"}">${s}</text>`;
  const note = (x, y, s, anchor) =>
    `<text x="${x}" y="${y}" fill="${dim}" font-size="10.5" text-anchor="${anchor || "start"}">${s}</text>`;
  const lead = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${dim}" stroke-width="0.8" stroke-dasharray="3 3"/>`;
  return `
  <svg viewBox="0 0 980 545" width="100%" role="img" aria-label="Pressurized water reactor schematic">
    <!-- containment -->
    <rect x="25" y="55" width="575" height="435" rx="26" fill="none" stroke="${line}" stroke-width="2" stroke-dasharray="8 5"/>
    ${lab(45, 82, "CONTAINMENT (REACTOR BUILDING)")}
    ${val("PRB", 45, 104)}${val("TRB", 45, 124)}
    <!-- reactor pressure vessel -->
    <path d="M120 215 L120 350 Q120 395 180 395 Q240 395 240 350 L240 215 Q240 185 180 185 Q120 185 120 215 Z" fill="${fill}" stroke="${cyan}" stroke-width="1.6"/>
    <rect x="132" y="285" width="96" height="60" fill="${amber}" opacity="0.35"/>
    ${lab(180, 320, "CORE", "middle", 12, amber)}
    ${lab(60, 215, "REACTOR PRESSURE VESSEL", "start", 12)}
    ${lead(88, 222, 118, 260)}
    ${val("TF", 45, 245)}${val("TAVG", 45, 265)}${val("LVCR", 45, 285)}${val("PWR", 45, 305)}
    <!-- pressurizer -->
    <path d="M315 105 L315 195 Q315 212 332 212 Q350 212 350 195 L350 105 Q350 88 332 88 Q315 88 315 105 Z" fill="${fill}" stroke="${cyan}" stroke-width="1.6"/>
    <line x1="332" y1="212" x2="300" y2="245" stroke="${cyan}" stroke-width="1.4"/>
    ${lab(365, 120, "PRESSURIZER")}
    ${lead(352, 126, 363, 126)}
    ${val("P", 365, 142)}${val("LVPZ", 365, 162)}
    <!-- steam generator -->
    <path d="M440 175 L440 360 Q440 392 475 392 Q510 392 510 360 L510 175 Q510 148 475 148 Q440 148 440 175 Z" fill="${fill}" stroke="${cyan}" stroke-width="1.6"/>
    <path d="M458 350 L458 235 Q458 218 475 218 Q492 218 492 235 L492 350" fill="none" stroke="${dim}" stroke-width="1.2"/>
    ${lab(475, 415, "STEAM GENERATOR A", "middle", 12)}
    ${val("PSGA", 520, 190)}${val("LSGA", 520, 210)}${val("NSGA", 520, 230)}
    ${lead(512, 196, 518, 196)}
    <!-- primary loop piping: hot leg vessel to SG, cold leg SG to pump to vessel -->
    <path d="M240 225 L440 195" stroke="${cyan}" stroke-width="2.2" fill="none"/>
    <path d="M440 370 L372 405 L268 372 L240 360" stroke="${cyan}" stroke-width="2.2" fill="none"/>
    ${note(300, 190, "HOT LEG")}${val("THA", 300, 208)}
    ${note(255, 415, "COLD LEG")}${val("TCA", 255, 433)}
    <!-- reactor coolant pump -->
    <circle cx="330" cy="398" r="24" fill="${fill}" stroke="${cyan}" stroke-width="1.6"/>
    ${lab(330, 403, "P", "middle", 13, cyan)}
    ${lab(330, 445, "REACTOR COOLANT PUMP", "middle", 12)}
    ${val("WRCA", 330, 463, "middle")}
    <!-- steam line to turbine -->
    <path d="M475 148 L475 120 L705 120" stroke="${amber}" stroke-width="2.2" fill="none"/>
    ${note(560, 108, "STEAM LINE")}${val("WSTA", 560, 140)}
    <!-- turbine -->
    <path d="M665 165 L760 150 L760 205 L665 190 Z" fill="${fill}" stroke="${amber}" stroke-width="1.6"/>
    ${lab(712, 225, "TURBINE", "middle", 12)}
    ${val("TBLD", 712, 243, "middle")}
    <!-- generator -->
    <rect x="790" y="152" width="105" height="52" fill="${fill}" stroke="${amber}" stroke-width="1.6"/>
    ${lab(842, 183, "GENERATOR", "middle", 12)}
    ${note(842, 220, "no measurement recorded", "middle")}
    <line x1="760" y1="178" x2="790" y2="178" stroke="${amber}" stroke-width="2.2"/>
    <!-- condenser -->
    <rect x="668" y="295" width="150" height="58" fill="${fill}" stroke="${amber}" stroke-width="1.6"/>
    ${lab(743, 320, "CONDENSER", "middle", 12)}
    ${note(743, 338, "no measurement recorded", "middle")}
    <path d="M712 205 L712 295" stroke="${amber}" stroke-width="2.2"/>
    <!-- feedwater return -->
    <path d="M700 353 L700 465 L475 465 L475 392" stroke="${amber}" stroke-width="1.8" fill="none"/>
    ${note(520, 455, "FEEDWATER RETURN")}${val("WFWA", 520, 483)}
  </svg>`;
}

function scenLabel(s) {
  if (s.kind === "test") return `${plain(s.label)} · severity ${s.severity} · ${s.file}`;
  if (s.kind === "normal") return `NORMAL OPERATION · ${s.file} · healthy running, not an accident`;
  return `BEFORE THE ACCIDENT STARTS · ${s.file} · calm data only`;
}

function render() {
  const s = cur.series;
  $("clock").textContent = `${fv(s.TIME[idx])} s`;
  $("scrub").value = idx;
  plant.components.forEach((c) => {
    c.channels.forEach((ch) => {
      const el = document.getElementById("val_" + ch.code);
      if (el) el.textContent = `${ch.code} ${fv(s[ch.code][idx])} ${ch.unit}`;
    });
  });
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; $("playBtn").textContent = "PLAY"; }
}

function showScenario() {
  stop();
  cur = plant.scenarios[Number($("scenSel").value)];
  idx = 0;
  $("scrub").max = cur.series.TIME.length - 1;
  const meta = {
    test: `A recorded test run the models had never seen. What really happened: <b style="color:var(--cyan)">${plain(cur.label)}</b> · severity ${cur.severity} · ${cur.file}. The table below shows the answer each model gave for this run.`,
    normal: `A normal, healthy run from the dataset. The models were only ever taught the 12 accident types, and "normal" is not one of them, so there is no study answer for this run.`,
    preonset: `The full recorded run behind the "before the accident" case (${cur.file}): calm running up to 100 s, then the accident starts. No study answer exists for the calm part.`,
  }[cur.kind];
  $("scenMeta").innerHTML = meta;
  const d = cur.diagnosis;
  if (cur.kind === "test" && d && d.studyPreds && Object.keys(d.studyPreds).length) {
    const rows = Object.entries(d.studyPreds).map(([m, p]) => {
      const ok = p.pred === cur.label;
      const flight = m === "MultiRocket+HYDRA";
      return `<tr><td>${m}${flight ? ' <span class="tag green">THE LIVE MODEL</span>' : ""}</td>
        <td class="${ok ? "ok" : "bad"}">${p.pred}</td>
        <td class="num">${fmt(p.conf, 3)}</td>
        <td class="${ok ? "ok" : "bad"}">${ok ? "RIGHT" : "WRONG"}</td></tr>`;
    }).join("");
    const edge = d.edgeRef ? `<div class="kv" style="margin-top:8px">
      <span class="k">THE LIVE MODEL (RUN IT YOURSELF ON "TRY THE AI")</span>
      <span class="v">${d.edgeRef.pred} · confidence ${fmt(d.edgeRef.conf, 3)}</span></div>` : "";
    $("diagBox").innerHTML = `<table class="tel"><thead><tr><th>MODEL</th><th>WHAT IT SAID</th>
      <th style="text-align:right">CONFIDENCE</th><th>RIGHT?</th></tr></thead>
      <tbody>${rows}</tbody></table>${edge}`;
  } else if (d && d.edgeRef) {
    $("diagBox").innerHTML = `<div class="kv"><span class="k">THE LIVE MODEL (RUN IT YOURSELF ON "TRY THE AI")</span>
      <span class="v">${d.edgeRef.pred} · confidence ${fmt(d.edgeRef.conf, 3)}</span></div>
      <p class="dim small" style="margin-top:6px">Notice what the model does here: it
      still names an accident, even though nothing is wrong. It only knows the 12
      accidents it was taught, and it cannot say "all is well". That is the point of
      this scenario.</p>`;
  } else {
    $("diagBox").innerHTML = "";
  }
  render();
}

(async () => {
  plant = await loadJSON("data/plant.json");
  $("plantSvg").innerHTML = svgMarkup();
  $("scenSel").innerHTML = plant.scenarios.map((s, i) =>
    `<option value="${i}">${scenLabel(s)}</option>`).join("");
  $("scenSel").addEventListener("change", showScenario);
  $("scrub").addEventListener("input", () => { stop(); idx = Number($("scrub").value); render(); });
  $("resetBtn").addEventListener("click", () => { stop(); idx = 0; render(); });
  $("playBtn").addEventListener("click", () => {
    if (timer) { stop(); return; }
    $("playBtn").textContent = "PAUSE";
    timer = setInterval(() => {
      idx += 1;
      if (idx >= cur.series.TIME.length) { idx = cur.series.TIME.length - 1; stop(); }
      render();
    }, 350);
  });
  showScenario();
})();
