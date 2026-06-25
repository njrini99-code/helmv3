# Duplicate or Redundant Sections

V1 had many useful files but repeated similar thinking across tab specs, product architecture, workflow docs, AI docs, and build plans. This created the risk that a coding agent would read conflicting versions of the same concept.

## Redundancy types

1. **Navigation repeated in multiple places** — future tabs, tab specs, build plan, and UI files were not hard-reconciled.
2. **AI modules repeated as prompts, features, and architecture** — without one final product-layer model.
3. **Database tables repeated as architecture and feature-level wish lists** — without a migration sequence.
4. **Import templates repeated without a unified row lifecycle**.
5. **Feature specs repeated without a single priority decision**.

## V2 rule

Each major decision has one canonical home:

- Navigation: `07_tab_architecture_v2/`
- Data model: `08_data_model_v2/`
- Import system: `09_import_system_v2/`
- AI: `10_coachhelm_ai_v2/`
- Build order: `13_implementation_plan_v2/`
- Phase cutline: `12_phase_plan_v2/`
