#!/usr/bin/env python3
"""NPPAD Digital Twin: LLM benchmark data generator.

Emits data/llm_benchmark.json for the LLM BENCHMARK panel on ml.html.
Every number comes from the benchmark run's own results file
(~/workspace/nppad_llm_bench/llm_benchmark_results.json), which score.py
computed from the models' raw answers. Nothing is typed in here.

The benchmark: zero shot LLM classification of NPPAD test windows.
48 test windows per protocol (4 runs per class x 12 classes, stratified,
seed 2026, study split rule), W = 60 s windows at the native 10 s
sampling (6 samples per channel), 12 realistic channels serialized as
text at 3 significant figures, one identical prompt for every model.
Protocols: t0 = 100 s (onset aligned, primary) and t0 = 20 s (Task E).
Trained model rows are the study's full test split scores, recomputed
from the study's per window artifacts by the benchmark's
verify_references.py; they are references, not sample scores.
"""
from __future__ import annotations

import json
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
BENCH = Path.home() / "workspace" / "nppad_llm_bench"
SRC = BENCH / "llm_benchmark_results.json"

CHANNEL_INFO = [
    ("P", "Press RCS", "bar"),
    ("PSGA", "Pressure Steam generator A", "bar"),
    ("TAVG", "Temp RCS average", "degC"),
    ("THA", "Temp Hot leg A", "degC"),
    ("TCA", "Temp Cold leg A", "degC"),
    ("TF", "Temp Average fuel", "degC"),
    ("WRCA", "Flow Reactor coolant loop A", "t/hr"),
    ("WFWA", "Flow SG A feedwater", "t/hr"),
    ("WSTA", "Flow SG A steam", "t/hr"),
    ("WECS", "Flow Total ECCS", "t/hr"),
    ("LVPZ", "Level Pressurizer", "%"),
    ("LSGA", "Level SG A wide range", "M"),
]

SHORT = {
    "Claude (blinded agent calls)": "Claude",
    "Qwen2.5 3B Instruct (GGUF Q4_K_M, local llama.cpp)": "Qwen2.5 3B Instruct",
    "Llama 3.2 3B Instruct (GGUF Q4_K_M, local llama.cpp)": "Llama 3.2 3B Instruct",
}


def main():
    r = json.loads(SRC.read_text())
    models = []
    for name, ev in r["models"].items():
        lat = ev.get("latency", {})
        models.append({
            "name": SHORT.get(name, name),
            "access": ev["access"],
            "t0_100": ev["t0_100"],
            "t0_20": ev["t0_20"],
            "latencySeconds": lat.get("totalSeconds"),
            "latencyNote": lat.get("note"),
        })
    out = {
        "generatedBy": "tools/generate_llm_benchmark.py from the LLM "
                       "benchmark run's computed results file "
                       "(workspace/nppad_llm_bench/"
                       "llm_benchmark_results.json). No number is typed "
                       "into the page.",
        "method": {
            "seed": r["seed"],
            "windowsPerProtocol": r["sample"]["windowsPerProtocol"],
            "perClass": r["sample"]["perClass"],
            "windowSeconds": 60,
            "samplesPerChannel": 6,
            "samplingSeconds": 10,
            "serialization": "All 6 samples of each channel, in time "
                             "order, rounded to 3 significant figures, "
                             "one labeled row per channel. One identical "
                             "zero shot prompt for every model.",
            "channels": [{"code": c, "description": d, "unit": u}
                         for c, d, u in CHANNEL_INFO],
            "parsing": "Strict: an answer counts only if it is exactly "
                       "one class code after trimming. Anything else is "
                       "a parse failure and scores as wrong.",
        },
        "models": models,
        "trainedReferences": r["trainedReferences"],
        "notRun": r["notRun"],
    }
    ran_api = [m["name"] for m in models
               if m["name"].startswith(("ChatGPT", "Gemini"))]
    if ran_api:
        out["apiAccess"] = (
            "The API models above (" + "; ".join(ran_api) + ") were run "
            "through the official OpenAI and Google APIs under the same "
            "protocol as every other model. API access was provided by "
            "the user.")
    (SITE / "data" / "llm_benchmark.json").write_text(
        json.dumps(out, indent=1))
    print("data/llm_benchmark.json written:",
          [m["name"] for m in models])


if __name__ == "__main__":
    main()
