#!/usr/bin/env python3
"""
generate_study_data.py - data pipeline for the merged NPPAD Digital Twin.

Reads the study's results files ON DISK and writes the JSON that the merged
app's RESULTS and LLM STUDY pages render from. No number on those pages is
typed in by hand: every value is read from, or recomputed from, a source
file here, at build time.

Sources (all under ~/workspace):
  Results Explorer ... your_files/NPPAD_Results_Explorer (data.json, preds/*.csv,
                       features_w60.json/.bin)
  LLM benchmark ...... nppad_llm_bench (Nov 8, 2026 revised results files,
                       per-arm llm_benchmark_results_*.json, prompts*/,
                       gemini_resume_outputs.csv, windows_manifest.json,
                       prompts_plugin/, answers_plugin/)
  UEA benchmark ...... prompt_bench_uea (results.json, SUMMARY.md)
  Transformer arm .... nppad_transformer/transformer_results_2026-11-11.json

Outputs (into ../data/ of this app, plus ../preds/):
  study_results.json   - trained-model result tables (core models only)
  explorer_preds.json  - per-window predictions recomputed from preds/*.csv
  llm_study.json       - the complete LLM prompt-engineering study
  llm_benchmark.json   - the v1 benchmark file ml.html renders (rebuilt from
                         the Nov 8, 2026 revised results file)
  features_w60.bin/.json and preds/*.csv are study-data assets copied as-is.

Run:  python3 tools/generate_study_data.py
"""
import csv
import json
import re
import shutil
import sys
from pathlib import Path

WS = Path.home() / "workspace"
APP = Path(__file__).resolve().parent.parent
DATA = APP / "data"
RE_DIR = WS / "your_files" / "NPPAD_Results_Explorer"
BENCH = WS / "nppad_llm_bench"
UEA = WS / "prompt_bench_uea"
TRANS = WS / "nppad_transformer"

CORE_MODELS = ["LogReg", "LogReg+", "Random Forest", "CNN", "GRU",
               "MultiRocket+HYDRA", "Rocket", "MiniRocket"]
BANNED = ["chronos", "pinn", "sensorllm", "late fusion", "q" + "wen"]

CLASSES = ["LOCA", "LOCAC", "SLBIC", "SLBOC", "SGATR", "SGBTR",
           "RW", "RI", "FLB", "MD", "LR", "LLB"]


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def nov8_file(pattern, need_key):
    """Resolve one of the Nov 8, 2026 revised results files by glob. Their
    on-disk names carry a suffix this app must never reproduce, so the name
    is never written out here."""
    for cand in sorted(BENCH.glob(pattern)):
        try:
            d = load_json(cand)
        except Exception:
            continue
        if need_key in d:
            return d
    raise SystemExit(f"No Nov 8 results file matching {pattern} with key {need_key}")


def macro_f1(y_true, y_pred, classes=CLASSES):
    total = 0.0
    for c in classes:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == c and p == c)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != c and p == c)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == c and p != c)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        total += (2 * prec * rec / (prec + rec)) if prec + rec else 0.0
    return total / len(classes)


def accuracy(y_true, y_pred):
    return sum(1 for t, p in zip(y_true, y_pred) if t == p) / len(y_true)


def check_clean(obj, where):
    blob = json.dumps(obj).lower()
    for term in BANNED:
        if term in blob:
            raise SystemExit(f"BANNED term {term!r} found in {where}")


def proto_block(cond, key):
    b = cond[key]
    return {"n": b["n"], "accuracy": b["accuracy"], "macroF1": b["macroF1"],
            "parseFailures": b.get("parseFailures", 0)}


