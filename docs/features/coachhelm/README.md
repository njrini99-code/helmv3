# CoachHelm Documentation Package

## What's Inside

This package contains everything you need to implement CoachHelm — an AI-powered coaching intelligence system for GolfHelm.

---

## File Overview

| File | Purpose |
|------|---------|
| **CURSOR_IMPLEMENTATION_GUIDE.md** | Start here! Step-by-step prompts for Cursor IDE |
| **COACHHELM_V2_INTELLIGENCE_ENGINE.md** | Full V2 brain specification (pattern mining, predictions, learning) |
| **COACHHELM_INTELLIGENCE_ENGINE.md** | Conceptual overview of how the brain works |
| **COACHHELM_DISABLE_FEATURE.md** | How to add enable/disable toggles for coaches & players |
| **FEATURE_ROUND_REVIEW.md** | Complete Round Review implementation spec |
| **FEATURE_1_COACH_PHILOSOPHY_SETTINGS.md** | Coach Philosophy Settings implementation spec |
| **coachhelm-master-blueprint.md** | Original master blueprint (overview of all features) |

---

## Quick Start

### 1. Open Cursor in your project
```bash
cd /Users/ricknini/Downloads/helmv3
cursor .
```

### 2. Reference the docs
In Cursor, use `@` to reference files:
```
@coachhelm-docs/CURSOR_IMPLEMENTATION_GUIDE.md
@coachhelm-docs/COACHHELM_V2_INTELLIGENCE_ENGINE.md
```

### 3. Follow the phases
The Implementation Guide has **8 phases**:
1. Database & Types
2. Feature Extraction
3. Pattern Mining
4. Prediction Engine
5. Learning System
6. Reasoning & NLG
7. Orchestrator
8. UI Integration

### 4. Add the disable feature
After implementing the core system, add the enable/disable toggles from `COACHHELM_DISABLE_FEATURE.md`.

---

## Implementation Order

```
Phase 1-7: Core Intelligence
     │
     ▼
Feature Specs (Round Review, Philosophy Settings)
     │
     ▼
Disable Feature (let users opt out)
     │
     ▼
Testing & Polish
```

---

## Key Concepts

- **Pattern Mining**: Discovers non-obvious patterns from player data
- **Causal Engine**: Tests if correlations are actually causal
- **Prediction Engine**: Forecasts performance with confidence intervals
- **Learning Loop**: Improves from coach/player behavior
- **Cross-Learning**: Applies lessons from similar players
- **Confidence Calibration**: Ensures stated confidence matches accuracy

---

## Files You'll Create

```
src/lib/coachhelm/v2/
├── index.ts
├── types.ts
├── orchestrator.ts
├── gate.ts                    # Enable/disable checks
├── features/
├── mining/
├── prediction/
├── learning/
├── reasoning/
└── nlg/

src/components/golf/coachhelm/
├── settings/
│   ├── CoachHelmToggle.tsx    # Enable/disable UI
│   └── ...
├── round-review/
└── v2/

src/hooks/coachhelm/
├── useCoachHelmSettings.ts
├── useCoachHelmGate.ts
└── ...

supabase/migrations/
├── 032_coachhelm_v2_intelligence.sql
└── 033_coachhelm_settings.sql
```

---

## Need Help?

- Reference the original spec files for detailed implementations
- Each phase in the Implementation Guide has a complete copy-paste prompt
- The disable feature includes full code for the settings UI and gating logic

Good luck! 🧠⛳
