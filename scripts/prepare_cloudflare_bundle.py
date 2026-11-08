"""Prepare the stateless public Cloudflare Python Worker from canonical modules.

Does not deploy or change Cloudflare resources.
"""
from pathlib import Path
import argparse
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "backend" / "src" / "protocolo_osint"
WORKER = ROOT / "deploy" / "cloudflare" / "worker.py"

def build(output: Path):
    output = output.resolve()
    if output == WORKER.parent.resolve() or output == SOURCE.resolve():
        raise ValueError("Choose a separate output directory.")
    output.mkdir(parents=True, exist_ok=True)
    for filename in ("catalog.py", "detection.py"):
        shutil.copyfile(SOURCE / filename, output / ("detection.py" if filename == "detection.py" else filename))
    shutil.copyfile(WORKER, output / "worker.py")
    print(f"Public stateless Worker bundle prepared at {output}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    build(parser.parse_args().output)
