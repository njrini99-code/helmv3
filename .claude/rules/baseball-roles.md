---
paths:
  - "src/app/baseball/**"
  - "src/lib/baseball/**"
  - "src/components/baseball/**"
---

## Baseball Product: User Types & Roles

### Coach Types
| Type | Recruiting? | Team Mgmt? | Notes |
|------|-------------|------------|-------|
| **College** | Full suite | No | Primary recruiter |
| **High School** | No | Yes | Develops players, facilitates recruiting |
| **JUCO** | Toggle mode | Toggle mode | Recruit + prepare for transfer |
| **Showcase** | No | Multi-team | Manages travel ball orgs |

### Player Types
| Type | Recruiting? | Teams | Notes |
|------|-------------|-------|-------|
| **High School** | Opt-in activate | HS + optional Showcase | Primary recruiting target |
| **Showcase** | Opt-in activate | Showcase + optional HS | Travel ball |
| **JUCO** | Opt-in activate | JUCO only | Transfer recruiting |
| **College** | Never | College only | Team features only |

### Recruiting Activation Model
Players must **opt-in** to recruiting. Before activation: anonymous interest ("A D1 coach viewed your profile"). After: identified ("Coach Davis from Texas A&M viewed your profile"). College players cannot activate.

### Pipeline Stages (Baseball - only 5 valid)
```typescript
type PipelineStage = 'watchlist' | 'high_priority' | 'offer_extended' | 'committed' | 'uninterested';
```

---
