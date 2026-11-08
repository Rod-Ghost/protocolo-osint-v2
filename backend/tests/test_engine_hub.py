import os
from types import SimpleNamespace

import pytest
from protocolo_osint import engine_hub as hub


def test_registry_is_complete(monkeypatch):
    monkeypatch.setattr(hub.shutil, 'which', lambda name: '/usr/bin/'+name if name!='spiderfoot' else None)
    monkeypatch.delenv('OSINT_ENGINE_EXECUTION_ENABLED', raising=False)
    engines = hub.inventory()
    assert len(engines) == 5
    assert {x['id'] for x in engines} == {'sherlock','maigret','subfinder','amass','spiderfoot'}
    assert engines[0]['status'] == 'approval_required'
    assert engines[3]['status'] == 'worker_required'
    assert engines[4]['status'] == 'not_installed'


def test_input_rejects_shell_and_private_names():
    for bad in ('a;ls','--help','a b','x@evil',''):
        with pytest.raises(hub.EngineError):
            hub._validate(hub.ENGINES[0],bad)
    for bad in ('localhost','host.local','hello.test','127.0.0.1','../etc/passwd'):
        with pytest.raises(hub.EngineError):
            hub._validate(hub.ENGINES[2],bad)


def test_explicit_disabled_prevents_process(monkeypatch):
    monkeypatch.delenv('OSINT_ENGINE_EXECUTION_ENABLED',raising=False)
    with pytest.raises(hub.EngineError,match='desabilitada'):
        hub.execute('sherlock','exampleuser',runner=lambda *a,**kw:pytest.fail('must not call runner'))


def test_bounded_runner_no_shell_and_limits(monkeypatch):
    monkeypatch.setenv('OSINT_ENGINE_EXECUTION_ENABLED','1')
    monkeypatch.setattr(hub.shutil,'which',lambda name: '/usr/bin/'+name)
    seen={}
    def fake(cmd,**kwargs):
        seen.update(kwargs)
        assert cmd[0]=='/usr/bin/subfinder'
        assert cmd[-1]=='30'
        return SimpleNamespace(stdout='a.example.org\nb.example.org\na.example.org\nnope\n',stderr='',returncode=0)
    result=hub.execute('subfinder','example.org',runner=fake)
    assert result['records']==['a.example.org','b.example.org']
    assert seen['shell'] is False and seen['timeout'] <= 24
    assert seen['stdin']==hub.subprocess.DEVNULL


def test_long_running_requires_worker(monkeypatch):
    monkeypatch.setenv('OSINT_ENGINE_EXECUTION_ENABLED','1')
    with pytest.raises(hub.EngineError, match='worker'):
        hub.execute('spiderfoot','example.org')
    with pytest.raises(hub.EngineError, match='worker'):
        hub.execute('amass','example.org')


def test_timeout_does_not_claim_completion(monkeypatch):
    monkeypatch.setenv('OSINT_ENGINE_EXECUTION_ENABLED','1')
    monkeypatch.setattr(hub.shutil,'which',lambda name:'/usr/bin/'+name)
    def fake(*args,**kwargs):
        raise hub.subprocess.TimeoutExpired('sherlock',12)
    with pytest.raises(hub.EngineError,match='prazo'):
        hub.execute('sherlock','testuser',runner=fake)
