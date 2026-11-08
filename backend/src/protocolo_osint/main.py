"""Protocolo OSINT V2 — localhost-only, safe-by-default investigation workspace."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from .catalog import SOURCES, list_sources, plan
from .detection import detect_type
from .media import InvalidImage, MAX_BYTES, analyze
from .store import get_store

app = FastAPI(title='Protocolo OSINT V2', version='0.2.0', docs_url='/api/docs', openapi_url='/api/openapi.json')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173','http://127.0.0.1:5173'], allow_credentials=False, allow_methods=['GET','POST'], allow_headers=['Content-Type'])

@app.middleware('http')
async def security_headers(request,call_next):
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='no-referrer'
    response.headers['X-Frame-Options']='DENY'
    response.headers['Permissions-Policy']='camera=(), microphone=(), geolocation=()'
    response.headers['Content-Security-Policy']="default-src 'self'; img-src 'self' blob: data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control']='no-store'
    return response

class DetectRequest(BaseModel):
    value: str = Field(min_length=1,max_length=512)

class SearchRequest(BaseModel):
    value: str = Field(min_length=1,max_length=512)
    category: str|None = Field(default=None,max_length=80)

class CaseCreate(BaseModel):
    title: str = Field(min_length=2,max_length=120)
    description: str = Field(default='',max_length=1500)

    @field_validator('title')
    @classmethod
    def clean_title(cls,v):
        v=v.strip()
        if len(v)<2:raise ValueError('Título curto demais.')
        return v

class EvidenceCreate(BaseModel):
    kind: Literal['reference','note'] = 'reference'
    title: str = Field(min_length=2,max_length=180)
    url: str|None = Field(default=None,max_length=2000)
    note: str = Field(default='',max_length=5000)

    @field_validator('url')
    @classmethod
    def valid_url(cls,value):
        if value is None or not value.strip(): return None
        parts=urlsplit(value.strip())
        if parts.scheme!='https' or not parts.netloc or parts.username or parts.password:
            raise ValueError('URL de referência deve utilizar HTTPS sem credenciais.')
        return value.strip()

@app.get('/api/v1/health')
def health():return {'status':'ok','version':'0.2.0','external_requests':0}

@app.post('/api/v1/detect')
def detect(payload:DetectRequest):
    try: kind=detect_type(payload.value)
    except ValueError as exc:raise HTTPException(status_code=422,detail=str(exc)) from exc
    return {'kind':kind,'value':payload.value.strip(),'external_requests':0}

@app.get('/api/v1/sources')
def sources(kind:str|None=None,category:str|None=None,q:str|None=None):
    return {'sources':list_sources(kind,category,q),'total':len(SOURCES),'validation':'URLs de destinos externos não verificadas nesta execução'}

@app.post('/api/v1/search/plan')
def make_plan(payload:SearchRequest):
    try: kind=detect_type(payload.value)
    except ValueError as exc:raise HTTPException(status_code=422,detail=str(exc)) from exc
    results=plan(payload.value,kind,payload.category)
    return {'query':payload.value.strip(),'kind':kind,'results':results,'total':len(results),'external_requests':0,'notice':'Links preparados localmente; nenhum serviço externo foi consultado.'}

@app.get('/api/v1/summary')
def summary():
    cases=get_store().list_cases()
    return {'sources':len(SOURCES),'categories':len(set(x.category for x in SOURCES)),'cases':len(cases),'evidence':sum(x['evidence_count'] for x in cases),'online_integrations':0,'mode':'local'}

@app.get('/api/v1/integrations')
def integrations():
    return {'integrations':[
        {'name':'Catálogo de busca','status':'active','detail':'URLs de busca construídas localmente'},
        {'name':'Análise de imagens','status':'active','detail':'Pillow, SHA-256, dHash e OCR quando instalado'},
        {'name':'Casos e registros','status':'active','detail':'SQLite no dispositivo local'},
        {'name':'Servidor MCP stdio','status':'experimental','detail':'Ferramentas locais somente leitura; configuração manual'},
        {'name':'Sherlock / Maigret','status':'planned','detail':'Adaptadores externos ainda não conectados'},
        {'name':'Visão de internet','status':'planned','detail':'Busca reversa externa exige provedores e consentimento'},
        {'name':'IA e vetores','status':'planned','detail':'Não conectados; nenhum dado enviado'},
    ]}

@app.get('/api/v1/cases')
def cases():return {'items':get_store().list_cases()}

@app.post('/api/v1/cases',status_code=201)
def create_case(payload:CaseCreate):
    if isinstance(payload.title,ValueError): raise HTTPException(status_code=422,detail='Título inválido')
    return get_store().create_case(payload.title.strip(),payload.description.strip())

@app.get('/api/v1/cases/{case_id}')
def get_case(case_id:str):
    case=get_store().get_case(case_id)
    if not case:raise HTTPException(404,'Caso não encontrado.')
    return case

@app.post('/api/v1/cases/{case_id}/evidence',status_code=201)
def add_evidence(case_id:str,payload:EvidenceCreate):
    evidence=get_store().add_evidence(case_id,payload.kind,payload.title.strip(),payload.url,payload.note.strip())
    if not evidence:raise HTTPException(404,'Caso não encontrado.')
    return {**evidence,'warning':'Hash do registro de metadados, não da página externa.'}

@app.get('/api/v1/cases/{case_id}/export')
def export_case(case_id:str):
    case=get_store().get_case(case_id)
    if not case:raise HTTPException(404,'Caso não encontrado.')
    return JSONResponse({'format':'protocolo-osint/v2-case-export','case':case,'notice':'Exportação de registros locais; URLs não são cópias forenses preservadas.'},headers={'Content-Disposition':f'attachment; filename="case-{case_id}.json"'})

@app.get('/api/v1/cases/{case_id}/graph')
def graph(case_id:str):
    data=get_store().graph(case_id)
    if not data:raise HTTPException(404,'Caso não encontrado.')
    return data

@app.post('/api/v1/images/analyze')
async def analyze_image(file:UploadFile=File(...),case_id:str|None=Form(None)):
    try:
        raw=await file.read(MAX_BYTES+1)
        result=analyze(raw)
    except InvalidImage as exc:
        raise HTTPException(422,str(exc)) from exc
    finally:
        await file.close()
    result['similar_in_case']=[]
    result['registered_in_case']=False
    if case_id:
        store=get_store()
        if not store.get_case(case_id):raise HTTPException(404,'Caso não encontrado.')
        result['similar_in_case']=store.image_matches(case_id,result['dhash'])
        # Registers hashes and metadata ONLY; photo pixels are not retained.
        title=(file.filename or 'Imagem analisada').split('/')[-1].split('\\')[-1][:120]
        evidence=store.add_evidence(case_id,'note',f'Análise de imagem: {title}',None,f"SHA-256: {result['sha256']} | dHash: {result['dhash']} | {result['width']}×{result['height']}")
        store.add_image(case_id,title,result['sha256'],result['dhash'])
        result['registered_in_case']=True
        result['evidence_id']=evidence['id']
    result['notice']='Análise local. Nenhum upload a serviços externos; original não armazenado.'
    return result

web_dir=Path(os.getenv('OSINT_WEB_DIR',str(Path(__file__).resolve().parents[3]/'apps'/'web')))
if web_dir.joinpath('assets').is_dir():
    app.mount('/assets',StaticFiles(directory=web_dir/'assets'),name='assets')

@app.get('/',include_in_schema=False)
def home():
    if not web_dir.joinpath('index.html').is_file():raise HTTPException(404,'Frontend não encontrado.')
    return FileResponse(web_dir/'index.html',media_type='text/html')
