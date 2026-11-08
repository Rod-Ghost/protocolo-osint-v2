"""Local, single-operator SQLite case/evidence repository.

A source URL reference is not a forensically preserved web capture; store it
as an annotated reference and represent that limitation explicitly.
"""
from __future__ import annotations
import hashlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path


def now(): return datetime.now(timezone.utc).isoformat()

def canonical(value): return json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':'))

class Store:
    def __init__(self, directory: Path):
        self.directory=directory
        self.directory.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.db_path=self.directory/'osint.sqlite3'
        with self._db() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS cases (
                    id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS evidence (
                    id TEXT PRIMARY KEY,case_id TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,
                    url TEXT,note TEXT NOT NULL DEFAULT '',sha256 TEXT NOT NULL,created_at TEXT NOT NULL,
                    FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS image_index(
                    id TEXT PRIMARY KEY,case_id TEXT NOT NULL,title TEXT NOT NULL,sha256 TEXT NOT NULL,
                    dhash TEXT NOT NULL,created_at TEXT NOT NULL,
                    FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
                );
            ''')
        try: os.chmod(self.db_path,0o600)
        except OSError: pass

    def _db(self):
        db=sqlite3.connect(self.db_path,timeout=10)
        db.row_factory=sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        return db

    def list_cases(self):
        with self._db() as db:
            rows=db.execute('SELECT c.*, (SELECT COUNT(*) FROM evidence e WHERE e.case_id=c.id) evidence_count FROM cases c ORDER BY created_at DESC').fetchall()
            return [dict(x) for x in rows]

    def create_case(self,title,description):
        item={'id':uuid.uuid4().hex,'title':title,'description':description,'created_at':now()}
        with self._db() as db: db.execute('INSERT INTO cases(id,title,description,created_at) VALUES (:id,:title,:description,:created_at)',item)
        return item

    def get_case(self,case_id):
        with self._db() as db:
            row=db.execute('SELECT * FROM cases WHERE id=?',(case_id,)).fetchone()
            if not row: return None
            evidence=db.execute('SELECT * FROM evidence WHERE case_id=? ORDER BY created_at DESC',(case_id,)).fetchall()
            return {**dict(row),'evidence':[dict(x) for x in evidence]}

    def add_evidence(self,case_id,kind,title,url,note):
        if not self.get_case(case_id): return None
        item={'id':uuid.uuid4().hex,'case_id':case_id,'kind':kind,'title':title,'url':url,'note':note,'created_at':now()}
        item['sha256']=hashlib.sha256(canonical(item).encode()).hexdigest()
        with self._db() as db:
            db.execute('INSERT INTO evidence(id,case_id,kind,title,url,note,sha256,created_at) VALUES (:id,:case_id,:kind,:title,:url,:note,:sha256,:created_at)',item)
        return item

    def add_image(self,case_id,title,sha256,dhash):
        if not self.get_case(case_id):return None
        item={'id':uuid.uuid4().hex,'case_id':case_id,'title':title,'sha256':sha256,'dhash':dhash,'created_at':now()}
        with self._db() as db:
            db.execute('INSERT INTO image_index(id,case_id,title,sha256,dhash,created_at) VALUES (:id,:case_id,:title,:sha256,:dhash,:created_at)',item)
        return item

    def image_matches(self,case_id,dhash,max_distance=12):
        with self._db() as db: items=db.execute('SELECT * FROM image_index WHERE case_id=?',(case_id,)).fetchall()
        return sorted(({**dict(x),'distance':(int(dhash,16)^int(x['dhash'],16)).bit_count()} for x in items if (int(dhash,16)^int(x['dhash'],16)).bit_count()<=max_distance),key=lambda x:x['distance'])[:8]

    def graph(self,case_id):
        case=self.get_case(case_id)
        if not case:return None
        nodes=[{'id':case['id'],'label':case['title'],'kind':'case'}]
        links=[]
        for e in case['evidence']:
            nodes.append({'id':e['id'],'label':e['title'],'kind':e['kind']})
            links.append({'source':case['id'],'target':e['id'],'label':'registrado em'})
        return {'nodes':nodes,'edges':links,'note':'Vínculos organizacionais; não inferem identidade.'}

@lru_cache(maxsize=1)
def get_store():
    root=Path(os.environ.get('OSINT_DATA_DIR',str(Path.home()/'.local'/'share'/'protocolo-osint-v2')))
    return Store(root)
