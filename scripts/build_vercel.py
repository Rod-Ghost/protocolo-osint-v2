"""Generate Vercel's static public/ folder from canonical web app and source catalog."""
import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend' / 'src'))
from protocolo_osint.catalog import SOURCES  # noqa: E402


def build(output: Path):
    source = ROOT / 'apps' / 'web'
    output = output.resolve()
    if output == source.resolve() or output == ROOT.resolve():
        raise ValueError('Saída deve ser independente da fonte e raiz do projeto.')
    if output.exists():
        shutil.rmtree(output)
    shutil.copytree(source, output)
    html = (output / 'index.html').read_text(encoding='utf-8')
    assert '<body>' in html and 'href="assets/app.css"' in html
    html = html.replace('<body>', '<body data-runtime="hosted">', 1)
    (output / 'index.html').write_text(html, encoding='utf-8')
    folder = output / 'data'
    folder.mkdir(exist_ok=True)
    (folder / 'sources.json').write_text(json.dumps([
        dict(id=s.id, name=s.name, category=s.category, description=s.description,
             kinds=s.kinds, template=s.template, icon=s.icon, access=s.access)
        for s in SOURCES
    ], ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'Built hosted interface: {len(SOURCES)} sources → {output}')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--output', type=Path, default=ROOT / 'public')
    build(p.parse_args().output)
