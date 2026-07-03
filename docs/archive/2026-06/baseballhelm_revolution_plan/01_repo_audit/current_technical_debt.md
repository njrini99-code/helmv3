# Current Technical Debt

## Technical debt inventory

| Debt | Evidence | Risk | Fix |
|---|---|---|---|
| Recruiting-era logic in core dashboard | `baseball-dashboard.ts` uses watchlists and pipeline stages | Product confusion and wrong daily-use model | Move recruiting to later module; build team ops read models |
| Sidebar hardcodes product strategy | nav arrays by coach type and role | Difficult to scale modules/permissions | Replace with module registry + role permissions |
| Missing schema for academics | Academics page defaults fields not in DB | Misleading UI and data loss | Add academic tables or keep minimal status fields with privacy rules |
| Route inventory shows missing loading/error states | Existing report says many missing states | Poor perceived quality | Add route-level loading/error boundaries in Phase 1 |
| No first-class import system | Existing routes do not imply generic imports | Hard to support fragmented baseball stack | Build import center before advanced vendor parsing |
| AI not yet grounded | Dependencies/scripts but no clear product layer | Gimmick risk | Store AI briefs/flags with source references and confidence |

## Priority

Fix identity, permissions, imports, and command center first. Do not spend early cycles polishing recruiting workflows.
