# NPPAD Digital Twin

A NASA mission style digital twin and flight console for the NPPAD
nuclear power plant accident diagnosis study, built for applying the
diagnosis algorithm in space, at the edge.

The premise follows the Mars Society's account of real time decision
making on Mars: interplanetary light time delay makes ground control
too slow to close a control loop, bandwidth is scarce, and the only
workable answer is onboard autonomy — process at the point of capture,
downlink only results, and design for faults. A reactor accident
transient allows sixty seconds. Ground cannot be in that loop.

## Pages

- `index.html` — the Digital Twin. Playback of genuine held out test
  transients with twin state tracked against the physical record, a
  diagnosis event panel, flight model health from measured edge
  benchmarks, and a light time comparison tool.
- `ml.html` — How ML Takes Place. The full onboard pipeline (sense,
  window, condition, kernel features, ridge head, decide and alert),
  why it fits space, the study's results grid for all eight models,
  measured edge benchmarks, safe mode design, and the honest caveats.
- `app.html` — the Space App mission console. The primary flight model
  (MultiRocket+HYDRA + ridge head) runs **live in the browser** on
  genuine study windows and times itself. The other seven models are
  shown as the study's recorded predictions for the same windows,
  labelled as playback. Includes a link loss simulation: the diagnosis
  does not change, because it never used the link.

## Data integrity rule

No result on this site is hand typed. `tools/generate_data.py`
generates every data file from the study's own artifacts:

- the NPPAD-Edge flight bundle (`primary_w60.npz`) for the model
  parameters in `data/model.bin`,
- the NPPAD-Edge held out test windows and its pure NumPy runtime for
  reference outputs,
- the executed study run's per model prediction files for the
  recorded predictions,
- the study's combined results file for the metrics grid,
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
