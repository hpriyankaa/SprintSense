from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pickle
import json
import numpy as np
import pandas as pd
import shap
import os

app = FastAPI(title="SprintSense API", version="1.0.0")

# CORS — allow frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================
# Load models on startup
# =====================
MODELS_DIR = "models"
SNAPSHOTS = [0, 30, 50]

classifiers = {}
regressors = {}
explainers = {}

for snap in SNAPSHOTS:
    with open(f"{MODELS_DIR}/classifier_snap{snap}.pkl", "rb") as f:
        classifiers[snap] = pickle.load(f)
    with open(f"{MODELS_DIR}/regressor_snap{snap}.pkl", "rb") as f:
        regressors[snap] = pickle.load(f)
    with open(f"{MODELS_DIR}/explainer_snap{snap}.pkl", "rb") as f:
        explainers[snap] = pickle.load(f)

with open(f"{MODELS_DIR}/features.json", "r") as f:
    FEATURES = json.load(f)

print("All models loaded successfully.")

# =====================
# Helper
# =====================
def get_nearest_snapshot(completion_pct: float) -> int:
    """Map completion percentage to nearest trained snapshot."""
    if completion_pct <= 15:
        return 0
    elif completion_pct <= 40:
        return 30
    else:
        return 50

# =====================
# Request schema
# =====================
class SprintInput(BaseModel):
    planday: float = 14
    no_issue_starttime: float = 0
    vel_starttime: float = 0
    no_issue_added: float = 0
    no_issue_removed: float = 0
    no_issuetodo: float = 0
    no_issueinprogress: float = 0
    no_issuedone: float = 0
    no_teammember: float = 1
    snapshot: float = 50
    avg_blocking: float = 0
    avg_blockedby: float = 0
    avg_priority_change: float = 0
    avg_issuelink: float = 0
    avg_comments: float = 0
    scope_creep_ratio: float = 0
    removal_ratio: float = 0
    completion_ratio: float = 0
    todo_ratio: float = 0
    inprogress_ratio: float = 0
    blocker_ratio: float = 0
    team_load: float = 0
    historical_overrun_rate: float = 0.5
    completion_pct: float = 50  # used to select model

# =====================
# Endpoints
# =====================
@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": list(classifiers.keys())}

@app.get("/features")
def features():
    return {"features": FEATURES}

@app.post("/predict")
def predict(sprint: SprintInput):
    try:
        # Select correct model
        snap = get_nearest_snapshot(sprint.completion_pct)

        # Build feature vector
        input_data = {f: getattr(sprint, f, 0) for f in FEATURES}
        X = pd.DataFrame([input_data])[FEATURES].fillna(0)

        # Predict
        overrun_prob = classifiers[snap].predict_proba(X)[0][1]
        deficit = regressors[snap].predict(X)[0]

        # SHAP explanation
        shap_vals = explainers[snap].shap_values(X)
        shap_overrun = shap_vals[0][:, 1]

        shap_explanation = [
            {"feature": FEATURES[i], "value": float(X.iloc[0][FEATURES[i]]),
             "shap_value": float(shap_overrun[i])}
            for i in range(len(FEATURES))
        ]
        shap_explanation.sort(key=lambda x: abs(x["shap_value"]), reverse=True)

        return {
            "snapshot_used": snap,
            "overrun_probability": round(float(overrun_prob), 4),
            "overrun_probability_pct": round(float(overrun_prob) * 100, 1),
            "predicted_deficit": round(float(deficit), 2),
            "risk_level": "High" if overrun_prob >= 0.7 else "Medium" if overrun_prob >= 0.4 else "Low",
            "top_risk_factors": shap_explanation[:5],
            "full_shap": shap_explanation
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))