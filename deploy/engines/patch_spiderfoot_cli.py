"""Narrow compatibility patch for the *installed* SpiderFoot v4.0 sf.py.

The pinned upstream CLI wraps any token without "." or "+" in quotes,
turning valid ASN, IPv6 and Bitcoin seeds into USERNAME targets.
Only insert an extra target-type check before this fallback. Never
incorporate, redistribute or rewrite the full third-party repository.
Preserve SpiderFoot GPLv2 copyright and license in the container.
"""
from __future__ import annotations

from pathlib import Path
import sys

OLD = '''    if "." not in target and not target.startswith("+") and '"' not in target:'''
NEW = '''    if ("." not in target and not target.startswith("+") and '"' not in target
            and SpiderFootHelpers.targetTypeFromString(target) is None):'''


def patch_cli(source: str) -> str:
    """Fail closed for unexpected upstream revisions; do not patch arbitrary code."""
    if source.count(OLD) != 1:
        raise ValueError("Incompatible SpiderFoot upstream CLI revision: source marker absent or duplicated.")
    if "from spiderfoot import SpiderFootHelpers" not in source:
        raise ValueError("SpiderFootHelpers not imported in the expected CLI source.")
    return source.replace(OLD, NEW, 1)


def main(argv: list[str]) -> None:
    if len(argv) != 2:
        raise SystemExit("Usage: patch_spiderfoot_cli.py /path/to/sf.py")
    path = Path(argv[1])
    source = path.read_text(encoding="utf-8")
    patched = patch_cli(source)
    compile(patched, str(path), "exec")
    path.write_text(patched, encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv)
