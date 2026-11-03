"use strict";
header("ai"); footer();
const $ = (id) => document.getElementById(id);

let model = null, scen = null, results = null, cur = null, linkDown = false;

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

function scenLabel(s) {
  if (s.kind === "test") return `${plain(s.label)} · severity ${s.severity} · ${s.file}`;
  if (s.kind === "normal") return `NORMAL OPERATION · ${s.file} · healthy running, not an accident`;
  return `BEFORE THE ACCIDENT STARTS · ${s.file} · calm data only`;
}

function drawWindow() {
  const cv = $("winChart"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height, padL = 40, padR = 12, padT = 12, padB = 22;
  ctx.clearRect(0, 0, W, H);
  ctx.font = "10px Consolas, monospace";
  const names = ["P", "TAVG", "LVPZ"];
  const cols = ["#38e1ff", "#ffb454", "#3dff8e"];
  const idxs = names.map((n) => scen.channels.indexOf(n));
  idxs.forEach((ci, k) => {
    if (ci < 0) return;
    const vals = cur.window.map((row) => row[ci]);
    let mn = Math.min(...vals), mx = Math.max(...vals);
    if (mx - mn < 1e-9) { mx = mn + 1; }
    ctx.strokeStyle = cols[k]; ctx.lineWidth = 1.8; ctx.beginPath();
    vals.forEach((v, t) => {
      const x = padL + t / (vals.length - 1) * (W - padL - padR);
      const y = padT + (1 - (v - mn) / (mx - mn)) * (H - padT - padB);
      t ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = cols[k];
    ctx.fillText(`${names[k]} ${mn.toFixed(1)}..${mx.toFixed(1)}`, padL + k * 190, H - 6);
  });
  ctx.fillStyle = "#4d6a8c";
  for (let t = 0; t < 6; t++)
    ctx.fillText((100 + t * 10) + "s", padL + t / 5 * (W - padL - padR) - 8, padT + 2);
}

function showScenario() {
  cur = scen.scenarios[Number($("scenSel").value)];
  const meta = {
    test: `A test window the model never saw in training. What really happened: <b style="color:var(--cyan)">${plain(cur.label)}</b> · severity ${cur.severity}. The window is one minute long and starts 100 seconds into the run, as the accident gets going.`,
    normal: `A normal, healthy run. The model was only ever taught the 12 accident types, and "normal" is not one of them. Run it and watch what it does with data it was never taught: it still picks an accident.`,
    preonset: `Calm data from 40 s to 90 s of the ${cur.file} run, before the accident starts at 100 s. Same warning as above: no accident is happening in this window, but the model will still name one.`,
  }[cur.kind];
  $("scenMeta").innerHTML = meta;
  drawWindow();
  // recorded study predictions (playback) for test scenarios
  if (cur.kind === "test") {
    const rows = Object.entries(cur.studyPreds).map(([m, p]) => {
      const ok = p.pred === cur.label;
      const flight = m === "MultiRocket+HYDRA";
      return `<tr><td>${m}${flight ? ' <span class="tag green">THE LIVE MODEL</span>' : ""}</td>
        <td class="${ok ? "ok" : "bad"}">${p.pred}</td>
        <td class="num">${fmt(p.conf, 3)}</td>
        <td class="${ok ? "ok" : "bad"}">${ok ? "RIGHT" : "WRONG"}</td></tr>`;
    }).join("");
    $("studyBox").innerHTML = `<table class="tel"><thead><tr><th>MODEL</th><th>WHAT IT SAID</th>
      <th style="text-align:right">CONFIDENCE</th><th>RIGHT? (TRUE: ${cur.label})</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="dim small">These answers were recorded during the study for this exact
      window. They are played back, not run live. The live model's own answer appears
      on the left when you run it.</p>
      <p class="dim small">${(scen.studyPredsMissing || []).length ?
        scen.studyPredsMissing.join(" and ") + " are not in this table. The study kept only " +
        "their overall scores, never their answer for each window, so there is no recorded " +
        "answer to play back for this window." : ""}</p>`;
  } else {
    $("studyBox").innerHTML = `<p class="dim small">This scenario is not part of the study's
      test set, so there are no recorded study answers for it. Only the live model's
      answer applies, and the study's reference answer is shown next to it.</p>`;
  }
  $("resultBox").innerHTML = `<p class="dim small">Ready. Press RUN THE AI.</p>`;
}

function logEvent(obj) {
  const s = JSON.stringify(obj);
  const bytes = new Blob([s]).size;
  const line = document.createElement("div");
  line.textContent = `[${met()}] ${s} · ${bytes} bytes sent to Earth`;
  const log = $("eventLog");
  log.prepend(line);
}

function runDiagnosis() {
  if (!model || !cur) return;
  const t0 = performance.now();
  const r = model.predict(cur.window);
  const ms = performance.now() - t0;
  const top3 = r.proba.map((p, j) => [scen.classes[j], p])
    .sort((a, b) => b[1] - a[1]).slice(0, 3);
  const ref = cur.edgeRef;
  const match = r.pred === ref.pred;
  let verdict;
  if (cur.kind === "test") {
    verdict = r.pred === cur.label
      ? `<span style="color:var(--green)">RIGHT. It matches what really happened: ${plain(cur.label)}</span>`
      : `<span style="color:var(--red)">WRONG. What really happened was ${plain(cur.label)}</span>`;
  } else {
    verdict = `<span style="color:var(--amber)">NO RIGHT ANSWER EXISTS. This window is outside the 12 accidents the model was taught</span>`;
  }
  $("resultBox").innerHTML = `
    <div class="big">${r.pred} <small>THE AI'S ANSWER · CONFIDENCE ${fmt(r.conf, 3)}</small></div>
    <div class="bar" style="margin:8px 0"><i style="width:${(r.conf * 100).toFixed(1)}%"></i></div>
    <div class="kv"><span class="k">WAS IT RIGHT?</span><span class="v">${verdict}</span></div>
    <div class="kv"><span class="k">ITS NEXT CLOSEST GUESSES</span>
      <span class="v">${top3.slice(1).map(([c, p]) => `${c} ${fmt(p, 3)}`).join(" · ") || "none"}</span></div>
    <div class="kv"><span class="k">TIME IT TOOK HERE (MEASURED)</span><span class="v">${ms.toFixed(1)} MS</span></div>
    <div class="kv"><span class="k">THE STUDY'S REFERENCE ANSWER</span>
      <span class="v">${ref.pred} · conf ${fmt(ref.conf, 3)} · ${match ? "THIS BROWSER RUN MATCHES IT" : "DIFFERS"}</span></div>
    <div class="kv"><span class="k">DID IT ASK EARTH?</span>
      <span class="v">${linkDown ? "NO. THE LINK WAS CUT, AND THE ANSWER DID NOT CHANGE" : "NO. IT DECIDED ON ITS OWN"}</span></div>`;
  logEvent({ t: met(), cls: r.pred, conf: +r.conf.toFixed(3),
             mode: "primary", link: linkDown ? "down" : "delayed" });
}

(async () => {
  try {
    scen = await loadJSON("data/scenarios.json");
    results = await loadJSON("data/results.json");
    const mj = await loadJSON("data/model.json");
    const buf = await (await fetch("data/model.bin")).arrayBuffer();
    model = new EdgeModel(mj, buf);
    // warm up the JIT on the first scenario so timed runs are honest
    model.predict(scen.scenarios[0].window);
    $("modelState").textContent = "AI MODEL READY · MATCHED THE STUDY REFERENCE ON " +
      results.jsVerification.argmaxAgreement + "/" +
      results.jsVerification.scenariosChecked + " SCENARIOS";
    const test = scen.scenarios.filter((s) => s.kind === "test");
    const special = scen.scenarios.filter((s) => s.kind !== "test");
    const opt = (s) => `<option value="${scen.scenarios.indexOf(s)}">${scenLabel(s)}</option>`;
    $("scenSel").innerHTML =
      `<optgroup label="TEST WINDOWS (THE MODEL NEVER SAW THESE IN TRAINING)">${test.map(opt).join("")}</optgroup>` +
      `<optgroup label="SPECIAL CASES">${special.map(opt).join("")}</optgroup>`;
    $("runBtn").disabled = false;
    showScenario();
    logEvent({ t: met(), evt: "payload_ready", model: "multirocket_hydra_ridge" });
  } catch (e) {
    $("modelState").textContent = "AI MODEL FAILED TO LOAD";
    $("dotModel").className = "dot red";
    $("scenMeta").textContent = "Could not load the model data: " + e.message +
      " (this page must be opened over the web; opening the file directly blocks the data).";
  }
  $("scenSel").addEventListener("change", showScenario);
  $("runBtn").addEventListener("click", runDiagnosis);
  $("linkBtn").addEventListener("click", () => {
    linkDown = !linkDown;
    $("dotLink").className = "dot " + (linkDown ? "red" : "amber");
    $("linkState").textContent = linkDown ? "LINK TO EARTH: CUT (TEST)" : "LINK TO EARTH: SLOW BUT WORKING";
    $("linkBtn").textContent = linkDown ? "RESTORE THE LINK" : "CUT THE LINK TO EARTH";
    logEvent({ t: met(), evt: linkDown ? "link_loss_simulated" : "link_restored" });
  });
})();
