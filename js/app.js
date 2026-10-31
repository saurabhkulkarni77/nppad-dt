"use strict";
header("app"); footer();
const $ = (id) => document.getElementById(id);

let model = null, scen = null, results = null, cur = null, linkDown = false;

function scenLabel(s) {
  if (s.kind === "test") return `${s.label} · severity ${s.severity} · ${s.file}`;
  if (s.kind === "normal") return `NORMAL OPERATION · ${s.file} · not a trained class`;
  return `PRE ONSET STEADY STATE · ${s.file} · before the accident starts`;
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
    test: `Held out test window · true class <b style="color:var(--cyan)">${cur.label}</b> · severity ${cur.severity} · onset aligned at t0 = 100 s, W = 60 s.`,
    normal: `A normal operation run from the dataset. The flight model was trained on 12 accident classes only, and normal is not one of them. Run it and watch what a closed set classifier does with out of set data.`,
    preonset: `Steady state segment from 40 s to 90 s of the ${cur.file} run, before onset at 100 s. Same warning: no accident is in progress in this window.`,
  }[cur.kind];
  $("scenMeta").innerHTML = meta;
  drawWindow();
  // recorded study predictions (playback) for test scenarios
  if (cur.kind === "test") {
    const rows = Object.entries(cur.studyPreds).map(([m, p]) => {
      const ok = p.pred === cur.label;
      const flight = m === "MultiRocket+HYDRA";
      return `<tr><td>${m}${flight ? ' <span class="tag green">FLIGHT MODEL</span>' : ""}</td>
        <td class="${ok ? "ok" : "bad"}">${p.pred}</td>
        <td class="num">${fmt(p.conf, 3)}</td>
        <td class="${ok ? "ok" : "bad"}">${ok ? "CORRECT" : "MISSED"}</td></tr>`;
    }).join("");
    $("studyBox").innerHTML = `<table class="tel"><thead><tr><th>MODEL</th><th>PREDICTED</th>
      <th style="text-align:right">CONF</th><th>vs TRUE ${cur.label}</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="dim small">Recorded from the study's executed run for this exact window.
      Playback, not a live run. The flight model's live browser result appears on the left.</p>`;
  } else {
    $("studyBox").innerHTML = `<p class="dim small">This scenario is outside the study's
      test protocol, so there are no recorded study predictions for it. Only the live
      flight model result applies, and its NumPy reference output is shown with it.</p>`;
  }
  $("resultBox").innerHTML = `<p class="dim small">Ready. Press RUN DIAGNOSIS.</p>`;
}

function logEvent(obj) {
  const s = JSON.stringify(obj);
  const bytes = new Blob([s]).size;
  const line = document.createElement("div");
  line.textContent = `[MET ${met()}] ${s} · ${bytes} B downlinked`;
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
      ? `<span style="color:var(--green)">CORRECT — matches true class ${cur.label}</span>`
      : `<span style="color:var(--red)">MISSED — true class is ${cur.label}</span>`;
  } else {
    verdict = `<span style="color:var(--amber)">OUT OF SET — no true class exists in the trained set for this window</span>`;
  }
  $("resultBox").innerHTML = `
    <div class="big">${r.pred} <small>DIAGNOSIS · CONFIDENCE ${fmt(r.conf, 3)}</small></div>
    <div class="bar" style="margin:8px 0"><i style="width:${(r.conf * 100).toFixed(1)}%"></i></div>
    <div class="kv"><span class="k">VERDICT</span><span class="v">${verdict}</span></div>
    <div class="kv"><span class="k">RUNNER UP CLASSES</span>
      <span class="v">${top3.slice(1).map(([c, p]) => `${c} ${fmt(p, 3)}`).join(" · ") || "—"}</span></div>
    <div class="kv"><span class="k">INFERENCE LATENCY (MEASURED HERE)</span><span class="v">${ms.toFixed(1)} MS</span></div>
    <div class="kv"><span class="k">NUMPY FLIGHT RUNTIME REFERENCE</span>
      <span class="v">${ref.pred} · conf ${fmt(ref.conf, 3)} · ${match ? "BROWSER PORT MATCHES" : "DIFFERS"}</span></div>
    <div class="kv"><span class="k">GROUND CONSULTED</span>
      <span class="v">${linkDown ? "NO — LINK DOWN, DIAGNOSIS UNAFFECTED" : "NO — DECIDED ON BOARD"}</span></div>`;
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
    $("modelState").textContent = "MODEL LOADED · VERIFIED " +
      results.jsVerification.argmaxAgreement + "/" +
      results.jsVerification.scenariosChecked + " AT BUILD";
    const test = scen.scenarios.filter((s) => s.kind === "test");
    const special = scen.scenarios.filter((s) => s.kind !== "test");
    const opt = (s) => `<option value="${scen.scenarios.indexOf(s)}">${scenLabel(s)}</option>`;
    $("scenSel").innerHTML =
      `<optgroup label="HELD OUT TEST WINDOWS">${test.map(opt).join("")}</optgroup>` +
      `<optgroup label="SPECIAL CASES">${special.map(opt).join("")}</optgroup>`;
    $("runBtn").disabled = false;
    showScenario();
    logEvent({ t: met(), evt: "payload_ready", model: "multirocket_hydra_ridge" });
  } catch (e) {
    $("modelState").textContent = "MODEL LOAD FAILED";
    $("dotModel").className = "dot red";
    $("scenMeta").textContent = "Could not load model data: " + e.message +
      " (serve this folder over HTTP; file:// blocks data fetches).";
  }
  $("scenSel").addEventListener("change", showScenario);
  $("runBtn").addEventListener("click", runDiagnosis);
  $("linkBtn").addEventListener("click", () => {
    linkDown = !linkDown;
    $("dotLink").className = "dot " + (linkDown ? "red" : "amber");
    $("linkState").textContent = linkDown ? "GROUND LINK: DOWN (SIMULATED)" : "GROUND LINK: DELAYED BUT UP";
    $("linkBtn").textContent = linkDown ? "RESTORE LINK" : "SIMULATE LINK LOSS";
    logEvent({ t: met(), evt: linkDown ? "link_loss_simulated" : "link_restored" });
  });
})();
