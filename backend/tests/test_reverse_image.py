"""Tests use mocked provider; no photographs transmitted to real services."""
import base64
import httpx
import pytest
from fastapi.testclient import TestClient
from protocolo_osint.reverse_image import ReverseImageError, _validate_image, search, availability
from fastapi import FastAPI
from protocolo_osint.image_routes import router
app = FastAPI()
app.include_router(router)

client = TestClient(app)
PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 48
B64 = base64.b64encode(PNG).decode()


def test_config_disabled_by_default(monkeypatch):
    monkeypatch.delenv('OSINT_REVERSE_ENABLED', raising=False)
    assert not availability()['configured']
    r=client.get('/api/v1/images/reverse/config')
    assert r.status_code == 200 and not r.json()['configured']
    assert 'GOOGLE_CLOUD_VISION_API_KEY' not in str(r.json())


def test_reject_without_runtime_and_secret(monkeypatch):
    monkeypatch.delenv('OSINT_REVERSE_ENABLED', raising=False)
    assert client.post('/api/v1/images/reverse',json={'mime_type':'image/png','content_base64':B64}).status_code == 503
    monkeypatch.setenv('OSINT_REVERSE_ENABLED','1')
    monkeypatch.setenv('GOOGLE_CLOUD_VISION_API_KEY','test-only-credential-xyz')
    monkeypatch.setenv('OSINT_REVERSE_TOKEN','test-token-longer-than-thirty-two-chars')
    assert client.post('/api/v1/images/reverse',headers={'Authorization':'Bearer wrong'},json={'mime_type':'image/png','content_base64':B64}).status_code == 401


@pytest.mark.parametrize('mime,data', [('image/png','@@@'),('text/html',B64),('image/jpeg',B64),('image/png',base64.b64encode(b'x' * 2_000_001).decode())],ids=['not-base64','wrong-mime','magic-mismatch','too-large'])
def test_reject_invalid_content(mime,data):
    with pytest.raises(ReverseImageError):
        _validate_image(data,mime)


def test_web_detection_parsing_and_fixed_destination(monkeypatch):
    monkeypatch.setenv('OSINT_REVERSE_ENABLED','1')
    monkeypatch.setenv('GOOGLE_CLOUD_VISION_API_KEY','test-only-credential-xyz')
    monkeypatch.setenv('OSINT_REVERSE_TOKEN','test-token-longer-than-thirty-two-chars')
    def respond(request):
        assert str(request.url)=='https://vision.googleapis.com/v1/images:annotate'
        assert request.headers['x-goog-api-key']=='test-only-credential-xyz'
        assert request.method=='POST'
        return httpx.Response(200,json={'responses':[{'webDetection':{
            'pagesWithMatchingImages':[{'url':'https://example.org/a'},{'url':'http://insecure.test'}],
            'visuallySimilarImages':[{'url':'https://example.org/other'}],
            'webEntities':[{'description':'arquitetura','score':0.81}]}}]})
    with httpx.Client(transport=httpx.MockTransport(respond)) as http:
        result=search(B64,'image/png',client=http)
    assert result['pages_with_matching_images']==['https://example.org/a']
    assert result['visually_similar_images']==['https://example.org/other']
    assert result['verified_identity'] is False


def test_http_reject_errors_and_bad_json(monkeypatch):
    monkeypatch.setenv('OSINT_REVERSE_ENABLED','1')
    monkeypatch.setenv('GOOGLE_CLOUD_VISION_API_KEY','test-only-credential-xyz')
    monkeypatch.setenv('OSINT_REVERSE_TOKEN','test-token-longer-than-thirty-two-chars')
    for response in (httpx.Response(403,json={'error':{}}),httpx.Response(200,text='not-json')):
        with httpx.Client(transport=httpx.MockTransport(lambda _: response)) as http:
            with pytest.raises(ReverseImageError):
                search(B64,'image/png',client=http)

def test_authorized_route_calls_one_provider_and_no_local_storage(monkeypatch):
    monkeypatch.setenv('OSINT_REVERSE_ENABLED','1')
    monkeypatch.setenv('GOOGLE_CLOUD_VISION_API_KEY','test-only-credential-xyz')
    monkeypatch.setenv('OSINT_REVERSE_TOKEN','test-token-longer-than-thirty-two-chars')
    from protocolo_osint import image_routes
    observed=[]
    def fake_search(content,mime):
        observed.append((content,mime))
        return {'provider':'test-provider','pages_with_matching_images':[],'verified_identity':False}
    monkeypatch.setattr(image_routes,'search',fake_search)
    r=client.post('/api/v1/images/reverse',headers={'Authorization':'Bearer test-token-longer-than-thirty-two-chars'},json={'mime_type':'image/png','content_base64':B64})
    assert r.status_code==200
    assert len(observed)==1
    assert r.json()['verified_identity'] is False
