"""No external network requests in tests. Provider responses are controlled."""
import httpx
import pytest
from fastapi.testclient import TestClient

from protocolo_osint.live_lookup import LookupError, lookup
from protocolo_osint.hosted_api import app


def mocked_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler), trust_env=False)


def test_dns_three_fixed_requests_and_provenance():
    captured = []
    def handler(request):
        captured.append(str(request.url))
        assert request.url.host == 'cloudflare-dns.com'
        return httpx.Response(200, json={'Answer':[{'name':'example.org','type':1,'TTL':180,'data':'192.0.2.2'}]})
    with mocked_client(handler) as client:
        r=lookup('example.org','dns',client=client)
    assert len(captured)==3
    assert r['count']==3
    assert r['status']=='observed'
    assert r['source_url']=='https://cloudflare-dns.com/dns-query'
    assert r['verified'] is False


def test_github_profile_and_missing_user():
    def respond(request):
        assert request.url.host=='api.github.com'
        return httpx.Response(200,json={'login':'octocat','html_url':'https://github.com/octocat','public_repos':8,'type':'User'})
    with mocked_client(respond) as client:
        result=lookup('@octocat','github',client=client)
    assert result['items'][0]['login']=='octocat'
    with mocked_client(lambda request: httpx.Response(404)) as client:
        missing=lookup('notarealuser','github',client=client)
    assert missing['status']=='no_result' and missing['count']==0


def test_certificates_deduplicated_capped():
    with mocked_client(lambda request:httpx.Response(200,json=[{'name_value':'a.example.org','issuer_name':'CA'}]*3)) as client:
        result=lookup('example.org','certificates',client=client)
    assert result['count']==1


@pytest.mark.parametrize('query,provider', [('http://127.0.0.1','dns'),('192.168.0.1','dns'),('example.org;rm -rf /','certificates'),('--help','github')])
def test_invalid_inputs_rejected_without_network(query,provider):
    with pytest.raises(LookupError):
        lookup(query,provider)


def test_upstream_response_limit():
    with mocked_client(lambda _:httpx.Response(200,content=b'x'*270001)) as client:
        with pytest.raises(LookupError,match='limite'):
            lookup('example.org','certificates',client=client)


def test_public_api_separation_and_security():
    app_client=TestClient(app)
    assert app_client.get('/api/v1/health').json()['status']=='ok'
    assert app_client.get('/api/v1/lookup/providers').status_code==200
    assert app_client.get('/api/v1/cases').status_code==404
    assert app_client.post('/api/v1/cases',json={'title':'do not store'}).status_code==404
    engines=app_client.get('/api/v1/engines')
    assert engines.status_code==200
    assert len(engines.json()['engines'])==5
    assert all('runnable' in item for item in engines.json()['engines'])
    assert app_client.post('/api/v1/engines/run',json={'engine':'sherlock','value':'exampleuser'}).status_code==503
    assert app_client.post('/api/v1/search/plan',json={'value':'example.org'}).json()['external_requests']==0
    assert app_client.post('/api/v1/lookup',json={'value':'https://example.org','provider':'dns'}).status_code in (422,502)
    assert app_client.get('/api/v1/health').headers['x-content-type-options']=='nosniff'


def test_public_fullname_search_returns_only_bounded_candidate_profiles():
    seen = []
    def handler(request):
        seen.append(str(request.url))
        assert request.url.host == "api.github.com"
        assert request.url.path == "/search/users"
        assert '"Bruno Fraga" in:name type:user' == request.url.params["q"]
        assert request.url.params["per_page"] == "10"
        return httpx.Response(200, json={
            "total_count": 183, "incomplete_results": False,
            "items": [
                {"login": "example-public", "type": "User",
                 "html_url": "https://attacker.example/profile"}
            ],
        })
    with mocked_client(handler) as client:
        result = lookup("Bruno Fraga", "github_name", client=client)
    assert len(seen) == 1
    assert result["count"] == 1  # Not total_count=183.
    assert result["status"] == "observed"
    assert result["verified"] is False
    assert result["items"][0]["profile_url"] == "https://github.com/example-public"
    assert result["source_url"].startswith("https://github.com/search?")


@pytest.mark.parametrize("value", [
    "B; drop table", "foo OR bar", "name:admin test", "bruno@example.org",
    "a", "a b 123", "john && smith",
])
def test_fullname_query_rejects_search_syntax(value):
    with pytest.raises(LookupError):
        lookup(value, "github_name")


def test_incomplete_fullname_lookup_is_not_reported_as_zero():
    with mocked_client(lambda _: httpx.Response(200, json={
        "total_count": 5, "incomplete_results": True, "items": [],
    })) as client:
        with pytest.raises(LookupError, match="incompleta"):
            lookup("Bruno Fraga", "github_name", client=client)


def test_wikidata_search_records_are_bounded_and_linked_to_entities():
    seen = []
    def handler(request):
        seen.append(str(request.url))
        assert request.url.host == "www.wikidata.org"
        assert request.url.path == "/w/api.php"
        assert request.url.params["search"] == "Test Person"
        return httpx.Response(200, json={"search":[
            {"id": "Q123", "label": "Test Person", "description": "entity candidate"},
            {"id": "../unsafe", "label": "invalid identifier"},
        ]})
    with mocked_client(handler) as client:
        result = lookup("Test Person", "wikidata_entities", client=client)
    assert len(seen) == 1
    assert result["count"] == 1
    assert result["items"][0]["entity_url"] == "https://www.wikidata.org/wiki/Q123"
    assert result["verified"] is False


def test_openalex_author_results_do_not_claim_a_global_count():
    def handler(request):
        assert request.url.host == "api.openalex.org"
        assert request.url.path == "/authors"
        assert request.url.params["per_page"] == "10"
        return httpx.Response(200, json={
            "meta":{"count":120000},
            "results":[
                {"id":"https://openalex.org/A12345678",
                 "display_name":"Test Person","works_count":42},
                {"id":"http://attacker.example/A1","display_name":"Bad"},
            ]})
    with mocked_client(handler) as client:
        result = lookup("Test Person", "openalex_authors", client=client)
    assert result["count"] == 1
    assert result["items"][0]["author_url"] == "https://openalex.org/A12345678"
    assert result["verified"] is False


@pytest.mark.parametrize("provider", ["wikidata_entities", "openalex_authors"])
def test_invalid_person_names_are_rejected_before_public_requests(provider):
    with pytest.raises(LookupError):
        lookup("OR username:secret", provider)
