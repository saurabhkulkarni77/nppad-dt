#!/usr/bin/env python3
"""NPPAD Digital Twin: analysis page data generator.

Emits data/analysis.json for analysis.html. The analysis page mirrors
the study deck's results and extension slides; every figure here is
computed by this script from the study's own artifacts:

  * headline grids and oracle cost: HW2_Combined_Results_All_Models.csv
  * early window ceiling detail: the executed run's
    results/identical_windows.csv (distinct window count)
  * Random Forest confusion at W = 60 s: recomputed here from the
    study's per window artifacts (outputs/pred_RandomForest_W60_test.csv
    for t0 = 20 s; results/probs/t0100_realistic_W60.npz for t0 = 100 s)
  * hard pairs: the executed run's results/hard_pairs.csv
  * ramp accidents and unknown class detection: the executed run's
    extracted.json tables (produced by that run's extract_results.py
    from the executed all models notebook)

Nothing is typed in by hand and nothing is copied from the slides.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

SITE = Path(__file__).resolve().parent.parent
HOME = Path.home()
RUN = HOME / "workspace" / "hw2_ext_allmodels_run" / "exec_work"
GRID = pd.read_csv(HOME / "workspace" / "your_files" /
                   "HW2_Combined_Results_All_Models.csv")
EXT = json.loads((RUN.parent / "extracted.json").read_text())
CLASSES = ["LOCA", "LOCAC", "SLBIC", "SLBOC", "SGATR", "SGBTR",
           "RW", "RI", "FLB", "MD", "LR", "LLB"]
MODELS = ["LogReg", "LogReg+", "Random Forest", "CNN", "GRU",
          "MultiRocket+HYDRA", "Rocket", "MiniRocket"]
WS = [30, 60, 120, 300, 600]


def grid(t0, varset):
    out = {}
    sub = GRID[(GRID.t0 == t0) & (GRID.vars == varset)]
    for m in MODELS:
        row = {}
        for w in WS:
            r = sub[(sub.model == m) & (sub.W == w)]
            if len(r):
                row[str(w)] = {"macroF1": float(r.iloc[0].macro_F1),
                               "accuracy": (None if pd.isna(
                                   r.iloc[0].accuracy)
                                   else float(r.iloc[0].accuracy))}
        out[m] = row
    return out


def macro_f1(y_true, y_pred):
    f1s = []
    for lab in CLASSES:
        tp = sum(1 for a, b in zip(y_true, y_pred) if a == lab and b == lab)
        fp = sum(1 for a, b in zip(y_true, y_pred) if a != lab and b == lab)
        fn = sum(1 for a, b in zip(y_true, y_pred) if a == lab and b != lab)
        p = tp / (tp + fp) if tp + fp else 0.0
        r = tp / (tp + fn) if tp + fn else 0.0
        f1s.append(2 * p * r / (p + r) if p + r else 0.0)
    return float(np.mean(f1s))


def confusion(y_true, y_pred):
    idx = {c: i for i, c in enumerate(CLASSES)}
    M = [[0] * 12 for _ in range(12)]
    for a, b in zip(y_true, y_pred):
        M[idx[a]][idx[b]] += 1
    return M


def ext_rows(key):
    t = EXT[key][0]
    cols = t["columns"]
    return [dict(zip(cols, row)) for row in t["rows"]]


def main():
    out = {"generatedBy": "tools/generate_analysis.py from the study's "
                          "combined results file, the executed run's "
                          "per window artifacts, hard pair table and "
                          "extracted result tables. No figure is typed "
                          "into the page."}
    out["grid_t0_100_realistic"] = grid(100, "realistic")
    out["grid_t0_20_realistic"] = grid(20, "realistic")

    # ---- early window ceiling (slide: t0 = 20 tie)
    sub = GRID[(GRID.t0 == 20) & (GRID.W.isin([30, 60]))]
    iw = pd.read_csv(RUN / "results" / "identical_windows.csv")
    out["ceiling"] = {
        "bestMacroF1": float(sub.macro_F1.max()),
        "distinctWindowsW60": int(iw.loc[iw["W (s)"] == 60,
                                         "distinct windows (1211 runs)"]
                                  .iloc[0]),
        "modelsAtCeilingW60": int(
            ((GRID[(GRID.t0 == 20) & (GRID.W == 60) &
                    (GRID.vars == "realistic")].macro_F1)
             == sub.macro_F1.max()).sum()),
    }

    # ---- oracle cost at t0 = 100 (slide: oracle analysis)
    per_model, gains = {}, []
    for m in MODELS:
        a = GRID[(GRID.t0 == 100) & (GRID.vars == "all") &
                 (GRID.model == m) & (GRID.W == 60)].iloc[0].macro_F1
        r = GRID[(GRID.t0 == 100) & (GRID.vars == "realistic") &
                 (GRID.model == m) & (GRID.W == 60)].iloc[0].macro_F1
        per_model[m] = {"all": float(a), "realistic": float(r),
                        "drop": float(a - r)}
        for w in WS:
            aa = GRID[(GRID.t0 == 100) & (GRID.vars == "all") &
                      (GRID.model == m) & (GRID.W == w)].iloc[0].macro_F1
            rr = GRID[(GRID.t0 == 100) & (GRID.vars == "realistic") &
                      (GRID.model == m) & (GRID.W == w)].iloc[0].macro_F1
            gains.append(float(aa - rr))
    out["oracle"] = {"perModelW60": per_model,
                     "maxDropW60": max(v["drop"] for v in per_model.values()),
                     "meanGainAllWindows": float(np.mean(gains))}

    # ---- window growth (slide: how accuracy grows)
    g100 = out["grid_t0_100_realistic"]
    w30 = [g100[m]["30"]["macroF1"] for m in MODELS]
    beyond = []
    for m in MODELS:
        base = g100[m]["120"]["macroF1"]
        beyond.append(max(g100[m]["300"]["macroF1"],
                          g100[m]["600"]["macroF1"]) - base)
    g20 = out["grid_t0_20_realistic"]
    w120_20 = [g20[m]["120"]["macroF1"] for m in MODELS if "120" in g20[m]]
    out["growth"] = {
        "w30RealisticMin": min(w30), "w30RealisticMax": max(w30),
        "maxGainBeyond120": max(beyond),
        "t0_20_W120_min": min(w120_20), "t0_20_W120_max": max(w120_20),
        "t0_20_W120_models": len(w120_20),
    }

    # ---- Random Forest confusion at W = 60 s, both placements
    d = pd.read_csv(RUN / "outputs" / "pred_RandomForest_W60_test.csv")
    yt20, yp20 = d["label"].tolist(), d["y_pred"].tolist()
    z = np.load(RUN / "results" / "probs" / "t0100_realistic_W60.npz",
                allow_pickle=True)
    files = [str(f) for f in z["files"]]
    yt100 = [CLASSES[i] for i in z["y"]]
    yp100 = [CLASSES[i] for i in np.argmax(z["RF|0"], axis=1)]
    per_class = {}
    for lab in CLASSES:
        tot = yt100.count(lab)
        ok = sum(1 for a, b in zip(yt100, yp100) if a == lab and b == lab)
        per_class[lab] = {"correct": ok, "total": tot}
    weakest = min(per_class, key=lambda c: per_class[c]["correct"] /
                  max(1, per_class[c]["total"]))
    off = {}
    for a, b in zip(yt100, yp100):
        if a != b:
            off[f"{a} -> {b}"] = off.get(f"{a} -> {b}", 0) + 1
    out["confusionRF"] = {
        "t0_20": {"macroF1": macro_f1(yt20, yp20), "n": len(yt20),
                  "matrix": confusion(yt20, yp20)},
        "t0_100": {"macroF1": macro_f1(yt100, yp100), "n": len(yt100),
                   "matrix": confusion(yt100, yp100),
                   "perClassCorrect": per_class,
                   "weakestClass": weakest,
                   "topErrors": dict(sorted(off.items(),
                                            key=lambda kv: -kv[1])[:6])},
    }

    # ---- hard pairs (slide table: t0 = 100, realistic, LogReg+ and RF)
    hp = pd.read_csv(RUN / "results" / "hard_pairs.csv")
    pairs = {}
    for pair in ["LOCA/LOCAC", "SGATR/SGBTR", "SLBIC/SLBOC"]:
        pairs[pair] = {}
        for model, name in [("LogReg+", "LogReg+"), ("RF", "Random Forest")]:
            rows = hp[(hp.t0 == 100) & (hp.vars == "realistic") &
                      (hp.model == model) & (hp.pair == pair)]
            pairs[pair][name] = {str(int(r.W)): float(r.correct)
                                 for r in rows.itertuples()}
    out["hardPairs"] = pairs

    # ---- ramp accidents (extracted tables, all variables)
    ramp = {}
    for key in ("r1_classical", "r1_deep"):
        for row in ext_rows(key):
            if row["setting"] != "all variables":
                continue
            m = {"RandForest": "Random Forest"}.get(row["model"],
                                                    row["model"])
            ramp.setdefault(m, {})[row["W (s)"]] = {
                "rampF1": float(row["ramp macro-F1"]),
                "degradation": float(row["degradation"])}
    degs = [abs(v["degradation"]) for m in ramp.values()
            for w, v in m.items() if int(w) >= 120]
    out["ramps"] = {"table": ramp,
                    "degradationRangeW120Plus": [min(degs), max(degs)],
                    "best": max(((v["rampF1"], m, w)
                                 for m, mm in ramp.items()
                                 for w, v in mm.items()))}

    # ---- unknown class detection (extracted tables)
    unk = {"signals": []}
    for key in ("r2_rf", "r2_cnn"):
        for row in ext_rows(key):
            if "all variables" not in row["signal"]:
                continue
            unk["signals"].append({
                "signal": row["signal"], "W": int(row["W (s)"]),
                "auroc": float(row["AUROC"]),
                "detectionRate": float(row["detection rate"]),
                "fpr": float(row["known-test FPR"])})
    out["unknown"] = unk

    (SITE / "data" / "analysis.json").write_text(json.dumps(out, indent=1))
    print("analysis.json written")
    print(" ceiling:", out["ceiling"])
    print(" oracle max drop W60:", round(out["oracle"]["maxDropW60"], 6),
          "mean gain:", round(out["oracle"]["meanGainAllWindows"], 6))
    print(" RF confusion F1 t0=20:", round(
        out["confusionRF"]["t0_20"]["macroF1"], 6), " t0=100:", round(
        out["confusionRF"]["t0_100"]["macroF1"], 6),
        " weakest:", weakest, per_class[weakest])
    print(" ramps best:", out["ramps"]["best"],
          " degradation range:", out["ramps"]["degradationRangeW120Plus"])


if __name__ == "__main__":
    main()
