import asyncio
import os
from types import SimpleNamespace
import pytest
from protocolo_osint.engine_hub import EngineError
from protocolo_osint.engine_worker_runtime import worker_command, run_worker_engine, inventory
from protocolo_osint.engine_queue import validate_job, submit, process_job


def which(name):
    return "/bin/" + name


@pytest.mark.parametrize('engine', ['sherlock', 'maigret', 'subfinder', 'amass', 'spiderfoot'])
def test_five_worker_commands(engine):
    target = 'alice_test' if engine in ('sherlock','maigret') else 'example.org'
    argv=worker_command(engine,target,which=which)
    assert argv[0].startswith('/bin/') and target in argv
    assert all(';' not in x and '$(' not in x for x in argv)
    if engine=='spiderfoot': assert argv[argv.index('-u')+1]=='passive'
    if engine=='amass': assert '-passive' in argv


def test_no_shell_metacharacters():
    with pytest.raises(EngineError):worker_command('sherlock','alice;rm -rf /',which=which)
    with pytest.raises(EngineError):worker_command('amass','http://127.0.0.1',which=which)


def test_worker_disabled(monkeypatch):
    monkeypatch.delenv('OSINT_WORKER_AUTHORIZED',raising=False)
    with pytest.raises(EngineError): run_worker_engine('sherlock','alice',which=which)


def test_worker_runs_mocked_without_shell(monkeypatch):
    monkeypatch.setenv('OSINT_WORKER_AUTHORIZED','1')
    seen={}
    def runner(argv,**kwargs):
        seen.update(argv=argv,kwargs=kwargs)
        return SimpleNamespace(stdout='https://github.com/alice\n',stderr='',returncode=0)
    result=run_worker_engine('sherlock','alice',runner=runner,which=which)
    assert result['status']=='completed' and result['records']==['https://github.com/alice']
    assert seen['kwargs']['shell'] is False and seen['kwargs']['timeout']>0
    assert seen['kwargs']['env']['HOME'].startswith('/tmp/')


def test_validate_job_and_inventory():
    assert validate_job('subfinder','example.org')['target']=='example.org'
    assert len(inventory(which=which))==5
    with pytest.raises(EngineError): validate_job('nmap','example.org')


def test_submit_only_authenticated(monkeypatch):
    monkeypatch.setenv('OSINT_ENGINE_QUEUE_ENABLED','1')
    with pytest.raises(EngineError):asyncio.run(submit('sherlock','alice'))


def test_submit_queue_mock(monkeypatch):
    monkeypatch.setenv('OSINT_ENGINE_QUEUE_ENABLED','1')
    calls=[]
    async def sender(*args,**kwargs):calls.append((args,kwargs));return 'accepted'
    result=asyncio.run(submit('maigret','alice',authenticated=True,sender=sender))
    assert len(result['job_id'])==32 and result['status']=='queued'
    assert calls[0][0][1]['target']=='alice' and calls[0][1]['idempotency_key']==result['job_id']


def test_processing_writes_private_record(monkeypatch):
    monkeypatch.setenv('OSINT_WORKER_AUTHORIZED','1')
    calls=[]
    async def writer(path,data,**kwargs):calls.append((path,data,kwargs))
    result=asyncio.run(process_job({'job_id':'a'*32,'engine':'subfinder','target':'example.org'},engine_runner=lambda e,t:{'status':'completed','engine':e,'records':['x.example.org']},blob_writer=writer))
    assert result['status']=='completed' and calls[0][0]=='osint-jobs/'+'a'*32+'/result.json'
    assert calls[0][2]['access']=='private'
    assert b'x.example.org' in calls[0][1]
