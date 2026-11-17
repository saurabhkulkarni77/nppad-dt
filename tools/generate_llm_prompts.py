#!/usr/bin/env python3
"""Build data/llm_prompts.json for the LLM study page: the exact prompt
text for every arm of the study, read from the study's own files in
~/workspace/nppad_llm_bench. Nothing here is written from memory; every
string is copied from a prompt file the study actually built, or (for
the Llama arm) produced by the study's own wrap() function from
run_local.py, verified byte for byte against the saved _prompt_tmp.txt
artifact (the Qwen variant of the same wrap).

Convention, matching the page's existing v1 to v4 section: the prompt
shown for a per window arm is the exact text sent for the first onset
window, P100_W01.

Arms with NO entry (deliberately absent, never invented):
  moment   - not a prompt arm at all: MOMENT-1 embeddings plus a trained
             logistic regression head (run_probe_tsfm.py). No prompt
             text exists.
  automl   - the designing agent's brief was given in a coordinator
  automl_v2  session and never saved to a file in the workspace; only
             the programs it wrote and the results files survive.
  agent    - Agentic PAL: the coordinator state holding the per window
             instructions lived in /tmp/agent_work and was lost before
             scoring (the study's own disclosure in finish_agent_arm.py
             and llm_benchmark_results_agent_2026-11-10.json). Only the
             agent's programs and one raw reply survive.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
BENCH = Path.home() / "workspace" / "nppad_llm_bench"

W = "P100_W01.txt"

SINGLE = {
    "v1": ("prompts", "Exact prompt text for the first onset window "
           "(P100 W01), read from the study prompt files."),
    "v2": ("prompts_v2", "Exact prompt text for the first onset window "
           "(P100 W01), read from the study prompt files."),
    "v3": ("prompts_v3", "Exact prompt text for the first onset window "
           "(P100 W01), read from the study prompt files."),
    "v4": ("prompts_v4", "Exact prompt text for the first onset window "
           "(P100 W01), read from the study prompt files."),
    "feta": ("prompts_feta", "Exact prompt text for the first onset window "
             "(P100 W01). The three labeled examples inside it are the "
             "train split windows whose curves matched this window most "
             "closely under DTW, picked per window by the builder."),
    "stats": ("prompts_stats", "Exact prompt text for the first onset "
              "window (P100 W01). The raw samples are replaced by per "
              "channel statistics computed from the window itself."),
    "llmtime": ("prompts_llmtime", "Exact prompt text for the first onset "
                "window (P100 W01), with the values rewritten in the "
                "LLMTime serialization."),
    "plugin": ("prompts_plugin", "Exact prompt text for the first onset "
               "window (P100 W01). The trained classifier output inside "
               "it (predicted class and all 12 class probabilities) is "
               "the genuine MultiRocket+HYDRA output for this window."),
    "randshot": ("prompts_randshot", "Exact prompt text for the first "
                 "onset window (P100 W01). The three labeled examples "
                 "inside it were drawn at random from the same train "
                 "split pool as the FETA arm. The clean re run received "
                 "this same full prompt text."),
    "plot": ("prompts_plot", "Exact text sent for the first onset window "
             "(P100 W01), together with that window's plot image: a 12 "
             "panel line plot, one panel per channel. The model saw the "
             "image, not the numbers."),
    "ce": ("prompts_ce", "Exact prompt text for the first onset window "
           "(P100 W01), read from the study prompt files."),
    "pet": ("prompts_pet", "Exact prompt text for the first onset window "
            "(P100 W01). One prompt per window carries the whole "
            "tournament: the window data, the 12 class signature lines, "
            "and the bracket instructions."),
    "pal": ("prompts_pal", "Exact prompt text for the first onset window "
            "(P100 W01), read from the study prompt files."),
}


def read(rel: str) -> str:
    return (BENCH / rel).read_text(encoding="utf-8")


def main() -> None:
    arms: dict[str, dict] = {}

    for arm_id, (d, note) in SINGLE.items():
        arms[arm_id] = {
            "note": note,
            "steps": [{"label": None, "text": read(f"{d}/{W}")}],
        }

    # Self consistency: the exact v3 prompt text, answered 5 times
    # (llm_benchmark_results_scpal_2026-11-10.json, methodNotes).
    arms["sc"] = {
        "note": "Self consistency used the exact Prompt v3 text. Each "
                "window prompt was answered in 5 independent rounds and "
                "the final answer was the majority vote across the 5. "
                "Shown: the v3 prompt for the first onset window "
                "(P100 W01).",
        "steps": [{"label": None, "text": read(f"prompts_v3/{W}")}],
    }

    # ReasonTSC full replication: one three round conversation per
    # protocol (build_prompts_reasontsc.py). Rounds 1 and 2 were sent
    # once per protocol; round 3 was sent per window.
    arms["reasontsc_full"] = {
        "note": "ReasonTSC ran as one three round conversation per "
                "protocol. Rounds 1 and 2 were sent once for the whole "
                "onset protocol; round 3 was sent per window.",
        "steps": [
            {"label": "Step 1 of 3: Round 1, sent once (pattern analysis)",
             "text": read("prompts_reasontsc_full/round1_P100.txt")},
            {"label": "Step 2 of 3: Round 2, sent once (refine with the "
                      "plug in classifier's worked examples)",
             "text": read("prompts_reasontsc_full/round2_P100.txt")},
            {"label": "Step 3 of 3: Round 3, per window (shown for "
                      "P100 W01)",
             "text": read(f"prompts_reasontsc_full/{W}")},
        ],
    }

    # Llama 3.2 3B: the user content was the exact v1 prompt; the full
    # string posted to llama-server was built by run_local.py's wrap().
    # Exec the study's own wrap() and prove it against the saved
    # _prompt_tmp.txt artifact before trusting the Llama variant.
    src = (BENCH / "run_local.py").read_text(encoding="utf-8")
    ns = {"__file__": str(BENCH / "run_local.py")}
    exec(src.split("def post")[0], ns)
    wrap = ns["wrap"]
    v1 = read(f"prompts/{W}")
    assert wrap(v1, "qwen") == read("_prompt_tmp.txt"), \
        "wrap() replication failed its byte check against _prompt_tmp.txt"
    arms["llama"] = {
        "note": "The full string posted to the local llama server for "
                "the first onset window: the Prompt v1 text wrapped in "
                "the Llama 3 chat template with its system line, built "
                "by run_local.py (temperature 0, seed 2026).",
        "steps": [{"label": None, "text": wrap(v1, "llama")}],
    }

    out = {
        "generatedBy": "tools/generate_llm_prompts.py, reading the "
                       "study prompt files in ~/workspace/nppad_llm_bench",
        "arms": arms,
    }
    dest = SITE / "data" / "llm_prompts.json"
    dest.write_text(json.dumps(out, indent=1, ensure_ascii=False),
                    encoding="utf-8")
    total = sum(len(s["text"]) for a in arms.values() for s in a["steps"])
    print(f"wrote {dest}: {len(arms)} arms, {total} chars of prompt text")


if __name__ == "__main__":
    main()
