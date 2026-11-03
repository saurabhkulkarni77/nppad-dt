# NPPAD Digital Twin

A NASA mission style digital twin and flight console for the NPPAD
nuclear power plant accident diagnosis study, built for applying the
diagnosis algorithm in space, at the edge.

The premise follows the Mars Society's account of real time decision
making on Mars: interplanetary light time delay makes ground control
too slow to close a control loop, bandwidth is scarce, and the only
workable answer is onboard autonomy: process at the point of capture,
downlink only results, and design for faults. A reactor accident
transient allows sixty seconds. Ground cannot be in that loop.

## Pages

The site was simplified to three pages, one per idea, in this order:

- `plant.html`: The Plant. An interactive schematic of the pressurized
  water reactor with a scenario picker and time scrubber; every readout
  on the drawing is a recorded channel value from that scenario's run.
  Below the drawing, the recorded per model predictions for the run.
- `index.html`: Try the AI. The primary flight model
  (MultiRocket+HYDRA + ridge head) runs **live in the browser** on
  genuine study windows and times itself. Six more of the study's
  models are shown as their recorded predictions for the same windows,
  labelled as playback. CNN and GRU are not in that table: the study
  saved their results only as totals over the whole test split, never
  as a prediction for each window, and the page says so plainly.
  Includes a link loss simulation: the diagnosis does not change,
  because it never used the link. (This page folds in the former Space
  App console, `app.html`, retired in the simplification.)
- `ml.html`: What We Learned. The study findings in plain language:
  the headline results, the per model results grid and table, the four
  extensions (hard pairs, ramp accidents, unknown accident detection,
  oracle variable cost), the LLM benchmark panel, the onboard pipeline
  in six steps, measured edge benchmarks, safe mode design, and the
  honest caveats. (This page folds in the former Analysis page,
  `analysis.html`, retired in the simplification.)

## Data integrity rule

No result on this site is hand typed. `tools/generate_data.py`
generates every data file from the study's own artifacts:

- the NPPAD-Edge flight bundle (`primary_w60.npz`) for the model
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

## Flight model

MultiRocket+HYDRA kernel features (50,752) with a ridge classifier
head, onset aligned windows (t0 = 100 s, W = 60 s), 88 realistic
channels, 12 accident classes. Edge bundle test macro F1 0.9838 at
W = 60 s, identical to the full precision study model. The safe mode
fallback is LogReg+ on summary features. Confidence is the softmax of
the head scores: indicative, not calibrated.
