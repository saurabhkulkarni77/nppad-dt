"use strict";
header("seccode"); footer();

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function tel(headers, rows) {
  const th = headers.map(h => `<th>${h}</th>`).join("");
  return `<table class="tel"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}
function num(x, d = 2) { return `<td class="num">${fmt(x, d)}</td>`; }
function pct(x) { return x === null || x === undefined ? "n/a" : `${fmt(x, 2)}%`; }

function techniqueList(d) {
  const rows = (d.plannedArms || []).map(a =>
    `<tr><td>${esc(a.display)}</td><td>${esc(a.description)}</td></tr>`).join("");
  document.getElementById("techniqueList").innerHTML =
    tel(["TECHNIQUE", "WHAT IT CHANGES"], rows);
}

function inProgress(d) {
  document.getElementById("replBody").innerHTML = `
    <p><b>Replication in progress — results will appear here when the run
    completes.</b></p>
    <p class="dim small">The replication is generating code for the full
    prompt set under all eight technique arms with Claude as the generator,
    then scanning every generated program and scoring the run from the
    scanner outputs. This panel stays free of numbers until the run's own
    results file is complete; partial arms are not shown, because a
    half-finished table would read as a result.</p>`;
}

function complete(d) {
  let h = "";
  const src = Object.entries(d.dataset.sources || {})
    .map(([k, v]) => `${esc(k)} ${v}`).join(" · ");
  h += `<p class="dim small">Prompt set as actually scored: ${d.dataset.nPrompts} ` +
    `prompts (${src}). Generator: ${esc(d.generator)}. Scanners that ran: ` +
    `${d.scanners.map(esc).join(", ")}. Best prefix arm: ${esc(d.bestPrefixArm || "n/a")}.</p>`;

  const rows = [];
  for (const a of d.arms) {
    a.scanners.forEach((s, i) => {
      const red = i === 0 ? a.reductionVsBaseline : null;
      rows.push(`<tr><td>${i === 0 ? esc(a.display) : ""}</td>` +
        `<td>${esc(s.scanner)}</td>${num(s.scanned, 0)}${num(a.parseFailures, 0)}` +
        `${num(s.vulnAnyPct)}${num(s.vulnSuspectedPct)}${num(s.totalFindings, 0)}` +
        `<td class="num">${red ? pct(red.reduction_vuln_any_relative_pct) : "—"}</td></tr>`);
    });
    if (a.scannersAgreeSuspected) {
      h += "";
      rows.push(`<tr><td></td><td class="dim">both scanners flag the suspected CWE</td>` +
        `<td class="num" colspan="4">${a.scannersAgreeSuspected.count} programs ` +
        `(${pct(a.scannersAgreeSuspected.pct)})</td><td></td></tr>`);
    }
  }
  h += tel(["TECHNIQUE", "SCANNER", "SCANNED", "PARSE FAILURES",
            "% WITH ANY FINDING", "% WITH SUSPECTED CWE", "TOTAL FINDINGS",
            "CHANGE VS BASELINE (ANY FINDING, FIRST SCANNER)"],
           rows.join(""));
  h += `<p class="dim small">Rates are shares of the arm's full prompt set. ` +
    `“Suspected CWE” counts a program when a finding matches the prompt's own ` +
    `suspected CWE under the paper's expanded matching (the CWE itself, its ` +
    `MITRE “can also be” list, or MITRE's recommended mappings).</p>`;

  if (d.rci && d.rci.length) {
    const view = (r, key) => {
      const v = r[key];
      return `<tr><td>${esc(r.display)}</td><td>${esc(r.sourceArm)}</td>` +
        `${num(r.commonScannedPrompts, 0)}${num(v.source_vuln, 0)}${num(v.repaired, 0)}` +
        `<td class="num">${pct(v.repaired_pct_of_source_vuln)}</td>` +
        `${num(v.broken, 0)}${num(v.still_vuln, 0)}</tr>`;
    };
    h += `<h4 style="margin-top:14px">RCI: WHAT THE REVIEW PASS FIXED AND BROKE (ANY FINDING)</h4>`;
    h += tel(["RCI ARM", "STARTED FROM", "COMMON PROMPTS", "SOURCE VULNERABLE",
              "REPAIRED", "REPAIRED %", "BROKEN", "STILL VULNERABLE"],
             d.rci.map(r => view(r, "anyFinding")).join(""));
    h += `<h4 style="margin-top:14px">RCI, SUSPECTED-CWE FINDINGS ONLY</h4>`;
    h += tel(["RCI ARM", "STARTED FROM", "COMMON PROMPTS", "SOURCE VULNERABLE",
              "REPAIRED", "REPAIRED %", "BROKEN", "STILL VULNERABLE"],
             d.rci.map(r => view(r, "suspectedCwe")).join(""));
    h += `<p class="dim small">Repaired: vulnerable in the source arm, clean ` +
      `after the review pass. Broken: clean in the source arm, vulnerable after ` +
      `it. Both counted on the prompts both arms scanned.</p>`;
  }

  if (d.notes && d.notes.length) {
    h += `<h4 style="margin-top:14px">DEVIATIONS AND NOTES FROM THE RUN</h4>` +
      d.notes.map(n => `<p class="dim small">${esc(n)}</p>`).join("");
  }
  document.getElementById("replBody").innerHTML = h;
}

loadJSON("data/seccode_study.json").then(d => {
  techniqueList(d);
  if (d.status === "complete") complete(d); else inProgress(d);
}).catch(e => {
  document.getElementById("replBody").innerHTML =
    `<p class="dim small">The replication study file could not be loaded (${esc(e.message)}).</p>`;
});
