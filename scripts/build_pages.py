"""Build a strictly-static GitHub Pages preview from the canonical workspace.

This workflow is never a deployment of the Python API or MCP service.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'/'src'))
from protocolo_osint.catalog import SOURCES  # noqa: E402

def build(output: Path):
    source=ROOT/'apps'/'web'
    if output.resolve()==source.resolve():
        raise ValueError('Never modify the source frontend in place')
    if output.exists():shutil.rmtree(output)
    shutil.copytree(source,output)
    index=output/'index.html'
    html=index.read_text(encoding='utf-8')
    assert '<body>' in html
    html=html.replace('<body>','<body data-runtime="static">',1)
    assert 'href="assets/app.css"' in html and 'src="assets/app.js"' in html
    index.write_text(html,encoding='utf-8')
    catalog=output/'data'/'sources.json'
    catalog.parent.mkdir(exist_ok=True)
    catalog.write_text(json.dumps([dict(id=s.id,name=s.name,category=s.category,description=s.description,kinds=s.kinds,template=s.template,icon=s.icon,access=s.access) for s in SOURCES],ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (output/'.nojekyll').write_text('',encoding='utf-8')
    print(f'Built static preview: {output} ({len(SOURCES)} sources)')

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    build(parser.parse_args().output)
