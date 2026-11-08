import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type DetectResponse = { kind: string; value: string; external_requests: number };
const kindLabels: Record<string, string> = {
  ip: 'Endereço IP', email: 'E-mail', url: 'URL', domain: 'Domínio',
  username_candidate: 'Possível nome de usuário', free_text: 'Texto de pesquisa',
};
const modules = [
  ['Pesquisa unificada', 'Detecta e prepara tipos de pesquisa', 'Ativo: identificação local'],
  ['Fontes OSINT', 'Catálogo de provedores e conectores', 'Planejado'],
  ['Imagens', 'OCR, hashes e comparação visual', 'Planejado'],
  ['Evidências', 'Casos, arquivos e cadeia de custódia', 'Planejado'],
  ['Grafos', 'Correlação com proveniência', 'Planejado'],
  ['MCP', 'Integrações controladas e auditáveis', 'Planejado'],
];

function App() {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<DetectResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setResult(null); setError(''); setLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/detect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }),
      });
      if (!response.ok) throw new Error(response.status === 422 ? 'Entrada inválida ou muito longa.' : 'Falha na API local.');
      setResult(await response.json() as DetectResponse);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha inesperada. Confirme que a API local está em execução.'); }
    finally { setLoading(false); }
  }
  return <div className="app">
    <aside className="sidebar"><div className="wordmark"><span className="mark">◎</span> PROTOCOLO <b>OSINT</b></div><p className="minor">COMMUNITY EDITION · V2</p><nav aria-label="Módulos"><a className="selected" href="#inicio">⌕ <span>Painel de pesquisa</span></a><a href="#modulos">▦ <span>Módulos</span></a><a href="#status">◷ <span>Status do projeto</span></a></nav><div className="sidebar-bottom">Ambiente local · Dados sob seu controle</div></aside>
    <main id="inicio" className="content"><header><span className="eyebrow">PLATAFORMA DE INVESTIGAÇÃO</span><span className="environment">● PRÉVIA PRIVADA</span></header>
      <section className="hero"><div className="hero-graphic" aria-hidden="true">⌕</div><p className="eyebrow">PROTOCOLO OSINT / V2</p><h1>Investigue com método.<br/><em>Trabalhe com evidências.</em></h1><p className="description">Fundação inicial de uma plataforma open source de pesquisa em fontes públicas. Nesta etapa, a identificação é local e nenhuma consulta externa é executada.</p>
        <form onSubmit={submit} className="search"><label htmlFor="search-term">Analisar termo de pesquisa</label><div className="input-row"><input id="search-term" value={value} onChange={e => setValue(e.target.value)} placeholder="Ex.: example.org, nome de usuário ou URL" maxLength={512} required/><button disabled={loading} type="submit">{loading ? 'Analisando...' : 'Identificar ↗'}</button></div></form>
        {error && <div role="alert" className="notice error">{error}</div>}
        {result && <div className="notice success"><b>{kindLabels[result.kind] ?? result.kind}</b><span>Termo: {result.value}</span><small>Nenhuma consulta externa foi realizada.</small></div>}
      </section>
      <section id="modulos"><div className="section-title"><div><span className="eyebrow">ARQUITETURA MODULAR</span><h2>Capacidades da plataforma</h2></div><span className="status">Fundação v0.1</span></div><div className="tiles">{modules.map(([name, description, status]) => <article className="tile" key={name}><span className="tile-icon" aria-hidden="true">◈</span><h3>{name}</h3><p>{description}</p><small>{status}</small></article>)}</div></section>
      <footer id="status">Protocolo OSINT V2 · Protótipo inicial, não validado para uso investigativo operacional.</footer>
    </main></div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
