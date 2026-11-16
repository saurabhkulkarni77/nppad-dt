#!/usr/bin/env python3
"""Build data/early_study.json for early.html (the Early Accuracy page).

Every number is read from the two experiment result files written by the
executed notebooks:
  ~/workspace/nppad_early_aug/results.json    (Experiment 1: augmentation)
  ~/workspace/nppad_early_boost/results.json  (Experiment 2: ceiling proof)
Nothing is typed in by hand except the plain-words one-liners and section
text, the same split the LLM study generator uses. The script asserts the
headline claims (all arms tied; ceilings 13/48 and 67/244) against the
files before writing anything, so a changed result file fails the build
instead of quietly changing the page.
"""
import json
from pathlib import Path

HOME = Path.home()
AUG = json.loads((HOME / "workspace/nppad_early_aug/results.json").read_text())
BOOST = json.loads((HOME / "workspace/nppad_early_boost/results.json").read_text())
OUT = Path(__file__).resolve().parent.parent / "data" / "early_study.json"


def scores(block):
    return {"acc": block["acc"], "macroF1": block["macro_f1"]}


# ---------------------------------------------------------------- Experiment 1
TECH_ONELINERS = {
    "onset-anchored jitter":
        "Tiny random wiggles added to the trace, starting from zero at the "
        "first step, so the window's starting point never moves.",
    "excursion magnitude scaling":
        "The whole excursion — how far the trace travels from its start — "
        "is stretched or shrunk a little.",
    "excursion magnitude warping":
        "The excursion is stretched unevenly along its length, more in "
        "some places and less in others, following a smooth curve.",
    "shared time warping":
        "The window is smoothly sped up or slowed down, with the same warp "
        "on every channel so all sensors stay in step.",
    "same-class mixup":
        "Two windows of the same accident are blended together into one "
        "in-between example.",
    "DTW-aligned pairwise averaging":
        "Two windows of the same accident are first lined up in time, then "
        "averaged point by point.",
}

AUG_ARM_ONELINERS = {
    ("minirocket", "baseline"):
        "The plain starting point: trained on the training windows exactly "
        "as collected, nothing added.",
    ("minirocket", "balanced_only"):
        "Balancing only: the training set is topped up to the same count "
        "per class with plain copies — no new synthetic shapes.",
    ("minirocket", "augmented"):
        "The full recipe: every class grown to the target count with the "
        "six techniques above, then the same model trained on all of it.",
    ("cnn", "baseline"):
        "A small 1D convolutional network trained on the original windows.",
    ("cnn", "augmented"):
        "The same CNN trained on the augmented, balanced set.",
}
MODEL_LABELS = {"minirocket": "MiniRocket + Ridge", "cnn": "1D CNN"}
COND_LABELS = {"baseline": "Baseline", "balanced_only": "Balanced only",
               "augmented": "Augmented ×8"}

aug_arms = []
for model in ("minirocket", "cnn"):
    for cond in ("baseline", "balanced_only", "augmented"):
        key = f"t0=20_{cond}"
        if key not in AUG[model]:
            continue
        aug_arms.append({
            "model": MODEL_LABELS[model], "condition": COND_LABELS[cond],
            "oneliner": AUG_ARM_ONELINERS[(model, cond)],
            "frozen48": scores(AUG[model][key]["frozen48"]),
            "fulltest": scores(AUG[model][key]["fulltest"]),
        })

onset_arms = []
for model in ("minirocket", "cnn"):
    for cond in ("baseline", "augmented"):
        key = f"t0=100_{cond}"
        onset_arms.append({
            "model": MODEL_LABELS[model], "condition": COND_LABELS[cond],
            "frozen48": scores(AUG[model][key]["frozen48"]),
            "fulltest": scores(AUG[model][key]["fulltest"]),
        })

counts20 = AUG["counts"]["t0=20"]
before = counts20["before"]
aug_counts = {
    "nClasses": len(before),
    "beforeMin": min(before.values()), "beforeMax": max(before.values()),
    "beforeTotal": sum(before.values()),
    "targetPerClass": counts20["target_per_class"],
    "augmentedTotal": counts20["augmented_total"],
    "balancedOnlyTotal": counts20["balanced_only_total"],
    "augFactor": AUG["protocol"]["aug_factor"],
}

