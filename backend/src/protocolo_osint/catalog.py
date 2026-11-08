"""Curated source directory. Search links are constructed locally; no outbound requests.

This is *not* a vendored dataset or scraper. Entries require HTTPS and are
labelled as unverified external destinations, not confirmed API integrations.
"""
from __future__ import annotations
from urllib.parse import quote, urlsplit
from dataclasses import dataclass, asdict

@dataclass(frozen=True)
class Source:
    id: str
    name: str
    category: str
    description: str
    kinds: tuple[str, ...]
    template: str
    icon: str = "globe"
    access: str = "externo"

    def public(self):
        d=asdict(self); d.pop('template'); return d


SOURCES: tuple[Source, ...] = (
    Source('google','Google','Buscadores','Pesquisa geral na web',('free_text','username_candidate','email','domain','ip','url'), 'https://www.google.com/search?q={query}','search'),
    Source('bing','Bing','Buscadores','Motor de busca web',('free_text','username_candidate','email','domain','ip','url'),'https://www.bing.com/search?q={query}','search'),
    Source('duckduckgo','DuckDuckGo','Buscadores','Pesquisa geral',('free_text','username_candidate','email','domain','ip','url'),'https://duckduckgo.com/?q={query}','search'),
    Source('brave','Brave Search','Buscadores','Pesquisa web independente',('free_text','username_candidate','email','domain','ip','url'),'https://search.brave.com/search?q={query}','search'),
    Source('mojeek','Mojeek','Buscadores','Busca web alternativa',('free_text','username_candidate','email','domain'),'https://www.mojeek.com/search?q={query}','search'),
    Source('google-news','Google Notícias','Notícias','Pesquisas em notícias publicadas',('free_text','domain'),'https://news.google.com/search?q={query}','newspaper'),
    Source('archive','Wayback Machine','Arquivos','Histórico público de páginas e domínios',('url','domain'),'https://web.archive.org/web/*/{query}','archive'),
    Source('archive-today','Archive.today','Arquivos','Consultas a páginas arquivadas',('url','domain'),'https://archive.ph/search/?q={query}','archive'),
    Source('github','GitHub','Código','Busca pública de repositórios e código',('username_candidate','email','domain','free_text'),'https://github.com/search?q={query}&type=repositories','code'),
    Source('github-users','GitHub usuários','Identidades','Pesquisa de contas públicas',('username_candidate','free_text'),'https://github.com/search?q={query}&type=users','users'),
    Source('gitlab','GitLab','Código','Busca por projetos públicos',('free_text','username_candidate','domain'),'https://gitlab.com/search?search={query}','code'),
    Source('stackoverflow','Stack Overflow','Comunidades','Perguntas e perfis publicados',('free_text','username_candidate'),'https://stackoverflow.com/search?q={query}','message-circle'),
    Source('reddit','Reddit','Comunidades','Posts públicos e discussões',('free_text','username_candidate'),'https://www.reddit.com/search/?q={query}','message-circle'),
    Source('youtube','YouTube','Mídia','Busca de vídeos públicos',('free_text','username_candidate'),'https://www.youtube.com/results?search_query={query}','video'),
    Source('vimeo','Vimeo','Mídia','Busca de vídeos públicos',('free_text','username_candidate'),'https://vimeo.com/search?q={query}','video'),
    Source('flickr','Flickr','Imagens','Fotografias públicas',('free_text','username_candidate'),'https://www.flickr.com/search/?text={query}','image'),
    Source('openverse','Openverse','Imagens','Mídia com licenças abertas',('free_text',),'https://openverse.org/search/image?q={query}','image'),
    Source('google-images','Google Imagens','Imagens','Busca textual de imagens na web',('free_text','domain','username_candidate'),'https://www.google.com/search?tbm=isch&q={query}','image'),
    Source('linkedin','LinkedIn público','Redes sociais','Resultados indexados no LinkedIn',('free_text','username_candidate'),'https://www.google.com/search?q=site%3Alinkedin.com%2Fin%2F+{query}','users'),
    Source('instagram','Instagram público','Redes sociais','Perfis públicos indexados',('username_candidate','free_text'),'https://www.google.com/search?q=site%3Ainstagram.com+{query}','users'),
    Source('facebook','Facebook público','Redes sociais','Páginas públicas indexadas',('free_text','username_candidate'),'https://www.google.com/search?q=site%3Afacebook.com+{query}','users'),
    Source('x','X público','Redes sociais','Publicações públicas indexadas',('free_text','username_candidate'),'https://www.google.com/search?q=site%3Ax.com+{query}','users'),
    Source('crt','crt.sh','Infraestrutura','Certificados CT relacionados a domínios',('domain',),'https://crt.sh/?q=%25{query}','shield'),
    Source('rdap','RDAP.org','Infraestrutura','Registros RDAP de domínios',('domain',),'https://rdap.org/domain/{query}','network'),
    Source('rdap-ip','RDAP IP','Infraestrutura','Registros RDAP de IPs',('ip',),'https://rdap.org/ip/{query}','network'),
    Source('urlscan','urlscan.io','Infraestrutura','Resultados públicos associados ao domínio',('domain',),'https://urlscan.io/search/#domain:{query}','network'),
    Source('shodan','Shodan','Infraestrutura','Busca pública de ativos indexados',('ip','domain'),'https://www.shodan.io/search?query={query}','server'),
    Source('censys','Censys','Infraestrutura','Pesquisa pública de infraestrutura',('ip','domain'),'https://search.censys.io/search?resource=hosts&q={query}','server'),
    Source('virustotal','VirusTotal','Infraestrutura','Página de reputação pública',('domain','ip','url'),'https://www.virustotal.com/gui/search/{query}','shield'),
    Source('ipinfo','IPinfo','Infraestrutura','Informações públicas de endereços IP',('ip',),'https://ipinfo.io/{query}','map-pin'),
    Source('abuseipdb','AbuseIPDB','Infraestrutura','Registro de reputação de IP',('ip',),'https://www.abuseipdb.com/check/{query}','shield-alert'),
    Source('greynoise','GreyNoise','Infraestrutura','Contexto público sobre IPs',('ip',),'https://viz.greynoise.io/ip/{query}','shield'),
    Source('hunter','Hunter','E-mails','Pesquisa de domínio em provedor externo',('domain',),'https://hunter.io/search/{query}','mail'),
    Source('email-google','E-mail indexado','E-mails','Ocorrências públicas em motores de busca',('email',),'https://www.google.com/search?q=%22{query}%22','mail'),
    Source('username-google','Username indexado','Identidades','Ocorrências públicas do identificador',('username_candidate',),'https://www.google.com/search?q=%22{query}%22','at-sign'),
    Source('wikidata','Wikidata','Registros','Entidades públicas estruturadas',('free_text',),'https://www.wikidata.org/w/index.php?search={query}','database'),
    Source('openstreetmap','OpenStreetMap','Geográfico','Locais e informações geográficas públicas',('free_text',),'https://www.openstreetmap.org/search?query={query}','map'),
    Source('google-maps','Google Maps','Geográfico','Locais e estabelecimentos públicos',('free_text',),'https://www.google.com/maps/search/?api=1&query={query}','map'),
    Source('crossref','Crossref','Documentos','Literatura científica e metadados',('free_text',),'https://search.crossref.org/?q={query}','file-text'),
    Source('openalex','OpenAlex','Documentos','Pesquisa acadêmica aberta',('free_text',),'https://openalex.org/works?filter=default.search%3A{query}','file-text'),
    Source('google-pdf','Documentos PDF','Documentos','Arquivos PDF públicos indexados',('free_text','domain'),'https://www.google.com/search?q=filetype%3Apdf+{query}','file-text'),
)

def list_sources(kind: str|None = None, category: str|None = None, term: str|None = None):
    items = SOURCES
    if kind: items=tuple(x for x in items if kind in x.kinds)
    if category: items=tuple(x for x in items if x.category.casefold()==category.casefold())
    if term: items=tuple(x for x in items if term.casefold() in (x.name+' '+x.description+' '+x.category).casefold())
    return [x.public() for x in items]

def plan(query: str, kind: str, category: str|None=None):
    output=[]
    for source in SOURCES:
        if kind not in source.kinds or (category and source.category!=category): continue
        url=source.template.replace('{query}',quote(query.strip(),safe=''))
        parsed=urlsplit(url)
        if parsed.scheme!='https' or not parsed.hostname:
            continue
        output.append({**source.public(),'url':url,'verified':False})
    return output
