# AI Model Admin Workflow Verification

## Manual checklist

- Open Django admin for the Nano Banana `AIModel`.
- Confirm the page shows `Request Template`, `Parameter Mapping`, `Pricing`, `Compiled Preview`, and `Advanced Mode` in that order.
- Paste or edit the request schema and verify placeholder discovery updates the workflow context.
- Confirm the workflow highlights unresolved placeholders and keeps `prompt` and `callback_url` as system placeholders.
- Map unresolved placeholders through the workflow payload and verify `request_path` is auto-derived.
- Set pricing through `fixed` mode and confirm the compiled pricing preview updates.
- Set pricing through `bulk_json` mode and confirm lookup validation rejects unknown dimensions or values.
- Confirm `Advanced Mode` remains available as a fallback section rather than the primary editing path.

## Automated verification

- `python manage.py test apps.ai_providers.tests -v 2 --keepdb`
- `python manage.py test apps.credits.tests -v 2 --keepdb`
- `python manage.py test apps.scenes.test_api -v 2 --keepdb`
