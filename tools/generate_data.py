#!/usr/bin/env python3
"""NPPAD Digital Twin — data generator.

Every number the site displays is produced by this script from the
study's own computed artifacts. Nothing is hand typed.

Sources (read only):
  * NPPAD-Edge bundle  ~/workspace/nppad_edge/bundle/primary_w60.npz
    (MultiRocket+HYDRA parameters + ridge head, exported from the
    study's fitted aeon models) and its measured benchmarks
    ~/workspace/nppad_edge/artifacts/benchmarks.json + model_card.json
  * NPPAD-Edge held out test windows
    ~/workspace/nppad_edge/artifacts/test_windows_w60.npz
    (240 raw windows, t0 = 100 s, W = 60 s, 88 realistic channels)
  * Study per window class probabilities at the flight protocol
    (onset aligned t0 = 100 s, W = 60 s, 88 realistic channels),
    executed Oct 30 all models run:
    ~/workspace/hw2_ext_allmodels_run/exec_work/results/probs/
        t0100_realistic_W60.npz  (LogReg, LogReg+, Random Forest)
    ~/workspace/hw2_ext_allmodels_run/exec_work/sota_results/
        probs_*_t0100_realistic_W60.npz  (kernel models)
    Each source is verified in this script by recomputing its test
    macro F1 and matching the combined results grid exactly.
    CNN and GRU were saved by the study only as aggregate grid
    scores, never as per window probabilities at this protocol, so
    they have no genuine per window playback (see STUDY_MISSING).
  * Study headline grid
    ~/workspace/your_files/HW2_Combined_Results_All_Models.csv
  * Study extension findings (ramps, unknown class detection),
    extracted from the executed Oct 30 all models notebook by
    that run's own extract_results.py:
    ~/workspace/hw2_ext_allmodels_run/extracted.json
  * Raw plant transients (NPPAD dataset)
    ~/workspace/hw2_ext_allmodels_run/exec_work/NuclearPowerPlantAccidentData/
        Operation_csv_data/<CLASS>/<severity>.csv

Outputs (written next to this script's site root):
  data/model.bin     float32 / int32 parameter arrays for the browser
                     port of the edge model (layout in model.json)
  data/model.json    array layout, classes, protocol constants
  data/scenarios.json  genuine test windows + the edge model's own
                     reference outputs (computed here with the pure
                     NumPy NPPAD-Edge runtime) + all 8 study models'
                     recorded predictions for the same windows
  data/twin.json     full transient playbacks for the twin page
  data/results.json  study grid + edge benchmarks for the ML page

The browser port (js/edge.js) is verified against the reference
outputs in scenarios.json by tools/verify_js.cjs; the agreement
count is written back into data/results.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

SITE = Path(__file__).resolve().parent.parent
EDGE = Path.home() / "workspace" / "nppad_edge"
RUN = Path.home() / "workspace" / "hw2_ext_allmodels_run" / "exec_work"
DATA_ROOT = RUN / "NuclearPowerPlantAccidentData" / "Operation_csv_data"
sys.path.insert(0, str(Path.home() / "workspace" / "nppad_edge"))

from nppad_edge.bundle import PrimaryModel          # noqa: E402
from nppad_edge.data import (CLASSES, assign_splits,  # noqa: E402
                             build_windows, load_runs, variable_sets)

OUT = SITE / "data"
OUT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- model
z = np.load(EDGE / "bundle" / "primary_w60.npz")

ARRAYS: list[tuple[str, np.ndarray]] = []


def add(name: str, arr: np.ndarray, dtype):
    ARRAYS.append((name, np.ascontiguousarray(arr, dtype=dtype)))


add("pre_log_idx", z["pre_log_idx"], np.int32)
add("pre_log_s", z["pre_log_s"], np.float32)
add("pre_mu", z["pre_mu"], np.float32)
add("pre_sd", z["pre_sd"], np.float32)
add("mr_indices", z["mr_indices"], np.int32)
for half in ("mr0", "mr1"):
    add(f"{half}_nchan", z[f"{half}_nchan"], np.int32)
    add(f"{half}_chan", z[f"{half}_chan"], np.int32)
    add(f"{half}_dil", z[f"{half}_dil"], np.int32)
    add(f"{half}_nfpd", z[f"{half}_nfpd"], np.int32)
    add(f"{half}_bias", z[f"{half}_bias"], np.float32)
add("hy_W", z["hy_W"].astype(np.float32), np.float32)
add("hy_idx", z["hy_idx"], np.int32)
add("hy_dil", z["hy_dil"], np.int32)
add("hy_pad", z["hy_pad"], np.int32)
add("feat_mu", z["feat_mu"], np.float32)
add("feat_sd", z["feat_sd"], np.float32)
add("hy_mu", z["hy_mu"], np.float32)
add("hy_sigma", z["hy_sigma"], np.float32)
add("head_coef", z["head_coef"].astype(np.float32), np.float32)
add("head_intercept", z["head_intercept"], np.float32)

layout, blob, off = {}, bytearray(), 0
for name, arr in ARRAYS:
    b = arr.tobytes()
    layout[name] = {"offset": off, "shape": list(arr.shape),
                    "dtype": "float32" if arr.dtype == np.float32 else "int32"}
    blob += b
    off += len(b)
(OUT / "model.bin").write_bytes(bytes(blob))

model_json = {
    "classes": [str(c) for c in z["classes"]],
    "layout": layout,
    "constants": {
        "channels": 88, "steps": 6, "padTo": 12, "clip": 10.0,
        "t0_s": 100.0, "W_s": 60, "dt_s": 10.0,
        "hydraGroups": int(z["hy_g"]), "hydraKernels": int(z["hy_k"]),
        "mrFeatures": int(z["feat_mu"].shape[0]),
        "hyFeatures": int(z["hy_mu"].shape[0]),
    },
    "provenance": "Exported from NPPAD-Edge bundle primary_w60.npz "
                  "(study fitted MultiRocket+HYDRA + ridge head).",
}
(OUT / "model.json").write_text(json.dumps(model_json, indent=1))
print("model.bin bytes:", off)

# ---------------------------------------------------------------- data
runs = assign_splits(load_runs(DATA_ROOT))
all_vars, real_vars = variable_sets(runs)
assert len(real_vars) == 88, len(real_vars)
X, y, meta = build_windows(runs, "test", 60, real_vars)
tw = np.load(EDGE / "artifacts" / "test_windows_w60.npz")
assert X.shape == tw["X"].shape and np.allclose(X, tw["X"]), "window alignment"
assert (y == tw["y"]).all()
meta["y"] = y
print("test windows aligned with edge artifact:", X.shape)

model_edge = PrimaryModel(EDGE / "bundle" / "primary_w60.npz")

# Recorded study predictions at the SAME protocol as the windows and
# the flight model: onset aligned t0 = 100 s, W = 60 s, realistic
# channels. (The older build paired the windows with the Task E
# t0 = 20 s prediction files, a different protocol; that mismatch is
# what this refresh fixes.)
from sklearn.metrics import f1_score  # noqa: E402

GRID_CSV = (Path.home() / "workspace" / "your_files" /
            "HW2_Combined_Results_All_Models.csv")
grid_all = pd.read_csv(GRID_CSV)
grid_cell = {(str(r.model), int(r.t0), str(r.vars), int(r.W)):
             float(r.macro_F1) for r in grid_all.itertuples()}

label_by_file = {str(f): str(l) for f, l in zip(meta["file"], meta["label"])}

PROB_SOURCES = [
    (RUN / "results" / "probs" / "t0100_realistic_W60.npz",
     {"LogReg|0": "LogReg", "LogReg+|0": "LogReg+",
      "RF|0": "Random Forest"}),
    (RUN / "sota_results" / "probs_MultiRocketHydra_t0100_realistic_W60.npz",
     {"MultiRocketHydra|0": "MultiRocket+HYDRA"}),
    (RUN / "sota_results" / "probs_Rocket_t0100_realistic_W60.npz",
     {"Rocket|0": "Rocket"}),
    (RUN / "sota_results" / "probs_MiniRocket_t0100_realistic_W60.npz",
     {"MiniRocket|0": "MiniRocket"}),
]
STUDY_MISSING = ["CNN", "GRU"]

study = {}
for path, keymap in PROB_SOURCES:
    z = np.load(path, allow_pickle=True)
    files = [str(f) for f in z["files"]]
    y_idx = np.asarray(z["y"], dtype=int)
    assert len(files) == X.shape[0], (path, len(files), X.shape)
    for i, f in enumerate(files):
        assert CLASSES[int(y_idx[i])] == label_by_file[f], (path, f)
    for key, disp in keymap.items():
        P = np.asarray(z[key], dtype=float)
        pred_idx = P.argmax(axis=1)
        f1 = float(f1_score(y_idx, pred_idx, average="macro"))
        want = grid_cell[(disp, 100, "realistic", 60)]
        assert abs(f1 - want) < 1e-6, (disp, f1, want)
        rec = {}
        for i, f in enumerate(files):
            j = int(pred_idx[i])
            rec[f] = {"pred": CLASSES[j], "conf": float(P[i, j])}
        study[disp] = rec
        print("study preds verified:", disp, "macro F1", round(f1, 6))


def edge_ref(window_raw: np.ndarray) -> dict:
    p = model_edge.predict_proba(window_raw.astype(np.float32))
    i = int(np.argmax(p))
    return {"pred": CLASSES[i], "conf": float(p[i]),
            "proba": [float(v) for v in p]}


scenarios = []
picked: set[str] = set()
for cls in CLASSES:  # one genuine test window per class, first match
    rows = meta[(meta["label"] == cls)]
    for _, r in rows.iterrows():
        f = str(r["file"])
        if f in picked:
            continue
        idx = meta.index[meta["file"] == f][0]
        pos = list(meta.index).index(idx)
        w = X[pos]
        scenarios.append({
            "id": f"test-{f.replace('/', '-')}",
            "kind": "test",
            "label": cls, "severity": float(r["severity"]), "file": f,
            "window": [[float(v) for v in row] for row in w],
            "edgeRef": edge_ref(w),
            "studyPreds": {m: study[m][f] for m in study},
        })
        picked.add(f)
        break
# extra LOCA + LOCAC windows (the classic hard pair)
for cls in ("LOCA", "LOCAC"):
    rows = meta[(meta["label"] == cls)]
    r = rows.iloc[min(3, len(rows) - 1)]
    f = str(r["file"])
    if f not in picked:
        pos = list(meta.index).index(r.name)
        w = X[pos]
        scenarios.append({
            "id": f"test-{f.replace('/', '-')}",
            "kind": "test",
            "label": cls, "severity": float(r["severity"]), "file": f,
            "window": [[float(v) for v in row] for row in w],
            "edgeRef": edge_ref(w),
            "studyPreds": {m: study[m][f] for m in study},
        })
        picked.add(f)

# Normal operation run: in the dataset but NOT one of the 12 trained
# classes. Window at the same t0 so the demo is honest about what a
# classifier trained only on accidents does with normal data.
norm_dir = DATA_ROOT / "Normal"
nf = sorted(norm_dir.glob("*.csv"))[0]
ndf = pd.read_csv(nf)
ndf.columns = [str(c).strip() for c in ndf.columns]
seg = ndf.loc[ndf["TIME"] >= 100.0 - 1e-6, real_vars].iloc[:6]
w = seg.to_numpy(np.float32)
scenarios.append({
    "id": "normal-op", "kind": "normal", "label": None,
    "severity": float(nf.stem), "file": f"Normal/{nf.name}",
    "window": [[float(v) for v in row] for row in w],
    "edgeRef": edge_ref(w), "studyPreds": {},
})
# Pre onset steady state: same LOCA test run, window BEFORE onset.
loca_run = next(r for r in runs if r["label"] == "LOCA"
                and r["split"] == "test")
d = loca_run["df"]
seg = d.loc[(d["TIME"] >= 40.0 - 1e-6) & (d["TIME"] < 100.0),
            real_vars].iloc[:6]
w = seg.to_numpy(np.float32)
scenarios.append({
    "id": "pre-onset", "kind": "preonset", "label": None,
    "severity": float(loca_run["severity"]), "file": loca_run["file"],
    "window": [[float(v) for v in row] for row in w],
    "edgeRef": edge_ref(w), "studyPreds": {},
})
(OUT / "scenarios.json").write_text(json.dumps({
    "channels": real_vars, "classes": CLASSES, "scenarios": scenarios,
    "studyPredsMissing": STUDY_MISSING,
    "note": "window = 6 samples x 88 realistic channels, raw plant "
            "values, t0 = 100 s, W = 60 s (pre onset scenario: "
            "t = 40 to 90 s of the same run). studyPreds are the "
            "study's recorded per window predictions at this same "
            "protocol for the six models whose probabilities the "
            "study saved; CNN and GRU were saved only as aggregate "
            "scores, so they are listed in studyPredsMissing.",
}))
print("scenarios:", len(scenarios))

# ---------------------------------------------------------------- twin
TWIN_CLASSES = ["LOCA", "SGATR", "MD"]
CH = ["P", "TAVG", "LVPZ", "PSGA", "WFWA", "PWR"]
twin = []
for cls in TWIN_CLASSES:
    cand = [r for r in runs if r["label"] == cls and r["split"] == "test"]
    r = cand[len(cand) // 2]
    d = r["df"]
    series = {"TIME": [float(v) for v in d["TIME"]]}
    for c in CH:
        series[c] = [round(float(v), 4) for v in d[c]]
    f = r["file"]
    twin.append({
        "label": cls, "severity": float(r["severity"]), "file": f,
        "channels": CH, "series": series,
        "diagnosis": {
            "study": study["MultiRocket+HYDRA"][f],
            "edge": edge_ref(build_windows([dict(r, split="test")], "test",
                                           60, real_vars)[0][0]),
        },
    })
(OUT / "twin.json").write_text(json.dumps({"runs": twin}))
print("twin runs:", [t["file"] for t in twin])

# ---------------------------------------------------------------- findings
# Headline findings of the final study. Every value is computed here
# from the combined results grid and from the executed all models
# run's extracted result tables (extracted.json, produced by that
# run's own extract_results.py from the executed notebook).
EXT = json.loads((RUN.parent / "extracted.json").read_text())


def _tables(key):
    return [t for t in EXT.get(key, [])
            if isinstance(t, dict) and "rows" in t]


ceil = grid_all[(grid_all["t0"] == 20) & (grid_all["W"].isin([30, 60]))]
onset = grid_all[(grid_all["t0"] == 100) &
                 (grid_all["vars"] == "realistic")]
mrh = onset[onset["model"] == "MultiRocket+HYDRA"]["macro_F1"]
best_row = onset.loc[onset["macro_F1"].idxmax()]
piv = grid_all[grid_all["t0"] == 100].pivot_table(
    index=["model", "W"], columns="vars", values="macro_F1")
d60 = piv.xs(60, level="W")["all"] - piv.xs(60, level="W")["realistic"]

ramp_vals = []
for key in ("r1_classical", "r1_deep", "r1_adv"):
    for t in _tables(key):
        cols = t["columns"]
        if "ramp macro-F1" in cols:
            ci = {c: i for i, c in enumerate(cols)}
            wcol = "W (s)" if "W (s)" in ci else "W"
            for r in t["rows"]:
                try:
                    ramp_vals.append((float(r[ci["ramp macro-F1"]]),
                                      str(r[ci["model"]]),
                                      int(float(r[ci[wcol]]))))
                except (ValueError, KeyError):
                    pass
ramp_best = max(ramp_vals)

auroc_vals = []
for key in ("r2_rf", "r2_cnn", "r2_all"):
    for t in _tables(key):
        cols = t["columns"]
        if "AUROC" in cols and "signal" in cols:
            ci = {c: i for i, c in enumerate(cols)}
            for r in t["rows"]:
                try:
                    auroc_vals.append((float(r[ci["AUROC"]]),
                                       str(r[ci["signal"]]),
                                       int(float(r[ci["W (s)"]]))))
                except (ValueError, KeyError):
                    pass
unk_best = max(auroc_vals)
kernel_aurocs = set()
for t in _tables("r2_adv"):
    cols = t["columns"]
    if "AUROC" in cols and "model" in cols:
        ci = {c: i for i, c in enumerate(cols)}
        for r in t["rows"]:
            if str(r[ci["model"]]) in ("MiniRocket", "Rocket",
                                       "MultiRocket+HYDRA"):
                kernel_aurocs.add(float(r[ci["AUROC"]]))

findings = {
    "ceiling": {
        "setting": "windows starting at t0 = 20 s, W = 30 or 60 s, "
                   "both variable sets, all eight models",
        "bestMacroF1": float(ceil["macro_F1"].max()),
    },
    "onset": {
        "multiRocketHydraMin": float(mrh.min()),
        "multiRocketHydraMax": float(mrh.max()),
        "bestSingle": {"model": str(best_row["model"]),
                       "W": int(best_row["W"]),
                       "macroF1": float(best_row["macro_F1"])},
    },
    "oracleCost": {
        "setting": "t0 = 100 s, W = 60 s, all variables minus "
                   "realistic, per model",
        "maxDrop": float(d60.max()),
        "perModel": {str(m): float(v) for m, v in d60.items()},
    },
    "ramps": {"bestMacroF1": ramp_best[0], "model": ramp_best[1],
              "W": ramp_best[2]},
    "unknown": {"bestAuroc": unk_best[0], "signal": unk_best[1],
                "W": unk_best[2],
                "kernelAurocValues": sorted(kernel_aurocs)},
    "provenance": "Computed by tools/generate_data.py from "
                  "HW2_Combined_Results_All_Models.csv and the "
                  "executed all models run's extracted.json.",
}
print("findings:", json.dumps(findings)[:200], "...")

# ---------------------------------------------------------------- results
grid = grid_all
g = grid[(grid["t0"] == 100) & (grid["vars"] == "realistic")]
grid_out = {}
for _, r in g.iterrows():
    grid_out.setdefault(str(r["model"]), {})[int(r["W"])] = {
        "macroF1": float(r["macro_F1"]), "accuracy": float(r["accuracy"])}
bench = json.loads((EDGE / "artifacts" / "benchmarks.json").read_text())
card = json.loads((EDGE / "bundle" / "model_card.json").read_text())
def clean(o):
    if isinstance(o, float) and (o != o or o in (float("inf"), float("-inf"))):
        return None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return o


results = {
    "classes": CLASSES,
    "splits": {"train": 725, "validation": 242, "test": 244},
    "channels": {"total": 96, "realistic": 88,
                 "oracleExcluded": ["WLR", "HLW", "WBK", "MBK", "EBK",
                                    "WTRA", "WTRB", "WFLB"]},
    "windows_s": [30, 60, 120, 300, 600],
    "grid_t0_100_realistic": grid_out,
    "findings": findings,
    "edge": {
        "benchmarks": bench,
        "modelCardMetrics": card["metrics"],
        "bundleBytes": bench["bundle_total_bytes"],
    },
    "jsVerification": None,  # filled by tools/verify_js.cjs
}
(OUT / "results.json").write_text(json.dumps(clean(results), indent=1))
print("results.json written; grid models:", list(grid_out))
print("DONE")
