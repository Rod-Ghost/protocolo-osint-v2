"""Vercel Daemon must coexist with the original FastAPI project.

Static configuration check. Does not claim the container is live.
"""
import json
from pathlib import Path


def test_single_pilot_daemon_is_private_and_quota_limited():
    root=Path(__file__).resolve().parents[2]
    config=json.loads((root/"vercel.json").read_text(encoding="utf-8"))
    assert config["framework"] == "fastapi"
    assert "app.py" in config["functions"]
    daemons=config["daemons"]
    assert list(daemons)==["osint-engines"]
    worker=daemons["osint-engines"]
    assert worker["root"] == "."
    assert worker["entrypoint"] == "deploy/engines/Dockerfile.daemon"
    assert worker["instances"] == {"gru1": 1}
    assert worker["resources"] == {"requests":{"memory":"1Gi"}}
    assert "OSINT_ENGINE_TOKEN" not in json.dumps(config)
    assert (root / worker["entrypoint"]).is_file()
