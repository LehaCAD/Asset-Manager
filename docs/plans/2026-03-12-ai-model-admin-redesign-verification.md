# AI Model Admin Redesign Verification

## Verified Commands

- `.\venv\Scripts\python.exe manage.py test apps.ai_providers.tests -v 2`
  - Result: PASS (`35 tests`)
- `.\venv\Scripts\python.exe manage.py test apps.credits.tests -v 2 --keepdb`
  - Result: PASS (`4 tests`)
- `.\venv\Scripts\python.exe manage.py test apps.scenes.test_api -v 2 --keepdb`
  - Result: PASS (`19 tests`)

## Runtime Spot Checks

- Compiled `parameters_schema` is returned by `AIModelSerializer` when `ModelParameterBinding` records exist.
- Credits estimation uses compiled pricing payload and placeholder-to-canonical binding resolution.
- `setup_kie_ai` seeds normalized records and backfills legacy JSON into compiled runtime artifacts.

## Environment Note

- In this environment, repeated Django test runs are stable when executed with `--keepdb` because the shared `test_apom_db` already exists.
- Without `--keepdb`, Django may attempt an interactive test DB reset that is not available in this terminal session.
