"""Vercel deployment contains a stateless public backend and browser app."""
import json
import subprocess
import sys
from pathlib import Path


def test_vercel_site_build(tmp_path):
    root=Path(__file__).resolve().parents[2]
    out=tmp_path/'public'
    subprocess.run([sys.executable,str(root/'scripts'/'build_vercel.py'),'--output',str(out)],check=True)
    html=(out/'index.html').read_text(encoding='utf-8')
    assert '<body data-runtime="hosted">' in html
    assert 'assets/aurum.css' in html
    assert 'id="panel-infra"' in html
    assert (out/'assets'/'aurum.css').is_file()
    assert len(json.loads((out/'data'/'sources.json').read_text(encoding='utf-8')))>=40
    assert not (out/'backend').exists()
    assert not (out/'app.py').exists()
