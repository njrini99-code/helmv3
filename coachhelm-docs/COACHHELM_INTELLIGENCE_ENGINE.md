# CoachHelm Intelligence Engine

## How the Brain Works

---

## The Problem

Raw golf data is useless without context.

- A 2-stroke scoring increase might be catastrophic... or expected during a swing change.
- A 75 might be great for one player and terrible for another.
- Three-putts happen — but WHEN and WHY matters more than how many.

CoachHelm's job is to transform data into **contextual insight**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        COACHHELM INTELLIGENCE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│   │   CONTEXT   │    │  BENCHMARK  │    │   PATTERN   │                │
│   │   ENGINE    │    │   ENGINE    │    │   ENGINE    │                │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                │
│          │                  │                  │                        │
│          └──────────────────┼──────────────────┘                        │
│                             │                                           │
│                    ┌────────▼────────┐                                  │
│                    │    INFERENCE    │                                  │
│                    │     ENGINE      │                                  │
│                    └────────┬────────┘                                  │
│                             │                                           │
│          ┌──────────────────┼──────────────────┐                        │
│          │                  │                  │                        │
│   ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐                │
│   │   ALERT     │    │   FOCUS     │    │   INSIGHT   │                │
│   │  GENERATOR  │    │  CALCULATOR │    │  GENERATOR  │                │
│   └─────────────┘    └─────────────┘    └─────────────┘                │
│                                                                         │
│                    ┌────────────────┐                                   │
│                    │    LEARNING    │                                   │
│                    │     LOOP       │◄──── Feedback                     │
│                    └────────────────┘                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Components

1. **Context Engine** — "What's happening in this player's world?"
2. **Benchmark Engine** — "Compared to WHAT?"
3. **Pattern Engine** — "What keeps happening?"
4. **Inference Engine** — "What does this MEAN?"
5. **Learning Loop** — "How do we get better?"

---

## Full specification

See `COACHHELM_V2_INTELLIGENCE_ENGINE.md` for the complete V2 implementation with:
- Pattern mining algorithms
- Causal inference engine
- Predictive modeling
- Adaptive learning system
- Cross-player learning
- Confidence calibration
- Natural language generation

This file provides the conceptual overview. The V2 spec provides the implementation details.
