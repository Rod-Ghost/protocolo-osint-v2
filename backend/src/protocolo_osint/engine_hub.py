"""Bounded, opt-in execution of third-party OSINT CLIs.

No third-party source is vendored in this module. The CLI programs are installed
as pinned, separately-licensed dependencies in the optional container image.

IMPORTANT: inventory is public, execution is private and opt-in. Never expose
this to unauthenticated traffic. For production deployment use a managed
identity provider, distributed quotas, and queued work rather than long HTTP jobs.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from .detection import DOMAIN

USERNAME = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{1,38}$")
MAX_STDOUT = 16000
MAX_STDERR = 1500
MAX_RESULTS = 60
MAX_SECONDS = 24


@dataclass(frozen=True)
class Engine:
    id: str
    title: str
    source: str
    license: str
    input_kind: str
    executable: str
    mode: str
    description: str
    project_version: str


ENGINES: tuple[Engine, ...] = (
    Engine('sherlock', 'Sherlock', 'https://github.com/sherlock-project/sherlock', 'MIT',
           'username', 'sherlock', 'bounded', 'Perfis públicos por identificador; resultados sujeitos a falsos positivos', '0.16.2'),
    Engine('maigret', 'Maigret', 'https://github.com/soxoj/maigret', 'MIT',
           'username', 'maigret', 'bounded', 'Verificação voluntária de identificadores com escopo reduzido', '0.6.6'),
    Engine('subfinder', 'subfinder', 'https://github.com/projectdiscovery/subfinder', 'MIT',
           'domain', 'subfinder', 'bounded', 'Descoberta PASSIVA de subdomínios publicados', 'pinned container build'),
    Engine('amass', 'OWASP Amass', 'https://github.com/owasp-amass/amass', 'Apache-2.0*',
           'domain', 'amass', 'worker', 'Mapeamento passivo de superfície; pode precisar de serviço e fila', 'pinned container build'),
    Engine('spiderfoot', 'SpiderFoot', 'https://github.com/smicallef/spiderfoot', 'GPL-2.0-only',
           'domain', 'spiderfoot', 'worker', 'Módulos OSINT executados de forma isolada e durável', 'v4.0'),
)


class EngineError(ValueError):
    """Safe public-facing error without executable stderr or secrets."""


def _spec(engine_id: str) -> Engine:
    for item in ENGINES:
        if item.id == engine_id:
            return item
    raise EngineError('Motor não reconhecido.')


def _validate(engine: Engine, value: str) -> str:
    query = value.strip()
    if engine.input_kind == 'username':
        query = query.removeprefix('@')
        if not USERNAME.fullmatch(query):
            raise EngineError('Informe um único username público (2 a 39 caracteres; sem espaços).')
    else:
        if not DOMAIN.fullmatch(query) or query.lower().endswith(('.local', '.localhost', '.internal', '.test', '.invalid')):
            raise EngineError('Informe um único domínio público válido; redes e domínios locais não são aceitos.')
    return query


def _enabled() -> bool:
    return os.getenv('OSINT_ENGINE_EXECUTION_ENABLED', '') == '1'


def inventory() -> list[dict[str, Any]]:
    """Check actual executable presence rather than claiming a configured engine runs."""
    enabled = _enabled()
    output = []
    for spec in ENGINES:
        present = shutil.which(spec.executable) is not None
        runnable = enabled and present and spec.mode == 'bounded'
        if not present:
            status, reason = 'not_installed', 'Dependência ausente neste runtime.'
        elif spec.mode != 'bounded':
            status, reason = 'worker_required', 'Instalado ou identificável, mas exige worker isolado/fila; não executa nesta API.'
        elif not enabled:
            status, reason = 'approval_required', 'Instalado; execução remota desabilitada até ativação e autenticação.'
        else:
            status, reason = 'ready', 'Executável disponível; execução autenticada e limitada por pedido.'
        output.append({**asdict(spec), 'installed': present, 'enabled': enabled,
                       'runnable': runnable, 'status': status, 'reason': reason})
    return output


def _argv(spec: Engine, query: str) -> list[str]:
    """No user-controlled flags, arbitrary urls, proxies, files, or shell syntax."""
    path = shutil.which(spec.executable)
    if not path:
        raise EngineError(f'{spec.title} não foi instalado nesta instância.')
    if spec.id == 'sherlock':
        return [path, '--print-found', '--no-color', '--timeout', '4', '--site', 'GitHub', '--site', 'Reddit', '--site', 'GitLab', '--site', 'Instagram', query]
    if spec.id == 'maigret':
        return [path, query, '--no-recursion', '--top-sites', '15', '--timeout', '4', '--max-connections', '5']
    if spec.id == 'subfinder':
        return [path, '-silent', '-d', query, '-timeout', '4', '-max-time', '1', '-rl', '5']
    raise EngineError(f'{spec.title} requer um worker específico, não uma chamada HTTP síncrona.')


def _parse_lines(text: str, kind: str) -> list[str]:
    seen: set[str] = set()
    results = []
    for line in text.splitlines():
        line = line.strip().removeprefix('[+] ').removeprefix('[+]')
        if not line or len(line) > 250:
            continue
        # Do not claim every line is a confirmed finding: raw records need review.
        if kind == 'domain' and not DOMAIN.fullmatch(line):
            continue
        if line in seen:
            continue
        seen.add(line)
        results.append(line)
        if len(results) >= MAX_RESULTS:
            break
    return results


def execute(engine_id: str, query: str, *, runner: Callable[..., Any] = subprocess.run) -> dict[str, Any]:
    spec = _spec(engine_id)
    value = _validate(spec, query)
    if spec.mode != 'bounded':
        raise EngineError(f'{spec.title}: modo de tarefa longa requer fila e worker.')
    if not _enabled():
        raise EngineError('Execução desabilitada no servidor. Nenhuma consulta de terceiros foi realizada.')
    command = _argv(spec, value)
    # No shell; no inherited stdin. Temporary directory prevents writes to source tree.
    with tempfile.TemporaryDirectory(prefix='osint-engine-') as workdir:
        try:
            completed = runner(command, cwd=workdir, shell=False,
                               stdin=subprocess.DEVNULL, capture_output=True,
                               timeout=MAX_SECONDS, text=True, check=False,
                               env={**{k: v for k, v in os.environ.items() if k in {'PATH', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE', 'TMPDIR'}}, 'HOME': workdir})
        except subprocess.TimeoutExpired as exc:
            raise EngineError('O prazo limite do motor foi atingido; não há resultado confirmado.') from exc
        except (OSError, subprocess.SubprocessError) as exc:
            raise EngineError('O motor não pôde ser iniciado neste runtime.') from exc
    stdout = (completed.stdout or '')[:MAX_STDOUT]
    stderr = (completed.stderr or '')[:MAX_STDERR]
    results = _parse_lines(stdout, spec.input_kind)
    return {
        'engine': spec.id, 'query': value, 'status': 'completed' if completed.returncode == 0 else 'failed',
        'exit_code': completed.returncode, 'records': results,
        'stdout_excerpt': stdout, 'stderr_excerpt': stderr,
        'truncated': len(completed.stdout or '') > MAX_STDOUT,
        'source': spec.source, 'timestamp': datetime.now(timezone.utc).isoformat(),
        'warning': 'Resultados não verificados; usernames e subdomínios encontrados exigem confirmação independente.',
    }