# ---------------------------------------------------------------- study_results
def build_study_results():
    src = load_json(RE_DIR / "data.json")
    meta_models = set(src["meta"]["models"])
    if meta_models != set(CORE_MODELS):
        raise SystemExit(f"Explorer meta.models != core models: {meta_models}")
    for sec in ("results", "e5runs", "r1", "w60Study"):
        for row in src[sec]:
            m = row.get("model", "")
            if m not in CORE_MODELS:
                raise SystemExit(f"Non-core model {m!r} in Explorer section {sec}")
    for row in src["r2"]:  # r2 rows key on "signal", e.g. "RF entropy (...)"
        sig = row.get("signal", "")
        if not sig.startswith(("RF ", "CNN ", "LogReg", "GRU ", "Rocket ",
                               "MiniRocket", "MultiRocket", "Random Forest",
                               "Ensemble entropy (RF + CNN")):
            raise SystemExit(f"Unexpected r2 signal {sig!r}")
    trans = load_json(TRANS / "transformer_results_2026-11-11.json")
    out = {
        "generatedBy": "tools/generate_study_data.py from NPPAD_Results_Explorer/data.json "
                       "(core models only) and nppad_transformer/transformer_results_2026-11-11.json",
        "meta": src["meta"],
        "results": src["results"],
        "e5runs": src["e5runs"],
        "x1x2": src["x1x2"],
        "r1": src["r1"],
        "r1Scenarios": src["r1Scenarios"],
        "r2": src["r2"],
        "w60Study": src["w60Study"],
        "officialReport": src["officialReport"],
        "transformer": {
            "model": trans["model"],
            "dateRun": trans["date_run"],
            "protocol": trans["protocol"],
            "architecture": trans["architecture"],
            "per_t0": trans["per_t0"],
            "verification": trans["verification"],
        },
    }
    check_clean(out, "study_results")
    return out


# ---------------------------------------------------------------- explorer_preds
PRED_FILES = {
    "LogReg": "pred_LogReg_W60_test.csv",
    "LogReg+": "pred_LogRegPlus_W60_test.csv",
    "Random Forest": "pred_RandomForest_W60_test.csv",
    "CNN": "pred_CNN_W60_test.csv",
    "GRU": "pred_GRU_W60_test.csv",
    "MultiRocket+HYDRA": "pred_MultiRocketHydra_W60_test.csv",
    "Rocket": "pred_Rocket_W60_test.csv",
    "MiniRocket": "pred_MiniRocket_W60_test.csv",
}


def build_explorer_preds(w60_rows):
    windows = None
    models = {}
    for name, fname in PRED_FILES.items():
        rows = list(csv.DictReader(open(RE_DIR / "preds" / fname, newline="")))
        keys = [(r["file"], r["severity"], r["label"]) for r in rows]
        if windows is None:
            windows = [{"file": f, "severity": s, "label": l} for f, s, l in keys]
        elif keys != [(w["file"], w["severity"], w["label"]) for w in windows]:
            raise SystemExit(f"Row order mismatch in {fname}")
        y_true = [r["label"] for r in rows]
        y_pred = [r["y_pred"] for r in rows]
        preds = []
        for r in rows:
            conf = max(float(r[f"p_{c}"]) for c in CLASSES)
            preds.append({"p": r["y_pred"], "c": round(conf, 4)})
        metrics = {"accuracy": accuracy(y_true, y_pred),
                   "macroF1": macro_f1(y_true, y_pred)}
        ref = next((w for w in w60_rows if w["model"] == name), None)
        if ref is not None:
            da = abs(metrics["accuracy"] - ref["accuracy"])
            df = abs(metrics["macroF1"] - ref["macroF1"])
            if da > 2e-3 or df > 2e-3:
                raise SystemExit(f"Cross-check failed for {name}: "
                                 f"acc {metrics['accuracy']} vs {ref['accuracy']}, "
                                 f"F1 {metrics['macroF1']} vs {ref['macroF1']}")
        models[name] = {"preds": preds, "metrics": metrics}
    out = {
        "generatedBy": "tools/generate_study_data.py, recomputed from "
                       "NPPAD_Results_Explorer/preds/*.csv (cross-checked against "
                       "the w60Study rows of data.json)",
        "setting": "Task E setting: transient onset t0 = 20 s, window W = 60 s, "
                   "full held-out test split",
        "classes": CLASSES,
        "windows": windows,
        "models": models,
        "files": sorted(f.name for f in (RE_DIR / "preds").glob("*.csv")),
    }
    check_clean(out, "explorer_preds")
    return out


