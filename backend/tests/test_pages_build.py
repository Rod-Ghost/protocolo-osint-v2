"""GitHub Pages publishes a static preview, never a Python API."""
from __future__ import annotations
import json
import subprocess
import sys
from pathlib import Path


def test_pages_builder_contains_only_site_assets(tmp_path):
    root=Path(__file__).resolve().parents[2]
    target=tmp_path/'site'
    subprocess.run([sys.executable,str(root/'scripts'/'build_pages.py'),'--output',str(target)],check=True)
    markup=(target/'index.html').read_text(encoding='utf-8')
    assert '<body data-runtime="static">' in markup
    assert 'href="assets/app.css"' in markup
    assert 'src="assets/app.js"' in markup
    assert 'href="./"' in markup
    sources=json.loads((target/'data'/'sources.json').read_text(encoding='utf-8'))
    assert len(sources)>=40
    assert all(source['template'].startswith('https://') for source in sources)
    assert (target/'.nojekyll').exists()
    assert not (target/'backend').exists()
    assert not (target/'pyproject.toml').exists()
