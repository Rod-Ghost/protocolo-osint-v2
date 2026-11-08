"""Experimental, local-only MCP JSON-RPC stdio adapter.

A tiny read-only protocol implementation. No remote URL retrieval, shell access,
file access, or writes. For production add SDK conformance testing.
"""
from __future__ import annotations
import json
import sys
from .catalog import list_sources
from .detection import detect_type

TOOLS=[
 {'name':'osint_detect_input','description':'Classifica um termo localmente, sem acesso à rede.',
  'inputSchema':{'type':'object','properties':{'value':{'type':'string','maxLength':512}},'required':['value']}},
 {'name':'osint_list_sources','description':'Lista fontes documentadas, sem executar consultas externas.',
  'inputSchema':{'type':'object','properties':{'kind':{'type':'string'},'category':{'type':'string'}}}},
]

def respond(request):
    method=request.get('method');params=request.get('params') or {};id=request.get('id')
    if method=='notifications/initialized':return None
    try:
        if method=='initialize':result={'protocolVersion':'2025-06-18','capabilities':{'tools':{}},'serverInfo':{'name':'protocolo-osint-v2','version':'0.2.0'}}
        elif method=='ping':result={}
        elif method=='tools/list':result={'tools':TOOLS}
        elif method=='tools/call':
            name=params.get('name');args=params.get('arguments') or {}
            if name=='osint_detect_input':
                value=args.get('value','');value=value.strip() if isinstance(value,str) else ''
                info={'value':value,'kind':detect_type(value),'external_requests':0}
            elif name=='osint_list_sources':info={'sources':list_sources(args.get('kind'),args.get('category')),'external_requests':0}
            else:raise ValueError('Ferramenta desconhecida.')
            result={'content':[{'type':'text','text':json.dumps(info,ensure_ascii=False)}]}
        else:return {'jsonrpc':'2.0','id':id,'error':{'code':-32601,'message':'Método não disponível'}} if id is not None else None
        return {'jsonrpc':'2.0','id':id,'result':result} if id is not None else None
    except (ValueError,TypeError) as exc:
        return {'jsonrpc':'2.0','id':id,'result':{'content':[{'type':'text','text':str(exc)}],'isError':True}} if method=='tools/call' else {'jsonrpc':'2.0','id':id,'error':{'code':-32602,'message':str(exc)}}

def main():
    for line in sys.stdin:
        try:
            request=json.loads(line)
            answer=respond(request)
        except Exception:
            answer={'jsonrpc':'2.0','id':None,'error':{'code':-32700,'message':'Erro de JSON'}}
        if answer is not None:
            sys.stdout.write(json.dumps(answer,ensure_ascii=False)+'\n');sys.stdout.flush()

if __name__=='__main__': main()