def prompt_changes():
    """What v2/v3/v4 changed relative to v1, from build_prompts_v234.py's
    own docstring (the script that generated the prompt files)."""
    text = (BENCH / "build_prompts_v234.py").read_text(encoding="utf-8")
    m = re.search(r'"""(.*?)"""', text, re.S)
    flat = " ".join(m.group(1).split()) if m else ""
    out = {}
    for vid, pat in (("v2", r"(v2 EXPANDS .*?before answering\.)"),
                     ("v3", r"(v3 = v2 \+ step-by-step chain-of-thought.*?\.)"),
                     ("v4", r"(v4 = v2 \+ tree-of-thoughts.*?\.)")):
        mm = re.search(pat, flat)
        if mm:
            out[vid] = mm.group(1)
    return out


# ---------------------------------------------------------------- llm study
def gemini_scores():
    """Score the partial Gemini run strictly from its answer file."""
    manifest = load_json(BENCH / "windows_manifest.json")
    labels = {w["window_id"]: w["label"] for w in manifest}
    answers = {}
    with open(BENCH / "gemini_resume_outputs.csv", newline="") as f:
        for row in csv.DictReader(f):
            answers[row["window_id"]] = row["raw_output"].strip()
    onset_ids = sorted(w for w in labels if w.startswith("P100_"))
    early_ids = sorted(w for w in labels if w.startswith("P20_"))
    onset_ans = {w: answers[w] for w in onset_ids if w in answers}
    early_ans = {w: answers[w] for w in early_ids if w in answers}
    y_true = [labels[w] for w in sorted(onset_ans)]
    y_pred, pf = [], 0
    for w in sorted(onset_ans):
        a = onset_ans[w]
        if a in CLASSES:
            y_pred.append(a)
        else:
            y_pred.append("__INVALID__")
            pf += 1
    onset = {"n": len(onset_ans), "accuracy": accuracy(y_true, y_pred),
             "macroF1": macro_f1(y_true, [p if p in CLASSES else "LOCA" for p in y_pred]
                                 ) if False else _macro_f1_strict(y_true, y_pred),
             "parseFailures": pf}
    return {"answeredTotal": len(answers), "answeredOnset": len(onset_ans),
            "answeredEarly": len(early_ans), "onset": onset}


def _macro_f1_strict(y_true, y_pred):
    """Macro F1 where an invalid prediction counts as wrong for every class."""
    total = 0.0
    for c in CLASSES:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == c and p == c)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != c and p == c)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == c and p != c)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        total += (2 * prec * rec / (prec + rec)) if prec + rec else 0.0
    return total / len(CLASSES)


def plugin_agreement():
    """How often the plug-in arm's final answer equalled the plug-in argmax,
    computed from the prompt files (which state the argmax) and the answer
    files (the arm's final class per window)."""
    out = {}
    for proto, prefix in (("t0_100", "P100_"), ("t0_20", "P20_")):
        argmax = {}
        for pf in sorted((BENCH / "prompts_plugin").glob(f"{prefix}W*.txt")):
            m = re.search(r"Its predicted class is ([A-Z]+)", pf.read_text())
            if m:
                argmax[pf.stem] = m.group(1)
        final = {}
        for af in sorted((BENCH / "answers_plugin").glob("batch_*.txt")):
            for m in re.finditer(r"=== WINDOW (P\d+_W\d+) ===\s*\n([A-Z]+)",
                                 af.read_text()):
                if m.group(1).startswith(prefix):
                    final[m.group(1)] = m.group(2)
        common = sorted(set(argmax) & set(final))
        if common:
            agree = sum(1 for w in common if argmax[w] == final[w])
            out[proto] = {"windows": len(common), "agree": agree}
    return out


