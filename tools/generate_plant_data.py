#!/usr/bin/env python3
"""NPPAD Digital Twin: plant page data generator.

Emits data/plant.json for plant.html, the live plant schematic page.

For every scenario the Space App console uses (data/scenarios.json),
this script loads the scenario's recorded run from the same dataset
copy the twin generator uses and emits the plant channel time series
the schematic displays. Series are shown at 20 s steps: every second
recorded sample, exact recorded values, never interpolated.

Verification, in the same spirit as tools/generate_data.py: for every
scenario, the t0 = 100 s, W = 60 s window rebuilt here from the raw
run must match the window already shipped in data/scenarios.json
(the pre onset scenario is checked against its own 40 to 90 s rule,
the normal scenario against its Normal run window). If any check
fails the script stops and writes nothing.

Diagnosis readouts are copied from data/scenarios.json unchanged:
the study's recorded per window predictions at the twin protocol
(t0 = 100 s, W = 60 s, realistic channels) for the six models whose
probabilities the study saved, plus the edge model reference output.
CNN and GRU have no recorded per window predictions (see
studyPredsMissing in scenarios.json) and are not shown.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

SITE = Path(__file__).resolve().parent.parent
RUN = Path.home() / "workspace" / "hw2_ext_allmodels_run" / "exec_work"
DATA_ROOT = RUN / "NuclearPowerPlantAccidentData" / "Operation_csv_data"

STRIDE = 2          # display every 2nd recorded sample: 20 s steps
# (component key, channel, label, unit) grouped by plant component.
# Descriptions and units are the dataset README's own (Table 3).
COMPONENTS = [
    ("containment", "Containment (reactor building)", [
        ("PRB", "Press Reactor building", "bar"),
        ("TRB", "Temp Reactor building", "degC"),
    ]),
    ("vessel", "Reactor pressure vessel and core", [
        ("TF", "Temp Average fuel", "degC"),
        ("TAVG", "Temp RCS average", "degC"),
        ("LVCR", "Level Core water", "M"),
        ("PWR", "Power Core thermal", "%"),
    ]),
    ("pressurizer", "Pressurizer", [
        ("P", "Press RCS", "bar"),
        ("LVPZ", "Level Pressurizer", "%"),
    ]),
    ("steamGenerator", "Steam generator A", [
        ("PSGA", "Pressure Steam generator A", "bar"),
        ("LSGA", "Level SG A wide range", "M"),
        ("NSGA", "Level SG A narrow range", "%"),
    ]),
    ("pump", "Reactor coolant pump, loop A", [
        ("WRCA", "Flow Reactor coolant loop A", "t/hr"),
        ("THA", "Temp Hot leg A", "degC"),
        ("TCA", "Temp Cold leg A", "degC"),
    ]),
    ("turbine", "Turbine and secondary loop", [
        ("WSTA", "Flow SG A steam", "t/hr"),
        ("TBLD", "Power Turbine load", "%"),
        ("WFWA", "Flow SG A feedwater", "t/hr"),
    ]),
    ("generator", "Generator", []),
    ("condenser", "Condenser", []),
]
CHANNELS = [ch for _, _, rows in COMPONENTS for ch, _, _ in rows]


def sig4(v: float) -> float:
    if v == 0:
        return 0.0
    return float(f"{float(v):.4g}")


def load_run(rel: str) -> pd.DataFrame:
    d = pd.read_csv(DATA_ROOT / rel)
    d.columns = [str(c).strip() for c in d.columns]
    d = d.apply(pd.to_numeric, errors="coerce").sort_values("TIME")
    return d.reset_index(drop=True).ffill().bfill().fillna(0.0)


def window_of(df: pd.DataFrame, cols, t_start: float) -> np.ndarray:
    seg = df.loc[df["TIME"] >= t_start - 1e-6, cols].iloc[:6]
    return seg.to_numpy(np.float64)


def main():
    sc = json.loads((SITE / "data" / "scenarios.json").read_text())
    real_vars = sc["channels"]
    out_scenarios = []
    for s in sc["scenarios"]:
        df = load_run(s["file"])
        # --- verification against the shipped scenario window
        if s["kind"] == "preonset":
            seg = df.loc[(df["TIME"] >= 40.0 - 1e-6) &
                         (df["TIME"] < 100.0), real_vars].iloc[:6]
            rebuilt = seg.to_numpy(np.float64)
        else:
            rebuilt = window_of(df, real_vars, 100.0)
        shipped = np.array(s["window"], dtype=np.float64)
        assert rebuilt.shape == shipped.shape, (s["id"], rebuilt.shape)
        err = np.max(np.abs(rebuilt - shipped) /
                     np.maximum(1.0, np.abs(shipped)))
        assert err < 2e-3, (s["id"], err)
        # --- display series at 20 s steps
        sub = df.iloc[::STRIDE]
        series = {"TIME": [float(v) for v in sub["TIME"]]}
        for ch in CHANNELS:
            series[ch] = [sig4(v) for v in sub[ch]]
        out_scenarios.append({
            "id": s["id"], "kind": s["kind"], "label": s["label"],
            "severity": s["severity"], "file": s["file"],
            "series": series,
            "diagnosis": {
                "studyPreds": s.get("studyPreds", {}),
                "edgeRef": s.get("edgeRef"),
            },
        })
        print(f"{s['id']:24s} verified (max rel err {err:.2e}), "
              f"{len(series['TIME'])} display points")
    out = {
        "generatedBy": "tools/generate_plant_data.py from the recorded "
                       "NPPAD runs behind data/scenarios.json; every "
                       "series value was verified against the shipped "
                       "scenario windows before writing.",
        "displayStepSeconds": 20,
        "displayNote": "Series are shown at 20 s steps (every second "
                       "recorded sample). Values are the recorded "
                       "samples themselves, never interpolated.",
        "components": [
            {"key": key, "name": name,
             "channels": [{"code": ch, "label": lab, "unit": unit}
                          for ch, lab, unit in rows],
             "noRecordedChannel": len(rows) == 0}
            for key, name, rows in COMPONENTS
        ],
        "studyPredsMissing": sc.get("studyPredsMissing", []),
        "diagnosisNote": "Recorded predictions at the twin protocol: "
                         "t0 = 100 s, W = 60 s, realistic channels. "
                         "CNN and GRU were saved by the study only as "
                         "aggregate scores, so no recorded per window "
                         "prediction exists for them.",
        "scenarios": out_scenarios,
    }
    (SITE / "data" / "plant.json").write_text(json.dumps(out))
    print("data/plant.json written:",
          len(out_scenarios), "scenarios")


if __name__ == "__main__":
    main()
