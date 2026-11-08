import subprocess
from types import SimpleNamespace
import pytest

from protocolo_osint import local_engines


def test_registry_has_expected_external_tools():
    names={s['id'] for s in local_engines.inventory()}
    assert {'sherlock','maigret','subfinder','amass','spiderfoot'} <= names


def test_local_engine_disabled_without_explicit_opt_in(monkeypatch):
    monkeypatch.delenv('OSINT_ENABLE_LOCAL_ENGINES',raising=False)
    with pytest.raises(local_engines.EngineError):
        local_engines.run('sherlock','octocat')


def test_safe_subprocess_argv_and_output_limit(monkeypatch):
    monkeypatch.setenv('OSINT_ENABLE_LOCAL_ENGINES','1')
    monkeypatch.setattr(local_engines.shutil,'which',lambda exe: '/usr/bin/'+exe)
    commands=[]
    def fake_run(command,**kwargs):
        commands.append((command,kwargs))
        return SimpleNamespace(returncode=0,stdout='a'*13000,stderr='')
    result=local_engines.run('subfinder','example.org',runner=fake_run)
    assert result['truncated'] and len(result['stdout'])==12000
    assert commands[0][0]==['subfinder','-silent','-d','example.org']
    assert commands[0][1]['shell'] is False and commands[0][1]['timeout']<=45
    with pytest.raises(local_engines.EngineError):
        local_engines.run('sherlock','username; echo hacked',runner=fake_run)
    with pytest.raises(local_engines.EngineError):
        local_engines.run('spiderfoot','example.org',runner=fake_run)
