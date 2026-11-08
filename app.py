"""Vercel entrypoint. Separate from the unrestricted single-user local API."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "backend" / "src"))
from protocolo_osint.hosted_api import app  # noqa: E402
