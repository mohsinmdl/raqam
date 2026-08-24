# Contract fixtures

Canonical request/response examples for every `raqam-ai` route. These are the
**single contract source** shared by the Python service tests (`modal/tests`,
via pytest) and the client tests (`src/lib/ai.test.js`, via vitest json import),
so both sides can never silently drift. When a route's schema changes, update
its fixture here and both test suites move together.

Naming: `<route>.request.json` / `<route>.response.json`; `error.json` is the
shared error-body shape. `parse-receipt` has no request fixture (the request is
`multipart/form-data`, not JSON).
