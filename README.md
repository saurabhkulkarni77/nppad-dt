# NPPAD Digital Twin

A digital twin and live console for the NPPAD nuclear power plant
accident diagnosis study. The idea in one line: a reactor accident
transient allows about sixty seconds, so the diagnosis model has to run
on a small computer at the plant itself, on the spot, and only its short
answer is ever recorded.

## Pages

The site has five pages, one per idea, in this order:

- `plant.html`: The Plant. A real time 3D model of the pressurized water
  reactor (Three.js, vendored in `js/vendor/`, scene in `js/plant3d.js`)
  with a scenario picker and time scrubber; every readout on the model
  is a recorded channel value from that scenario's run, the core glow
  follows the recorded reactor power, and the flow pulses in the pipes
  follow the recorded loop and steam flows. If WebGL is unavailable the
  page falls back to the flat schematic drawing, with the same readouts.
  Below the model, the recorded per model predictions for the run.
- `index.html`: Try the AI. The primary model
  (MultiRocket+HYDRA + ridge head) runs **live in the browser** on
  genuine study windows and times itself. Six more of the study's
  models are shown as their recorded predictions for the same windows,
  labelled as playback. CNN and GRU are not in that table: the study
  saved their results only as totals over the whole test split, never
  as a prediction for each window, and the page says so plainly.
  (This page folds in the former console page, `app.html`, retired in
  the simplification.)
- `ml.html`: What We Learned. The study findings in plain language:
  the headline results, the per model results grid and table, the four
  extensions (hard pairs, ramp accidents, unknown accident detection,
  oracle variable cost), the LLM benchmark panel, the pipeline
  in six steps, measured edge benchmarks, the backup model design, and
  the honest caveats. (This page folds in the former Analysis page,
  `analysis.html`, retired in the simplification.)
- `results.html`: Results. The full trained-model record, merged in from
  the former standalone Results Explorer on 2026-11-12: the main results
  grid (filterable by window start, window length and sensor set), the E5
  window-length study, the Transformer arm, a per-window prediction lookup
  over the recorded prediction files, extensions X1/X2, the robustness (R1)
  and unknown-accident detection (R2) studies, the official Task E file
  scores and the W60 honest-setting study, with the prediction CSVs in
  `preds/` for download.
- `llm.html`: LLM Study. The complete language-model prompt-engineering
  study, merged in from the former standalone Zero-Shot LLM Explorer on
  2026-11-12: all 22 arms (prompt versions v1 to v4, the literature
  methods, the controls and probes, the Nov 10-11 prompt-engineering
  extensions, and the API models) with accuracy and macro F1 on both
  protocols, per-arm method cards, the verbatim v1 to v4 prompt texts, the
  integrity caveats, and the UEA public-data benchmark. Its data
  (`data/llm_study.json`, like `data/study_results.json` and
  `data/explorer_preds.json`) is built by
  `tools/generate_study_data.py` from the study's result files on disk;
  the same script rebuilds `data/llm_benchmark.json` for ml.html from the
  Nov 8, 2026 revised benchmark file.

## Data integrity rule

No result on this site is hand typed. `tools/generate_data.py`
generates every data file from the study's own artifacts:

- the NPPAD-Edge model bundle (`primary_w60.npz`) for the model
  parameters in `data/model.bin`,
- the NPPAD-Edge held out test windows and its pure NumPy runtime for
  reference outputs,
- the executed all models run's saved per window class probabilities
  at this app's own protocol (onset aligned, t0 = 100 s, W = 60 s,
  realistic channels) for the recorded predictions. Each source file
  is verified inside the generator: the macro F1 recomputed from the
  probabilities must match the study's combined results grid before
  any prediction is used. CNN and GRU have no saved per window
  probabilities, so they are carried as missing, never substituted
  with predictions from a different protocol,
- the study's combined results file for the metrics grid,
- the combined results file and the executed run's extracted results
  for the findings panel on the ML page: the early window ceiling,
  the onset aligned score range and best single score, the cost of
  dropping the oracle variables, the best ramp accident score, and
  the unknown accident detection scores,
- the raw NPPAD dataset for twin playbacks and special case windows.

`tools/verify_js.cjs` checks the browser port against the NumPy
runtime on every shipped scenario and writes the agreement into
`data/results.json`. Current status: 16/16 scenario predictions match.

## Run locally

Any static server works, for example:

    python3 -m http.server 8000

then open http://localhost:8000 . Opening the files directly with
file:// will not work: browsers block the data fetches.

## Main model

MultiRocket+HYDRA kernel features (50,752) with a ridge classifier
head, onset aligned windows (t0 = 100 s, W = 60 s), 88 realistic
channels, 12 accident classes. Bundled model test macro F1 0.9838 at
W = 60 s, identical to the full precision study model. The backup
fallback is LogReg+ on summary features. Confidence is the softmax of
the head scores: indicative, not calibrated.
