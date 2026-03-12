# AI Model Admin Redesign Contract Notes

## Contract Boundaries

- `AIModel.parameters_schema` remains a persisted runtime artifact during the migration window.
- Dict-shaped data remains the legacy editable format and must continue to load.
- List-shaped data is treated as compiled runtime output from the redesigned admin flow.
- Future normalized entities will become the primary source of truth beside `AIModel`, not by breaking old runtime consumers.
- Legacy dict-based seed payloads are compatibility input, not normalized source records.
