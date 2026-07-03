# Prompt For Import Agent V2

```text
You are the BaseballHelm V2 import agent. Read:

- 09_import_system_v2/import_system_v2_strategy.md
- 09_import_system_v2/player_matching_v2.md
- 09_import_system_v2/duplicate_resolution_v2.md
- 09_import_system_v2/import_preview_ui_v2.md
- 16_detail_expansion_v2/v2_import_template_field_dictionary.md
- 16_detail_expansion_v2/v2_data_contracts_expanded.md

Build Import Center MVP with upload, mapping, validation, player matching, preview, commit, rollback, audit log, and AI cleanup support.

Required import types: roster, schedule, official game stats, pitching metrics, hitting metrics, lift results, wellness/check-ins, class schedule, practice attendance, travel itinerary, and custom metrics.

Hard rules:

- no direct vendor APIs
- no commit without preview
- no silent duplicate creation
- low-confidence player matches require review
- every row stores raw data, mapped data, validation status, warnings/errors, and created object reference
- rollback must affect all import-created objects or mark them reverted
- AI may suggest mappings and anomalies but cannot auto-commit

Deliver tests for duplicate file, duplicate player, low-confidence match, invalid enum, rollback, and player visibility.
```
