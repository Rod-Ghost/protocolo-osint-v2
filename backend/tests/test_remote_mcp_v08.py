"""Official MCP SDK transport: read-only tools, no engine execution."""
import os
from fastapi.testclient import TestClient
from protocolo_osint.hosted_api import app
from protocolo_osint.mcp_remote_server import configured_hosts


def test_mcp_allowed_hosts_are_explicit(monkeypatch):
    monkeypatch.setenv('VERCEL_URL','preview-protocolo.vercel.app')
    assert 'preview-protocolo.vercel.app' in configured_hosts()
    monkeypatch.setenv('VERCEL_URL','evil.example.org')
    assert 'evil.example.org' not in configured_hosts()


def test_mcp_transport_and_existing_api_are_both_reachable():
    with TestClient(app) as client:
        assert client.get('/api/v1/health').status_code == 200
        headers = {'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'server/discover',
                   'Accept': 'application/json, text/event-stream', 'Content-Type': 'application/json'}
        meta = {'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                'io.modelcontextprotocol/clientCapabilities': {}}
        discover = client.post('/mcp/', json={'jsonrpc':'2.0','id':1,'method':'server/discover','params':{'_meta':meta}},headers=headers)
        assert discover.status_code == 200, discover.text[:1200]
        body = discover.json()
        assert body.get('jsonrpc') == '2.0' and 'result' in body
        headers['Mcp-Method'] = 'tools/list'
        listed = client.post('/mcp/', json={'jsonrpc':'2.0','id':2,'method':'tools/list','params':{'_meta':meta}}, headers=headers)
        assert listed.status_code == 200, listed.text[:1200]
        tools = listed.json()['result']['tools']
        names = {t['name'] for t in tools}
        assert {'osint_classify','osint_plan_sources','osint_list_sources'} <= names
        assert 'osint_run_engine' not in names and 'osint_read_case' not in names
        headers.update({'Mcp-Method':'tools/call','Mcp-Name':'osint_classify'})
        executed = client.post('/mcp/',json={'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'osint_classify','arguments':{'value':'example.org'},'_meta':meta}},headers=headers)
        assert executed.status_code == 200, executed.text[:1200]
        assert not executed.json()['result'].get('isError',False)
        # Same lifespan/session-manager instance: SDK only permits one startup per app.
    with TestClient(app) as client:
        headers={'MCP-Protocol-Version': '2025-06-18', 'Accept': 'application/json, text/event-stream', 'Content-Type': 'application/json'}
        init=client.post('/mcp/', json={'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-06-18','capabilities':{},'clientInfo':{'name':'Protocolo browser','version':'0.7.0'}}},headers=headers)
        assert init.status_code == 200, init.text[:600]
        assert 'serverInfo' in init.json().get('result',{}), init.text[:600]
        listed=client.post('/mcp/',json={'jsonrpc':'2.0','id':2,'method':'tools/list','params':{}},headers=headers)
        assert listed.status_code==200, listed.text[:600]
        assert any(x['name']=='osint_classify' for x in listed.json().get('result',{}).get('tools',[]))


