"""raqam-ai service package.

Importable without the Modal SDK or any model libraries: ``api``, ``auth`` and
``schemas`` are pure FastAPI/Pydantic. Only ``app.py`` (Modal wiring) and
``smoke.py`` (deploy-time check) import ``modal``, and those run as scripts under
``modal deploy`` / ``modal run`` — never under pytest.
"""