DIAG_ROWS = [
    ("temporal_range", "Mean temporal range inside the window",
     "How much the signals move around inside the 60 seconds, on the "
     "study's scaled units. Bigger means the accident is visibly under way."),
    ("between_within_var_ratio", "Between-class / within-class variance ratio",
     "How far apart the accident classes sit, compared with how much runs "
     "of the same accident vary. Bigger means the classes are easier to "
     "tell apart."),
    ("mean_abs_z_last_minus_first", "Mean |z(last step) − z(first step)|",
     "On average, how far the last reading has moved from the first, in "
     "standard-deviation units."),
    ("nearest_centroid_fulltest_acc", "Nearest-centroid accuracy (full test)",
     "The simplest possible classifier — guess the class whose average "
     "window is closest — scored on the full test split."),
]
diagnostics = [{
    "label": label, "oneliner": gloss,
    "t0_20": AUG["diagnostics"]["t0=20"][key],
    "t0_100": AUG["diagnostics"]["t0=100"][key],
} for key, label, gloss in DIAG_ROWS]

# ---------------------------------------------------------------- Experiment 2
ARM_DISPLAY = {
    "A0_baseline_12ch": "A0 · Baseline (12 channels)",
    "A1_deviation_12ch": "A1 · Deviation from own baseline",
    "A1b_anchor_12ch": "A1b · First-step anchor",
    "A1c_raw_plus_dev_24ch": "A1c · Raw + deviation (24 channels)",
    "A2a_shape_histgb": "A2a · Shape features + gradient boosting",
    "A2b_raw_plus_diff_24ch": "A2b · Raw + differences (24 channels)",
    "A3_expanded_all_channels": "A3 · All 96 channels",
    "A3b_expanded_deviation": "A3b · All 96 channels as deviation",
    "A3c_expanded_raw_plus_dev": "A3c · All 96 raw + deviation (192 channels)",
    "A4_hierarchical_12ch": "A4 · Hierarchical (group first, then class)",
    "A5_best_plus_augmentation": "A5 · Best arm + augmentation",
    "A6_lookup_train_majority": "A6 · Lookup table (memoriser)",
}
ARM_ONELINERS = {
    "A0_baseline_12ch":
        "The study's standard setup, unchanged: the 12 usual sensor "
        "channels fed to MiniRocket. The score everything else is "
        "compared against.",
    "A1_deviation_12ch":
        "Each window is first shifted by the run's own starting level, so "
        "only the change from normal is left. The idea: the change, not "
        "the level, should carry the news.",
    "A1b_anchor_12ch":
        "Like the deviation arm, but each window is shifted by its own "
        "first reading instead of the run's starting average.",
    "A1c_raw_plus_dev_24ch":
        "Both versions side by side — the raw window and its deviation "
        "copy, 24 channels in all — so the model can use whichever helps.",
    "A2a_shape_histgb":
        "Drops the raw traces and keeps 120 simple shape numbers per "
        "window (means, spreads, slopes, ranges), read by a "
        "gradient-boosting model instead of MiniRocket.",
    "A2b_raw_plus_diff_24ch":
        "The raw window plus its step-to-step changes as extra channels, "
        "so any movement stands out.",
    "A3_expanded_all_channels":
        "Every sensor channel the simulator records, not just the usual "
        "12 — the extra loop, everything. More information, in theory.",
    "A3b_expanded_deviation":
        "All 96 channels, each one shifted by the run's own starting "
        "level.",
    "A3c_expanded_raw_plus_dev":
        "The full 96 channels twice over — raw and deviation copies, 192 "
        "channels in all. The biggest input tried.",
    "A4_hierarchical_12ch":
        "Two steps: first guess which small group of accidents it could "
        "be, then pick inside the group. The groups came from the "
        "baseline's own confusions on held-out runs.",
    "A5_best_plus_augmentation":
        "The best arm from the tie (the baseline) retrained on the "
        "augmented, balanced data from Experiment 1.",
    "A6_lookup_train_majority":
        "No model at all: it memorises the training windows and answers "
        "with the majority label of the identical window. A deliberate "
        "cheat that proves the point — it scores the same as every real "
        "model.",
}