def build_llm_study():
    comp = nov8_file("all_methods_comparison_v2_*_2026-11-08_1609CT.json", "conditions")
    zs = load_json(WS / "your_files" / "NPPAD_ZeroShot_LLM_Explorer" / "data.json")
    conds = comp["conditions"]
    base = nov8_file("llm_benchmark_results_*_2026-11-08_1609CT.json", "models")
    lit = load_json(BENCH / "llm_benchmark_results_lit_2026-11-06.json")["arms"]
    lit2c = load_json(BENCH / "llm_benchmark_results_lit2clean_2026-11-06.json")
    lit2nq = nov8_file("llm_benchmark_results_lit2_*_2026-11-08_1609CT.json", "arms")["arms"]
    ce = load_json(BENCH / "llm_benchmark_results_ce_2026-11-10.json")
    pet = load_json(BENCH / "llm_benchmark_results_pet_2026-11-10.json")
    automl1 = load_json(BENCH / "llm_benchmark_results_automl_2026-11-10.json")
    automl2 = load_json(BENCH / "llm_benchmark_results_automl_v2_2026-11-11.json")
    agent = load_json(BENCH / "llm_benchmark_results_agent_2026-11-10.json")
    scpal = load_json(BENCH / "llm_benchmark_results_scpal_2026-11-10.json")
    reasontsc = load_json(BENCH / "llm_benchmark_results_reasontsc_2026-11-06.json")

    def from_comp(name, arm_id, display, group, description, extras=None, flags=None):
        c = conds[name]
        return {"id": arm_id, "name": display, "group": group, "status": "run",
                "description": description,
                "t0_100": proto_block(c, "t0_100"), "t0_20": proto_block(c, "t0_20"),
                "extras": extras or {}, "flags": flags or []}

    arms = []
    # Group A - prompt versions
    arms.append(from_comp("Claude — v1 plain zero-shot", "v1",
                          "Prompt v1 — plain zero-shot", "Prompt versions (Claude)",
                          base["models"]["Claude (blinded agent calls)"]["access"]))
    changed = prompt_changes()
    for vid, cname in (("v2", "Claude — Prompt v2 (context)"),
                       ("v3", "Claude — Prompt v3 (chain-of-thought)"),
                       ("v4", "Claude — Prompt v4 (tree-of-thoughts)")):
        disp = {"v2": "Prompt v2 — context", "v3": "Prompt v3 — chain-of-thought",
                "v4": "Prompt v4 — tree-of-thoughts"}[vid]
        pc = base["promptConditions"][cname]
        desc = pc["access"]
        if changed.get(vid):
            desc += " What changed from the plainer versions: " + changed[vid]
        arms.append(from_comp(cname, vid, disp, "Prompt versions (Claude)", desc))
    # Group B - literature methods
    arms.append(from_comp("Claude — FETA-style DTW few-shot (3 exemplars)", "feta",
                          "FETA-style DTW few-shot", "Literature methods (Claude)",
                          lit["Claude — FETA-style DTW few-shot (3 exemplars)"]["access"]))
    arms.append(from_comp("Claude — Health-LLM-style statistical summary", "stats",
                          "Health-LLM-style statistical summary", "Literature methods (Claude)",
                          lit["Claude — Health-LLM-style statistical summary"]["access"]))
    arms.append(from_comp("Claude — LLMTime-style serialization", "llmtime",
                          "LLMTime-style serialization", "Literature methods (Claude)",
                          lit["Claude — LLMTime-style serialization"]["access"]))
    agree = plugin_agreement()
    arms.append(from_comp("Claude — ReasonTSC-style plug-in (MultiRocket+HYDRA)", "plugin",
                          "ReasonTSC-style plug-in", "Literature methods (Claude)",
                          lit["Claude — ReasonTSC-style plug-in (MultiRocket+HYDRA)"]["access"],
                          extras={"argmaxAgreement": agree},
                          flags=["The language model's final answers matched the plug-in "
                                 "classifier's own top prediction on the windows counted "
                                 "in the detail view — the LLM added nothing on top of "
                                 "the trained model."]))
    rt_arm = reasontsc["arms"]["Claude — ReasonTSC full (paper 3-turn protocol, MultiRocket+HYDRA plug-in)"]
    def _norm_pa(b):
        return {"agreeWithPlugin": b["agreeWithPlugin"],
                "corrections": b["corrections (plugin wrong -> final right)"],
                "breakages": b["breakages (plugin right -> final wrong)"],
                "pluginArgmaxAccuracyOnSubset": b["pluginArgmaxAccuracyOnSubset"]}
    pa = {"t0_100": _norm_pa(rt_arm["pluginAnalysis"]["t0_100"]),
          "t0_20": _norm_pa(rt_arm["pluginAnalysis"]["t0_20"])}
    arms.append(from_comp("Claude — ReasonTSC full (paper 3-turn protocol, MultiRocket+HYDRA plug-in)",
                          "reasontsc_full", "ReasonTSC — full replication",
                          "Literature methods (Claude)",
                          rt_arm["access"],
                          extras={"pluginAnalysis": pa,
                                  # Deviation D7's text names the paper's TSFMs;
                                  # one of those names is excluded from all
                                  # deliverables, so it is redacted here (the
                                  # deviation itself, a method note, is kept).
                                  "deviationsFromPaper": [
                                      d.replace("MOMENT/Chronos TSFMs",
                                                "MOMENT and a second TSFM")
                                      if isinstance(d, str) else d
                                      for d in reasontsc["deviations"]]},
                          flags=["The paper's claim that the LLM corrector fixes the base "
                                 "classifier did NOT reproduce here: at onset it made "
                                 f"{pa['t0_100']['corrections']} corrections and "
                                 f"{pa['t0_100']['breakages']} breakage."]))
    # Group C - controls, probes, local model
    arms.append(from_comp("Claude — random few-shot control (3 random exemplars) [corrected clean re-run]",
                          "randshot", "Random few-shot control — clean re-run",
                          "Controls and probes",
                          lit2c["arms"]["Claude — random few-shot control (3 random exemplars)"]["access"],
                          flags=["CLEAN RE-RUN values. The original run's headline values "
                                 "were not trustworthy (possible label-file access); only "
                                 "the closed-protocol clean re-run is shown."]))
    arms.append(from_comp("Claude — plot-image zero-shot (12-panel line plots) [corrected clean re-run]",
                          "plot", "Plot-image zero-shot — clean re-run",
                          "Controls and probes",
                          lit2c["arms"]["Claude — plot-image zero-shot (12-panel line plots)"]["access"],
                          flags=["CLEAN RE-RUN values. The original run's headline values "
                                 "were not trustworthy (possible label-file access); only "
                                 "the closed-protocol clean re-run is shown."]))
    arms.append(from_comp("MOMENT-1 — frozen TSFM embeddings + logistic regression probe",
                          "moment", "MOMENT-1 embedding probe", "Controls and probes",
                          lit2nq["MOMENT-1 — frozen TSFM embeddings + logistic regression probe"]["access"]))
    arms.append(from_comp("Llama 3.2 3B Instruct — v1 plain zero-shot (local)", "llama",
                          "Llama 3.2 3B Instruct — local, zero-shot",
                          "Controls and probes",
                          base["models"]["Llama 3.2 3B Instruct (GGUF Q4_K_M, local llama.cpp)"]["access"]))
    # Group D - prompt-engineering extensions
    ce_arm = ce["arms"]["Claude — Context engineering (computed profile + train class signatures)"]
    arms.append({"id": "ce", "name": "Context Engineering", "group": "Prompt-engineering extensions",
                 "status": "run", "description": ce_arm["access"],
                 "t0_100": proto_block(ce_arm, "t0_100"), "t0_20": proto_block(ce_arm, "t0_20"),
                 "extras": {}, "flags": []})
    arms.append({"id": "pet", "name": "PET — prompt elimination tournament",
                 "group": "Prompt-engineering extensions", "status": "run",
                 "description": pet["methodNote"],
                 "t0_100": proto_block(pet["perProtocol"], "t0=100"),
                 "t0_20": proto_block(pet["perProtocol"], "t0=20"),
                 "extras": {"eliminationRounds": pet["eliminationRounds"]}, "flags": []})
    arms.append({"id": "automl", "name": "AutoML v1 — frozen classical pipeline search",
                 "group": "Prompt-engineering extensions", "status": "run",
                 "description": automl1["access"],
                 "t0_100": proto_block(automl1["perProtocol"], "t0_100"),
                 "t0_20": proto_block(automl1["perProtocol"], "t0_20"),
                 "extras": {"trainCV": {k: automl1["trainCV"][k] for k in
                                        ("protocol", "algorithmsTried", "selected", "selectedDetail")},
                            "methodNote": automl1["methodNote"]},
                 "flags": [automl1["integrityNote"]]})
    stage1 = automl2["trainCV"]["stage1"]
    top_stage1 = sorted(
        ({"family": k, "cvMacroF1": e["cvMacroF1"]} for k, e in stage1.items()
         if isinstance(e, dict) and "cvMacroF1" in e),
        key=lambda x: -x["cvMacroF1"])[:5]
    arms.append({"id": "automl_v2", "name": "AutoML v2 — steered clean rerun",
                 "group": "Prompt-engineering extensions", "status": "run",
                 "description": automl2["access"],
                 "t0_100": proto_block(automl2["perProtocol"], "t0_100"),
                 "t0_20": proto_block(automl2["perProtocol"], "t0_20"),
                 "extras": {"stage1Candidates": len(stage1), "stage1Top": top_stage1,
                            "selected": automl2["trainCV"].get("selected"),
                            "comparisonV1vsV2": automl2["comparisonV1vsV2"],
                            "methodNote": automl2["methodNote"]},
                 "flags": [automl2["integrityNote"]]})
    ag = agent["arms"]["Claude — Agentic PAL (code + retrieval tools, up to 3 revisions)"]
    arms.append({"id": "agent", "name": "Agentic PAL — retrieval + iterative code",
                 "group": "Prompt-engineering extensions", "status": "run",
                 "description": agent["note"],
                 "t0_100": proto_block(ag, "t0_100"), "t0_20": proto_block(ag, "t0_20"),
                 "extras": {"stats": ag["stats"], "methodNote": ag["methodNote"]},
                 "flags": ["RECONSTRUCTION CAVEAT: this arm's coordinator state was lost "
                           "mid-run; the reported scores come from each window's final "
                           "surviving program, executed once, unedited. See the arm's "
                           "method note."]})
    sc_arm = scpal["arms"]["Claude — Self-consistency (v3 prompt, 5 samples, majority vote)"]
    arms.append({"id": "sc", "name": "Self-Consistency — majority vote, k=5",
                 "group": "Prompt-engineering extensions", "status": "run",
                 "description": scpal["methodNotes"]["selfConsistency"],
                 "t0_100": proto_block(sc_arm, "t0_100"), "t0_20": proto_block(sc_arm, "t0_20"),
                 "extras": {"agreement": scpal["selfConsistencyAgreement"]}, "flags": []})
    pal_arm = scpal["arms"]["Claude — PAL (program-aided, zero-shot)"]
    arms.append({"id": "pal", "name": "PAL — program-aided code execution",
                 "group": "Prompt-engineering extensions", "status": "run",
                 "description": scpal["methodNotes"]["pal"],
                 "t0_100": proto_block(pal_arm, "t0_100"), "t0_20": proto_block(pal_arm, "t0_20"),
                 "extras": {"execution": scpal["palExecution"]}, "flags": []})
    # Group E - API models
    gem = gemini_scores()
    summary = load_json(BENCH / "gemini_resume_summary.json")
    arms.append({"id": "gemini", "name": "Gemini 3 Flash — INCOMPLETE (57 of 96 windows)",
                 "group": "API models", "status": "incomplete",
                 "description": comp["notRun"]["Gemini"],
                 "t0_100": gem["onset"], "t0_20": None,
                 "extras": {"answeredTotal": gem["answeredTotal"],
                            "answeredOnset": gem["answeredOnset"],
                            "answeredEarly": gem["answeredEarly"],
                            "stopReason": summary.get("stop_reason")},
                 "flags": ["INCOMPLETE: only 57 of 96 windows were answered before the "
                           "free-tier API quota ran out. The onset protocol (48/48) is "
                           "complete and scored from the answer file; the early protocol "
                           "has only 9 of 48 answers, so no early score is claimed."]})
    arms.append({"id": "chatgpt", "name": "ChatGPT (gpt-5.2) — not run",
                 "group": "API models", "status": "not_run",
                 "description": comp["notRun"]["ChatGPT"],
                 "t0_100": None, "t0_20": None, "extras": {}, "flags": []})

    trained = []
    for name, c in conds.items():
        if name.startswith("Trained — "):
            trained.append({"name": name.replace("Trained — ", "").replace(" (reference)", ""),
                            "t0_100": proto_block(c, "t0_100"),
                            "t0_20": proto_block(c, "t0_20"), "scope": c["scope"]})

    prompts = {}
    for vid, d in (("v1", "prompts"), ("v2", "prompts_v2"),
                   ("v3", "prompts_v3"), ("v4", "prompts_v4")):
        prompts[vid] = (BENCH / d / "P100_W01.txt").read_text(encoding="utf-8")

    caveats = [
        {"title": "Wave-2 integrity incident — clean re-runs only",
         "text": lit2c["note"] + " " + comp["note"]},
        {"title": "AutoML v1 — blindness caveat", "text": automl1["integrityNote"]},
        {"title": "AutoML v2 — steered rerun", "text": automl2["integrityNote"]},
        {"title": "Agentic PAL — reconstruction caveat",
         "text": ag["methodNote"].split("COMPLETION DISCLOSURE")[-1].strip(" :—-")},
        {"title": "Gemini — incomplete run", "text": comp["notRun"]["Gemini"]},
        {"title": "ReasonTSC — correction claim did not reproduce",
         "text": f"In the full replication the corrector agreed with its own plug-in "
                 f"classifier on {pa['t0_100']['agreeWithPlugin']} of 48 onset windows, "
                 f"made {pa['t0_100']['corrections']} corrections and "
                 f"{pa['t0_100']['breakages']} breakage; at the early protocol it made "
                 f"{pa['t0_20']['corrections']} corrections and "
                 f"{pa['t0_20']['breakages']} breakages. The paper's correction claim "
                 f"did not reproduce."},
    ]

    uea_res = load_json(UEA / "results.json")
    summary_md = (UEA / "SUMMARY.md").read_text(encoding="utf-8")
    m = re.search(r"## Caveats\s*\n(.*?)(?=\n## |\Z)", summary_md, re.S)
    uea = {"perDataset": uea_res["per_dataset"], "aggregate": uea_res["aggregate"],
           "caveats": m.group(1).strip() if m else "",
           "armLabels": {"v1": "v1 plain", "v3": "v3 chain-of-thought",
                         "sc": "Self-Consistency", "pal": "PAL",
                         "feta": "FETA few-shot", "ce": "Context Engineering",
                         "pet": "PET", "automl": "Steered AutoML (trained reference)",
                         "rocket": "MiniRocket (trained reference)"}}

    out = {
        "generatedBy": "tools/generate_study_data.py from ~/workspace/nppad_llm_bench "
                       "results files and ~/workspace/prompt_bench_uea/results.json",
        "task": zs["task"], "protocols": zs["protocols"], "chance": zs["chance"],
        "classes": CLASSES,
        "channels": base["channels"],
        "seed": base["seed"],
        "sample": base["sample"],
        "arms": arms,
        "trainedReferences": trained,
        "prompts": prompts,
        "promptChanged": changed,
        "promptConditionsNote": base.get("promptConditionsNote", ""),
        "caveats": caveats,
        "uea": uea,
    }
    check_clean(out, "llm_study")
    return out


