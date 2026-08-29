"""DataIQ Pro FastAPI backend.

Endpoints:
- GET  /health         liveness probe
- POST /schema         infer schema from a dataset payload
- POST /predict        train a small RandomForest on the supplied dataset and
                       return predictions + metrics (used by the e2e test as
                       a stand-in for "DL/ETL pipeline runs successfully").
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import accuracy_score, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

app = FastAPI(title="DataIQ Pro Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Dataset(BaseModel):
    columns: List[str]
    rows: List[Dict[str, Any]]


class PredictRequest(BaseModel):
    dataset: Dataset
    target: str
    features: Optional[List[str]] = None
    test_size: float = Field(0.2, ge=0.05, le=0.5)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/schema")
def schema(ds: Dataset) -> Dict[str, Any]:
    df = pd.DataFrame(ds.rows, columns=ds.columns)
    return {
        "rows": len(df),
        "columns": [
            {
                "name": c,
                "dtype": str(df[c].dtype),
                "missing": int(df[c].isna().sum()),
                "unique": int(df[c].nunique(dropna=True)),
            }
            for c in df.columns
        ],
    }


@app.post("/predict")
def predict(req: PredictRequest) -> Dict[str, Any]:
    rows = req.dataset.rows
    # Big Data sub-sampling cap for backend training performance
    if len(rows) > 50000:
        df = pd.DataFrame(rows, columns=req.dataset.columns).sample(n=50000, random_state=42)
    else:
        df = pd.DataFrame(rows, columns=req.dataset.columns)
    if req.target not in df.columns:
        return {"error": f"target {req.target!r} not in columns"}

    feats = req.features or [c for c in df.columns if c != req.target]
    X = df[feats].copy()
    y = df[req.target].copy()

    # encode categoricals
    for c in X.select_dtypes(include=["object"]).columns:
        X[c] = LabelEncoder().fit_transform(X[c].astype(str))
    X = X.fillna(X.median(numeric_only=True)).fillna(0)

    is_classification = y.dtype == object or y.nunique() <= 10
    if is_classification:
        y_enc = LabelEncoder().fit_transform(y.astype(str))
        Xtr, Xte, ytr, yte = train_test_split(X, y_enc, test_size=req.test_size, random_state=42)
        model = RandomForestClassifier(n_estimators=50, random_state=42)
        model.fit(Xtr, ytr)
        pred = model.predict(Xte)
        importances = sorted(
            [{"feature": f, "importance": float(imp)} for f, imp in zip(feats, model.feature_importances_)],
            key=lambda x: x["importance"],
            reverse=True,
        )
        return {
            "task": "classification",
            "metric": "accuracy",
            "score": float(accuracy_score(yte, pred)),
            "n_train": len(Xtr),
            "n_test": len(Xte),
            "feature_importances": importances,
        }

    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=req.test_size, random_state=42)
    model = RandomForestRegressor(n_estimators=50, random_state=42)
    model.fit(Xtr, ytr)
    pred = model.predict(Xte)
    importances = sorted(
        [{"feature": f, "importance": float(imp)} for f, imp in zip(feats, model.feature_importances_)],
        key=lambda x: x["importance"],
        reverse=True,
    )
    return {
        "task": "regression",
        "metric": "r2",
        "score": float(r2_score(yte, pred)),
        "n_train": len(Xtr),
        "n_test": len(Xte),
        "feature_importances": importances,
    }
