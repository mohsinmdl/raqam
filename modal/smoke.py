"""Deploy-time smoke check for the DEPLOYED ``raqam-ai`` endpoint.

Run by the operator after ``modal deploy`` (not in CI, not under pytest):

    export RAQAM_AI_ENDPOINT=https://<workspace>--raqam-ai-api.modal.run
    export RAQAM_AI_TEST_TOKEN=<a valid Supabase session JWT>   # optional
    modal run modal/smoke.py

Prints a PASS/FAIL matrix over the live envelope:

    /health              → 200
    anon feature route   → 401
    garbage token        → 401
    authed feature route → 501   (until U1-U4 implement the routes)
    rate-limit probe     → 429   (fires >30 authed calls in a burst)

Authed checks are SKIPPED (not failed) when ``RAQAM_AI_TEST_TOKEN`` is unset.
The endpoint URL and token come from the environment so no secrets live here.
"""

import os

import httpx
import modal

app = modal.App("raqam-ai-smoke")

FEATURE_ROUTE = "/digest"  # any auth-gated feature route works for the matrix
RATE_LIMIT_BURST = 35  # > 30/min bucket → expect a 429 in the burst


def _print_row(name: str, ok: bool | None, detail: str) -> None:
    mark = "SKIP" if ok is None else ("PASS" if ok else "FAIL")
    print(f"  [{mark}] {name:<24} {detail}")


def _run_matrix(endpoint: str, token: str | None) -> bool:
    endpoint = endpoint.rstrip("/")
    all_ok = True
    print(f"raqam-ai smoke → {endpoint}\n")

    with httpx.Client(timeout=90.0) as client:
        # 1) /health → 200
        try:
            r = client.get(f"{endpoint}/health")
            ok = r.status_code == 200 and r.json().get("ok") is True
            _print_row("/health 200", ok, f"status={r.status_code} body={r.text[:80]}")
            all_ok &= ok
        except Exception as exc:  # noqa: BLE001
            _print_row("/health 200", False, f"error={exc}")
            all_ok = False

        # 2) anonymous feature route → 401
        try:
            r = client.post(f"{endpoint}{FEATURE_ROUTE}", json={})
            ok = r.status_code == 401
            _print_row("anon route 401", ok, f"status={r.status_code}")
            all_ok &= ok
        except Exception as exc:  # noqa: BLE001
            _print_row("anon route 401", False, f"error={exc}")
            all_ok = False

        # 3) garbage token → 401
        try:
            r = client.post(
                f"{endpoint}{FEATURE_ROUTE}",
                json={},
                headers={"Authorization": "Bearer not-a-real-token"},
            )
            ok = r.status_code == 401
            _print_row("garbage token 401", ok, f"status={r.status_code}")
            all_ok &= ok
        except Exception as exc:  # noqa: BLE001
            _print_row("garbage token 401", False, f"error={exc}")
            all_ok = False

        # 4) authed feature route → 501 (until U1-U4 land)
        if not token:
            _print_row("authed route 501", None, "RAQAM_AI_TEST_TOKEN unset")
            _print_row("rate-limit 429", None, "RAQAM_AI_TEST_TOKEN unset")
            return all_ok

        auth_headers = {"Authorization": f"Bearer {token}"}
        try:
            r = client.post(f"{endpoint}{FEATURE_ROUTE}", json={}, headers=auth_headers)
            ok = r.status_code == 501
            _print_row("authed route 501", ok, f"status={r.status_code} body={r.text[:80]}")
            all_ok &= ok
        except Exception as exc:  # noqa: BLE001
            _print_row("authed route 501", False, f"error={exc}")
            all_ok = False

        # 5) rate-limit probe → 429 somewhere in the burst
        statuses = []
        try:
            for _ in range(RATE_LIMIT_BURST):
                statuses.append(
                    client.post(f"{endpoint}{FEATURE_ROUTE}", json={}, headers=auth_headers).status_code
                )
            ok = 429 in statuses
            _print_row("rate-limit 429", ok, f"saw={sorted(set(statuses))}")
            all_ok &= ok
        except Exception as exc:  # noqa: BLE001
            _print_row("rate-limit 429", False, f"error={exc}")
            all_ok = False

    return all_ok


@app.local_entrypoint()
def main():
    endpoint = os.environ.get("RAQAM_AI_ENDPOINT")
    if not endpoint:
        raise SystemExit("Set RAQAM_AI_ENDPOINT to the deployed raqam-ai endpoint URL.")
    token = os.environ.get("RAQAM_AI_TEST_TOKEN")

    ok = _run_matrix(endpoint, token)
    print()
    if ok:
        print("SMOKE: PASS")
    else:
        raise SystemExit("SMOKE: FAIL")
