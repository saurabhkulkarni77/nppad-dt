#!/usr/bin/env python3
"""
generate_seccode_data.py - data pipeline for the merged NPPAD Digital Twin's
SECURE CODE page (seccode.html).

The secure code generation prompt benchmark is a separate study (Bruni et
al. 2025, arXiv:2502.06039, replicated with Claude as the generator) that
lives in ~/workspace/prompt_bench_seccode. Its own scoring script
(scripts/score.py there) computes results/results.json from that run's
scanner outputs. This script reads that results file ON DISK and writes
data/seccode_study.json, which seccode.html renders from. No measured value
on the page is typed in by hand.

Completeness rule: the replication counts as finished only when the
results file scores ALL eight arms of the run's own arm list AND carries
both RCI (Review, Critique and Improve) passes. Until then this script
emits status "in_progress" with method information only and NO measured
values at all, and the page shows a plain in-progress note.

Run:  python3 tools/generate_seccode_data.py
"""
import json
import sys
from pathlib import Path

WS = Path.home() / "workspace"
APP = Path(__file__).resolve().parent.parent
DATA = APP / "data"
BENCH = WS / "prompt_bench_seccode"
RESULTS = BENCH / "results" / "results.json"
REPORT = BENCH / "REPORT.md"

# The run's own arm list (scripts/score.py in the benchmark workspace).
ARMS = ["baseline", "pe-03-a", "ptfscg-persona", "ptfscg-naive-secure",
        "pe-02-d", "ptfscg-cot", "rci-from-baseline", "rci-from-best"]
RCI_ARMS = ["rci-from-baseline", "rci-from-best"]

DISPLAY = {
    "baseline": "Baseline",
    "pe-03-a": "Security-aware prefix (pe-03-a)",
    "ptfscg-persona": "Security expert persona",
    "ptfscg-naive-secure": "Secure code prefix",
    "pe-02-d": "CWE-aware prefix (pe-02-d)",
    "ptfscg-cot": "Chain of Thought",
    "rci-from-baseline": "RCI from baseline",
    "rci-from-best": "RCI from best prefix",
}

DESCRIBE = {
    "baseline": "The prompt exactly as given in the dataset; no prefix, no "
                "instruction change.",
    "pe-03-a": "Adds the prefix: \u201cYou are a developer who is very "
               "security-aware and avoids weaknesses in the code.\u201d",
    "ptfscg-persona": "Inserts \u201cAct as a software security expert. "
                      "Provide outputs that a security expert would "
                      "give.\u201d ahead of the task instruction.",
    "ptfscg-naive-secure": "Rewords the task instruction itself: "
                           "\u201cGenerate secure Python code for the "
                           "following:\u201d (completion prompts: "
                           "\u201cComplete the following code securely, "
                           "and output the complete, secure program:\u201d).",
    "pe-02-d": "Adds \u201cAvoid the following CWEs in the provided "
               "prompt:\u201d followed by the MITRE name and description of "
               "that prompt's own suspected CWE.",
    "ptfscg-cot": "Chain of Thought: the ask is reworded as a question for "
                  "secure code and the answer is primed with \u201cLet's "
                  "think step by step.\u201d",
    "rci-from-baseline": "Review, Critique and Improve, one iteration, "
                         "starting from the baseline arm's own generated "
                         "code: the model reviews the code, critiques its "
                         "weaknesses, then rewrites it.",
    "rci-from-best": "Review, Critique and Improve, one iteration, starting "
                     "from the best-performing prefix arm's generated code.",
}

BANNED = ["chronos", "pinn", "sensorllm", "late fusion", "q" + "wen"]


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def check_clean(obj, where):
    blob = json.dumps(obj).lower()
    for term in BANNED:
        if term in blob:
            raise SystemExit(f"BANNED term {term!r} found in {where}")


def report_deviations():
    """Bullet lines under a 'Deviation' heading of the run's REPORT.md, if
    that file exists by the time this runs. Empty list otherwise; the
    numeric deviations (prompt count, scanner set) are derived from the
    results file itself in build_complete()."""
    if not REPORT.exists():
        return []
    out, on = [], False
    for line in REPORT.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("#"):
            on = "deviation" in s.lower()
            continue
        if on and (s.startswith("- ") or s.startswith("* ")):
            out.append(s[2:].strip())
    return out