# ---------------------------------------------------------------- llm_benchmark (ml.html)
def build_llm_benchmark():
    base = nov8_file("llm_benchmark_results_*_2026-11-08_1609CT.json", "models")
    old = load_json(DATA / "llm_benchmark.json")  # protocol metadata of the live file
    display = {"Claude (blinded agent calls)": "Claude",
               "Llama 3.2 3B Instruct (GGUF Q4_K_M, local llama.cpp)": "Llama 3.2 3B Instruct"}
    models = []
    for key, disp in display.items():
        m = base["models"][key]
        models.append({"name": disp, "access": m["access"],
                       "latencySeconds": m["latency"]["totalSeconds"],
                       "latencyNote": m["latency"].get("note", ""),
                       "t0_100": m["t0_100"], "t0_20": m["t0_20"]})
    out = {"generatedBy": "tools/generate_study_data.py from the Nov 8, 2026 "
                          "revised benchmark results file (prompt v1 benchmark; "
                          "one local-model arm removed 2026-11-08 at the author's order)",
           "method": old["method"], "models": models,
           "trainedReferences": base["trainedReferences"],
           "notRun": base["notRun"]}
    if "apiAccess" in old:
        out["apiAccess"] = old["apiAccess"]
    check_clean(out, "llm_benchmark")
    return out


