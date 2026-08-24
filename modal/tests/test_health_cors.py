"""Health endpoint (no auth) and CORS envelope."""

from modal.api import ALLOWED_ORIGINS, VERSION


def test_health_ok_no_auth(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "version": VERSION}


def test_cors_headers_for_allowed_origin(client):
    origin = "https://raqam.pages.dev"
    assert origin in ALLOWED_ORIGINS
    r = client.get("/health", headers={"Origin": origin})
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == origin


def test_cors_preflight_allowed_origin(client):
    origin = "http://localhost:5173"
    r = client.options(
        "/digest",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert r.status_code in (200, 204)
    assert r.headers.get("access-control-allow-origin") == origin


def test_cors_absent_for_disallowed_origin(client):
    r = client.get("/health", headers={"Origin": "https://evil.example.com"})
    assert r.status_code == 200
    # Starlette only echoes the header back for allow-listed origins.
    assert r.headers.get("access-control-allow-origin") != "https://evil.example.com"