def scanner_rows(arm_block):
    rows = []
    for s in arm_block.get("per_scanner", []):
        rows.append({
            "scanner": s["scanner"],
            "scanned": s["scanned"],
            "vulnAny": s["vuln_any"],
            "vulnAnyPct": s["vuln_any_pct"],
            "vulnSuspected": s["vuln_suspected_expanded"],
            "vulnSuspectedPct": s["vuln_suspected_expanded_pct"],
            "vulnSuspectedExactPct": s["vuln_suspected_exact_pct"],
            "totalFindings": s["total_findings"],
        })
    u = arm_block.get("union")
    if u:
        rows.append({
            "scanner": "union of both scanners",
            "scanned": u["scanned"],
            "vulnAny": u["vuln_any"],
            "vulnAnyPct": u["vuln_any_pct"],
            "vulnSuspected": u["vuln_suspected_expanded"],
            "vulnSuspectedPct": u["vuln_suspected_expanded_pct"],
            "vulnSuspectedExactPct": u["vuln_suspected_exact_pct"],
            "totalFindings": u["total_findings"],
        })
    return rows


def build():
    base = {
        "generatedBy": "tools/generate_seccode_data.py from "
                       "~/workspace/prompt_bench_seccode/results/results.json "
                       "(computed by that run's scripts/score.py from its "
                       "scanner outputs)",
        "generator": "Claude",
        "plannedArms": [{"id": a, "display": DISPLAY[a],
                         "description": DESCRIBE[a]} for a in ARMS],
    }
    if not RESULTS.exists():
        base["status"] = "in_progress"
        return base
    res = load_json(RESULTS)
    arms = res.get("arms", {})
    rci = res.get("rci", {})
    complete = (all(a in arms for a in ARMS)
                and all(a in rci for a in RCI_ARMS))
    if not complete:
        base["status"] = "in_progress"
        return base

    scanners = sorted({s["scanner"] for a in arms.values()
                       for s in a.get("per_scanner", [])})
    notes = []
    n_prompts = res.get("dataset", {}).get("n_prompts")
    if n_prompts is not None and n_prompts != 202:
        notes.append(f"The run scored {n_prompts} prompts, not the paper's "
                     f"202; see the run's own report for why.")
    if scanners != ["codeql", "semgrep"]:
        notes.append("Scanners that actually ran in this replication: "
                     + ", ".join(scanners) + " (the paper used Semgrep and "
                     "CodeQL).")
    notes.extend(report_deviations())

    out = dict(base)
    out["status"] = "complete"
    out["dataset"] = {"nPrompts": n_prompts,
                      "sources": res.get("dataset", {}).get("sources", {})}
    out["scanners"] = scanners
    out["bestPrefixArm"] = (DISPLAY.get(res.get("best_prefix_arm"),
                                        res.get("best_prefix_arm")))
    red = res.get("reduction_vs_baseline_semgrep", {})
    out["arms"] = [{
        "id": a,
        "display": DISPLAY[a],
        "description": DESCRIBE[a],
        "nPrompts": arms[a]["n_prompts"],
        "parseFailures": arms[a]["parse_failures"],
        "scanners": scanner_rows(arms[a]),
        "scannersAgreeSuspected": arms[a].get("scanners_agree_suspected"),
        "reductionVsBaseline": red.get(a),
    } for a in ARMS]
    out["rci"] = [{
        "id": a,
        "display": DISPLAY[a],
        "sourceArm": DISPLAY.get(rci[a]["source_arm"], rci[a]["source_arm"]),
        "commonScannedPrompts": rci[a]["common_scanned_prompts"],
        "anyFinding": rci[a]["any_finding"],
        "suspectedCwe": rci[a]["suspected_cwe"],
    } for a in RCI_ARMS]
    out["notes"] = notes
    check_clean(out, "seccode_study")
    return out


def main():
    DATA.mkdir(exist_ok=True)
    out = build()
    dest = DATA / "seccode_study.json"
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(f"wrote {dest} (status: {out['status']})")


if __name__ == "__main__":
    sys.exit(main())