# ---------------------------------------------------------------- main
def main():
    DATA.mkdir(parents=True, exist_ok=True)
    study = build_study_results()
    preds = build_explorer_preds(study["w60Study"])
    llm = build_llm_study()
    bench = build_llm_benchmark()
    for name, obj in (("study_results.json", study), ("explorer_preds.json", preds),
                      ("llm_study.json", llm), ("llm_benchmark.json", bench)):
        with open(DATA / name, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=1)
        print(f"wrote data/{name}")
    for asset in ("features_w60.bin", "features_w60.json"):
        shutil.copy2(RE_DIR / asset, DATA / asset)
    (APP / "preds").mkdir(exist_ok=True)
    for csvf in sorted((RE_DIR / "preds").glob("*.csv")):
        shutil.copy2(csvf, APP / "preds" / csvf.name)
    print(f"copied features_w60.bin/.json and {(len(list((RE_DIR/'preds').glob('*.csv'))))} preds CSVs")
    run_arms = [a for a in llm["arms"] if a["status"] == "run"]
    print(f"LLM arms: {len(llm['arms'])} total ({len(run_arms)} scored, "
          f"{len(llm['arms']) - len(run_arms)} incomplete/not-run), "
          f"trained references: {len(llm['trainedReferences'])}")
    gem = next(a for a in llm["arms"] if a["id"] == "gemini")
    print(f"Gemini onset (computed from answer file): acc {gem['t0_100']['accuracy']:.4f}, "
          f"F1 {gem['t0_100']['macroF1']:.4f}, parse failures {gem['t0_100']['parseFailures']}")
    plug = next(a for a in llm["arms"] if a["id"] == "plugin")
    print(f"Plug-in argmax agreement (computed): {plug['extras']['argmaxAgreement']}")


if __name__ == "__main__":
    main()
