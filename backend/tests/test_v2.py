from __future__ import annotations
import io
import os
from pathlib import Path
from PIL import Image
from fastapi.testclient import TestClient
import pytest
from protocolo_osint.store import get_store
from protocolo_osint.main import app
from protocolo_osint.catalog import SOURCES
from protocolo_osint.mcp_stdio import respond

@pytest.fixture(autouse=True)
def fresh_store(monkeypatch,tmp_path):
    monkeypatch.setenv('OSINT_DATA_DIR',str(tmp_path/'data'))
    get_store.cache_clear()
    yield
    get_store.cache_clear()

client=TestClient(app)

def test_home_visual_served():
    page=client.get('/')
    assert page.status_code==200
    assert 'Intelligence Workspace' in page.text
    assert '/assets/app.js' in page.text
    assert client.get('/assets/app.css').status_code==200
    assert 'nosniff' in page.headers['x-content-type-options']

def test_catalog_and_search_are_offline_and_https():
    assert len(SOURCES)>=30
    assert len({s.id for s in SOURCES})==len(SOURCES)
    response=client.post('/api/v1/search/plan',json={'value':'example.org'})
    assert response.status_code==200
    data=response.json()
    assert data['kind']=='domain'
    assert data['external_requests']==0
    assert all(item['url'].startswith('https://') for item in data['results'])
    assert all(item['verified'] is False for item in data['results'])
    assert 'example.org' in ' '.join(x['url'] for x in data['results'])

def test_bad_query_rejected():
    assert client.post('/api/v1/search/plan',json={'value':'\x00'}).status_code==422
    assert client.post('/api/v1/search/plan',json={'value':'a'*513}).status_code==422

def test_cases_and_evidence_export():
    created=client.post('/api/v1/cases',json={'title':'Caso de teste','description':'Somente dados fictícios'})
    assert created.status_code==201
    case_id=created.json()['id']
    assert client.get('/api/v1/summary').json()['cases']==1
    invalid=client.post(f'/api/v1/cases/{case_id}/evidence',json={'title':'Ref','url':'http://example.org'})
    assert invalid.status_code==422
    good=client.post(f'/api/v1/cases/{case_id}/evidence',json={'title':'Fonte documental','url':'https://example.org','note':'Arquivo demonstrativo'})
    assert good.status_code==201
    assert len(good.json()['sha256'])==64
    detail=client.get(f'/api/v1/cases/{case_id}').json()
    assert detail['evidence'][0]['title']=='Fonte documental'
    exported=client.get(f'/api/v1/cases/{case_id}/export')
    assert exported.status_code==200
    assert exported.json()['case']['id']==case_id
    graph=client.get(f'/api/v1/cases/{case_id}/graph').json()
    assert len(graph['nodes'])==2 and len(graph['edges'])==1
    assert client.get('/api/v1/summary').json()['evidence']==1

def test_cases_404_and_too_short():
    assert client.post('/api/v1/cases',json={'title':' '}).status_code==422
    assert client.get('/api/v1/cases/notthere').status_code==404

def image_bytes():
    im=Image.new('RGB',(90,64),color='white')
    for x in range(0,90,3):
        for y in range(0,64,2):
            im.putpixel((x,y),(x%255,y%255,50))
    output=io.BytesIO();im.save(output,format='PNG');return output.getvalue()

def test_image_analysis_local_and_case_comparison(monkeypatch):
    monkeypatch.setenv('OSINT_OCR_ENABLED','0')
    image=image_bytes()
    response=client.post('/api/v1/images/analyze',files={'file':('test.png',image,'image/png')})
    assert response.status_code==200
    metadata=response.json()
    assert metadata['format']=='PNG'
    assert len(metadata['sha256'])==64
    assert len(metadata['dhash'])==16
    assert metadata['external_requests']==0
    assert metadata['registered_in_case'] is False
    c=client.post('/api/v1/cases',json={'title':'Imagens para testar'}).json()
    first=client.post('/api/v1/images/analyze',files={'file':('test.png',image,'image/png')},data={'case_id':c['id']})
    assert first.status_code==200 and first.json()['registered_in_case']
    second=client.post('/api/v1/images/analyze',files={'file':('test2.png',image,'image/png')},data={'case_id':c['id']})
    assert second.status_code==200
    assert second.json()['similar_in_case'][0]['distance']==0
    assert client.get('/api/v1/summary').json()['evidence']==2
    # Original image bytes are never stored in SQLite or on disk.
    assert not any(p.suffix=='.png' for p in Path(os.environ['OSINT_DATA_DIR']).rglob('*'))

def test_reject_corrupt_or_large_image():
    invalid=client.post('/api/v1/images/analyze',files={'file':('bad.png',b'malicious payload','image/png')})
    assert invalid.status_code==422
    too_large=client.post('/api/v1/images/analyze',files={'file':('large.png',b'0'*(10*1024*1024+1),'image/png')})
    assert too_large.status_code==422

def test_mcp_read_only_tools():
    assert respond({'jsonrpc':'2.0','id':1,'method':'initialize'})['result']['serverInfo']['name']=='protocolo-osint-v2'
    tools=respond({'jsonrpc':'2.0','id':2,'method':'tools/list'})['result']['tools']
    assert len(tools)==2
    call=respond({'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'osint_detect_input','arguments':{'value':'example.org'}}})
    assert 'domain' in call['result']['content'][0]['text']
    bad=respond({'jsonrpc':'2.0','id':4,'method':'tools/call','params':{'name':'exec','arguments':{'command':'rm -rf /'}}})
    assert bad['result']['isError']
