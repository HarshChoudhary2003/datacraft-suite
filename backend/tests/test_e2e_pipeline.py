"""End-to-end test: upload sample dataset, run schema + predict (DL/ETL stand-in)
and verify the pipeline trains and evaluates successfully."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import app  # noqa: E402

client = TestClient(app)


def _sample_dataset(n: int = 200):
    rng = np.random.default_rng(42)
    x1 = rng.normal(0, 1, n)
    x2 = rng.normal(5, 2, n)
    y = (x1 + 0.5 * x2 > 2.5).astype(int)
    cols = ["x1", "x2", "label"]
    rows = [{"x1": float(a), "x2": float(b), "label": int(c)} for a, b, c in zip(x1, x2, y)]
    return {"columns": cols, "rows": rows}


def test_health():
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_schema_inference():
    r = client.post("/schema", json=_sample_dataset())
    assert r.status_code == 200
    body = r.json()
    assert body["rows"] == 200
    assert {c["name"] for c in body["columns"]} == {"x1", "x2", "label"}


def test_train_and_evaluate_pipeline():
    payload = {"dataset": _sample_dataset(), "target": "label", "test_size": 0.25}
    r = client.post("/predict", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["task"] == "classification"
    assert body["n_train"] > 0 and body["n_test"] > 0
    # Pipeline must achieve a reasonable score on this separable problem.
    assert body["score"] > 0.8, body
