# CoachHelm Documentation Package

## What's Inside

This package contains everything you need to implement CoachHelm — an AI-powered coaching intelligence system for GolfHelm.

---

## File Overview

| File | Purpose |
|------|---------|
| **CURSOR_IMPLEMENTATION_GUIDE.md** | Start here! Step-by-step prompts for Cursor IDE |
| **COACHHELM_V2_INTELLIGENCE_ENGINE.md** | V2 brain specification (condensed overview) |
| **COACHHELM_V2_INTELLIGENCE_ENGINE_FULL.md** | Full V2 specification (3,400+ lines) |
| **COACHHELM_INTELLIGENCE_ENGINE.md** | Conceptual overview of how the brain works |
| **COACHHELM_DISABLE_FEATURE.md** | How to add enable/disable toggles for coaches & players |
| **FEATURE_ROUND_REVIEW.md** | Complete Round Review implementation spec |
| **FEATURE_1_COACH_PHILOSOPHY_SETTINGS.md** | Coach Philosophy Settings implementation spec |
| **coachhelm-master-blueprint.md** | Original master blueprint (overview of all features) |
| **COACHHELM_IMPLEMENTATION_SPEC.md** | Additional implementation details |

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
@coachhelm-docs/COACHHELM_V2_INTELLIGENCE_ENGINE_FULL.md
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

| Concept | Description |
|---------|-------------|
| **Support** | How often pattern conditions occur (min 10%) |
| **Confidence** | When conditions occur, how often outcome happens (min 60%) |
| **Lift** | How much more likely than random (min 1.5x) |
| **Conviction** | Strength of implication |
| **Calibration** | Ensuring stated confidence matches actual accuracy |
| **Abductive Reasoning** | Inferring most likely explanation from observations |
| **Cross-Learning** | Applying lessons from similar players |

---

## Files You'll Create

```
src/lib/coachhelm/v2/
├── index.ts
├── types.ts
├── orchestrator.ts
├── gate.ts                    # Enable/disable checks
├── features/
│   ├── temporal.ts
│   ├── sequence.ts
│   └── contextual.ts
├── mining/
│   ├── pattern-miner.ts
│   └── causal-engine.ts
├── prediction/
│   ├── performance-predictor.ts
│   └── trajectory-forecaster.ts
├── learning/
│   ├── behavior-learner.ts
│   ├── outcome-validator.ts
│   └── cross-learner.ts
├── reasoning/
│   ├── reasoning-engine.ts
│   └── confidence-calibrator.ts
└── nlg/
    └── insight-composer.ts

src/components/golf/coachhelm/
├── settings/
│   ├── CoachHelmToggle.tsx    # Enable/disable UI
│   └── ...
├── round-review/
└── v2/

src/hooks/coachhelm/
├── useCoachHelmSettings.ts
├── useCoachHelmGate.ts
├── useRoundReview.ts
└── ...

supabase/migrations/
├── 032_coachhelm_v2_intelligence.sql
└── 033_coachhelm_settings.sql
```

---

## Getting Started Checklist

- [ ] Read the master blueprint for overall vision
- [ ] Review the V2 Intelligence Engine spec
- [ ] Open CURSOR_IMPLEMENTATION_GUIDE.md in Cursor
- [ ] Start with Phase 1 (Database & Types)
- [ ] Work through each phase sequentially
- [ ] Add enable/disable feature
- [ ] Test with real data

Good luck! 🧠⛳