boost_arms = []
for arm_id, arm in BOOST["arms"].items():
    boost_arms.append({
        "id": arm_id, "name": ARM_DISPLAY[arm_id],
        "oneliner": ARM_ONELINERS[arm_id],
        "kind": arm["kind"], "variant": "VARIANT" in arm["kind"],
        "recipe": arm["recipe"],
        "frozen48": scores(arm["frozen48"]),
        "fulltest": scores(arm["fulltest"]),
    })
    if "groups" in arm:
        boost_arms[-1]["groups"] = arm["groups"]
    if "augmented_train_total" in arm:
        boost_arms[-1]["augmentedTrainTotal"] = arm["augmented_train_total"]

# every arm tied at the same scores — assert it before the page claims it
first = boost_arms[0]
for a in boost_arms:
    assert a["frozen48"] == first["frozen48"], a["id"]
    assert a["fulltest"] == first["fulltest"], a["id"]
for a in aug_arms:
    assert a["frozen48"]["acc"] == first["frozen48"]["acc"], a

# ------------------------------------------------------------------- The proof
census = BOOST["census"]
groups = []
for i, g in enumerate(census["groups"]):
    groups.append({
        "label": f"Plateau {'ABCD'[i]}", "nRuns": g["n_runs"],
        "classes": g["classes"],
        "severityMin": g["severity_min"], "severityMax": g["severity_max"],
    })

def ceiling(block):
    correct = sum(m["best_label_runs"] for m in block["mapping"])
    return {"n": block["n"], "correct": correct, "acc": block["ceiling_acc"]}

ceil_frozen = ceiling(census["ceiling_frozen48"])
ceil_full = ceiling(census["ceiling_fulltest"])
assert (ceil_frozen["correct"], ceil_frozen["n"]) == (13, 48)
assert (ceil_full["correct"], ceil_full["n"]) == (67, 244)
assert abs(ceil_frozen["acc"] - first["frozen48"]["acc"]) < 1e-12
assert abs(ceil_full["acc"] - first["fulltest"]["acc"]) < 1e-12

best_f1 = BOOST["best_arm_per_class_f1"]["fulltest"]
classes = BOOST["protocol"]["classes"]

data = {
    "seed": BOOST["protocol"]["seed"],
    "classes": classes,
    "nChannels": len(BOOST["protocol"]["channels_12"]),
    "nRawChannels": BOOST["protocol"]["n_raw_channels"],
    "windowSteps": BOOST["protocol"]["W_steps"],
    "problem": {
        "explanation": census["explanation"],
        "distinctWindows": census["distinct_windows_12ch_float32_pipeline"],
        "distinctWindowsFloat64": census["distinct_windows_12ch_float64"],
        "distinctWindowsAllChannels": census["distinct_windows_allch_float64"],
        "totalRuns": sum(g["n_runs"] for g in census["groups"]),
    },
    "aug": {
        "techniques": [{"name": t, "oneliner": TECH_ONELINERS[t]}
                       for t in AUG["protocol"]["techniques"]],
        "counts": aug_counts,
        "arms": aug_arms,
        "onsetArms": onset_arms,
    },
    "diagnostics": diagnostics,
    "boost": {
        "arms": boost_arms,
        "bestArm": BOOST["best_arm"],
        "bestPerClassF1Fulltest": [{"class": c, "f1": best_f1[c]}
                                   for c in classes],
    },
    "census": {
        "groups": groups,
        "ceilingFrozen": ceil_frozen,
        "ceilingFull": ceil_full,
    },
}

OUT.write_text(json.dumps(data, indent=1))
print("wrote", OUT, len(json.dumps(data)), "bytes")
print("ceilings:", ceil_frozen, ceil_full)
print("arms tied at frozen", first["frozen48"], "full", first["fulltest"])
