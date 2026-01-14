# 🧠 Feature Maestro - GENIUS EDITION

**Codename:** MAESTRO-GENIUS-001  
**Evolution:** Elite → Genius  
**New Capabilities:** Production Learning, Auto-Fix, Visual Testing, AI Understanding, Predictive Detection, Journey Testing, Self-Improvement

---

## 🎯 GENIUS-LEVEL CAPABILITIES

### 1. 📊 Production Data Learning

**Connects to:**
- **Sentry** - Real errors from production
- **Google Analytics / Mixpanel** - User behavior patterns
- **Support Tickets** - Common complaints
- **Performance Monitoring** - Actual speed metrics

**How It Works:**

```typescript
interface ProductionIntelligence {
  sentry_analysis: {
    query: "Last 30 days of errors",
    findings: [
      {
        error: "Network timeout on team creation",
        occurrences: 45,
        affected_users: 23,
        pattern: "Happens on slow connections",
        priority: "P0 - High user impact",
        test_scenario: "Throttle network to 3G, create team"
      },
      {
        error: "golf_teams_name_coach_id_key constraint violation",
        occurrences: 23,
        pattern: "Duplicate team name",
        priority: "P0 - Confusing UX",
        test_scenario: "Create team with existing name"
      }
    ],
    action: "Focus audit on top 5 errors by occurrence"
  },
  
  analytics_insights: {
    query: "Feature usage & drop-off rates",
    findings: [
      {
        feature: "Team creation form",
        started: 1247,
        completed: 162,
        completion_rate: "13% (CRITICAL)",
        drop_off_point: "Division selection dropdown",
        priority: "P0 - Major funnel leak",
        test_scenario: "Validate form UX, check for confusion"
      },
      {
        feature: "Delete team",
        usage: "3% of users",
        priority: "P2 - Low usage",
        action: "Don't over-invest in this feature"
      }
    ]
  },
  
  support_patterns: {
    query: "Support tickets mentioning feature",
    findings: [
      {
        complaint: "How do I add players to team?",
        count: 34,
        pattern: "UI not obvious",
        priority: "P1 - UX clarity issue",
        test_scenario: "Validate discoverability of 'Add Player' button"
      }
    ]
  },
  
  performance_data: {
    query: "Real-world performance metrics",
    findings: [
      {
        endpoint: "GET /api/teams",
        p50: "120ms",
        p95: "2300ms (SLOW)",
        p99: "4500ms (VERY SLOW)",
        pattern: "Coaches with 100+ teams experience slowness",
        priority: "P1 - Performance issue at scale",
        test_scenario: "Test with 200+ teams"
      }
    ]
  }
}

// USAGE IN AUDIT:
// 1. Query production systems BEFORE testing
// 2. Prioritize tests based on ACTUAL user pain
// 3. Focus on high-impact issues
// 4. Skip theoretical edge cases that never happen
```

**Setup Required:**
- Sentry API key
- Google Analytics API access
- Support system API (Zendesk, Intercom, etc)
- Performance monitoring (Datadog, New Relic, or Vercel Analytics)

**Result:**
- Tests are informed by REALITY, not guesses
- Finds issues users actually hit
- Prioritizes by real impact

---

### 2. 🤖 Auto-Fix Code Generation

**Generates actual fixes, not just recommendations.**

```typescript
interface AutoFixCapabilities {
  // TIER 1: Simple Auto-Fixes (fully automated)
  simple_fixes: [
    {
      issue_type: "Missing empty state",
      auto_action: "Generate EmptyState component",
      code_generation: `
        // Generated: src/app/golf/teams/EmptyRosterState.tsx
        export function EmptyRosterState() {
          return (
            <EmptyState
              icon={UsersIcon}
              title="No players yet"
              description="Add players to build your roster"
              action={<Button>Add First Player</Button>}
            />
          );
        }
        
        // Auto-updated: src/app/golf/teams/[teamId]/page.tsx
        {roster.length === 0 ? (
          <EmptyRosterState />
        ) : (
          <RosterTable players={roster} />
        )}
      `,
      test_generation: `
        // Generated: src/app/golf/teams/__tests__/EmptyRosterState.test.tsx
        it('shows empty state when no players', () => {
          render(<EmptyRosterState />);
          expect(screen.getByText('No players yet')).toBeInTheDocument();
        });
      `
    },
    
    {
      issue_type: "Missing loading skeleton",
      auto_action: "Generate skeleton component",
      code_generation: `
        // Generated: src/app/golf/teams/TeamDetailSkeleton.tsx
        export function TeamDetailSkeleton() {
          return (
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-64 w-full" />
            </div>
          );
        }
        
        // Auto-updated: src/app/golf/teams/[teamId]/page.tsx
        {isLoading ? (
          <TeamDetailSkeleton />
        ) : (
          <TeamDetail team={team} />
        )}
      `
    },
    
    {
      issue_type: "Poor error message",
      auto_action: "Add friendly error handling",
      code_generation: `
        // Auto-updated: src/app/golf/teams/actions.ts
        
        // BEFORE:
        await supabase.from('golf_teams').insert(team);
        
        // AFTER:
        const { error } = await supabase.from('golf_teams').insert(team);
        if (error) {
          if (error.code === '23505') { // Unique constraint
            return { error: "You already have a team with this name" };
          }
          return { error: "Failed to create team. Please try again." };
        }
      `
    },
    
    {
      issue_type: "Missing duplicate check",
      auto_action: "Add pre-check before insert",
      code_generation: `
        // Auto-updated: src/app/golf/teams/actions.ts
        
        export async function createTeam(data: TeamFormData) {
          // Auto-generated duplicate check
          const { data: existing } = await supabase
            .from('golf_teams')
            .select('id')
            .eq('name', data.name)
            .eq('coach_id', userId)
            .single();
          
          if (existing) {
            return { 
              error: "You already have a team named '" + data.name + "'" 
            };
          }
          
          // Proceed with creation
          const { data: team } = await supabase
            .from('golf_teams')
            .insert(data);
            
          return { team };
        }
      `
    }
  ],
  
  // TIER 2: Complex Fixes (generate code, human review required)
  complex_fixes: [
    {
      issue_type: "Cascade delete protection",
      auto_action: "Generate dialog + cascade logic",
      code_generation: `
        // Generated: src/app/golf/teams/DeleteTeamDialog.tsx
        // (full component code with player count check, options)
        
        // Generated: src/app/golf/teams/actions.ts (cascade function)
        // (full cascade delete logic with options)
      `,
      review_required: true,
      reason: "Complex business logic, needs human validation"
    },
    
    {
      issue_type: "Add pagination",
      auto_action: "Generate paginated query + UI",
      code_generation: `
        // Generated pagination logic
        // Generated PageNav component
        // Updated queries with LIMIT/OFFSET
      `,
      review_required: true,
      reason: "Impacts multiple files and UX"
    }
  ],
  
  // TIER 3: Migrations (database changes)
  migrations: [
    {
      issue_type: "Missing unique constraint",
      auto_action: "Generate migration SQL",
      code_generation: `
        -- Generated: supabase/migrations/20240110_add_team_name_unique.sql
        
        -- Add unique constraint on (name, coach_id)
        ALTER TABLE golf_teams
        ADD CONSTRAINT golf_teams_name_coach_id_unique 
        UNIQUE (name, coach_id);
      `,
      review_required: true,
      reason: "Database schema change, test thoroughly"
    }
  ]
}

// WORKFLOW:
// 1. Feature Maestro identifies issue
// 2. Checks if issue is auto-fixable
// 3. Generates code for fix
// 4. Creates files in .production-team/AUTO_FIXES/
// 5. You review and apply (or agent applies simple ones automatically)
```

**Output Structure:**
```
.production-team/AUTO_FIXES/ROUND_01/
├── APPLY_AUTOMATICALLY/ (safe, simple fixes)
│   ├── add_empty_roster_state.tsx
│   ├── add_duplicate_check.ts
│   └── improve_error_messages.ts
│
├── REVIEW_REQUIRED/ (complex, needs validation)
│   ├── add_cascade_delete_protection/
│   │   ├── DeleteTeamDialog.tsx
│   │   ├── actions.ts
│   │   └── EXPLANATION.md
│   └── add_pagination/
│       ├── PaginatedTeamList.tsx
│       └── queries.ts
│
└── MIGRATIONS/ (database changes)
    └── 20240110_add_unique_constraint.sql
```

**Result:**
- 50%+ of issues fixed automatically
- Complex fixes get full code generated
- You just review & apply, don't write from scratch

---

### 3. 📸 Visual Regression Testing

**Takes screenshots, compares to baseline, catches visual bugs.**

```typescript
interface VisualTesting {
  // Capture screenshots of every page/state
  screenshot_matrix: {
    routes: [
      {
        path: "/golf/teams",
        states: [
          "empty (no teams)",
          "with 5 teams",
          "with 100 teams",
          "loading state",
          "error state"
        ]
      },
      {
        path: "/golf/teams/[id]",
        states: [
          "team with players",
          "team empty roster",
          "loading skeleton",
          "not found error"
        ]
      }
    ],
    
    viewports: [
      { name: "desktop", width: 1920, height: 1080 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobile", width: 375, height: 667 }
    ],
    
    browsers: ["chrome", "safari", "firefox"],
    
    total_screenshots: "5 routes × 4 states × 3 viewports × 3 browsers = 180 screenshots"
  },
  
  // Compare to baseline
  regression_detection: {
    baseline: ".production-team/visual-baseline/ROUND_01/",
    current: ".production-team/visual-testing/ROUND_02/",
    
    differences_found: [
      {
        screenshot: "teams-list-desktop-chrome.png",
        diff_percentage: "15%",
        changed_areas: [
          "Team card button moved 20px down",
          "Kelly green color changed to different shade",
          "Glassmorphism blur reduced"
        ],
        severity: "HIGH - Design regression",
        before_after_images: "side-by-side comparison",
        action: "Review if intentional or bug"
      },
      {
        screenshot: "teams-list-mobile-safari.png",
        diff_percentage: "2%",
        changed_areas: ["Font rendered slightly differently"],
        severity: "LOW - Browser rendering difference",
        action: "Acceptable difference"
      }
    ]
  },
  
  // Accessibility visual checks
  accessibility_visual: {
    contrast_checker: {
      finds: "All text on page",
      measures: "Contrast ratio against background",
      flags: "Text with contrast < 4.5:1",
      example: "Player name text: 3.2:1 (FAIL WCAG AA)"
    },
    
    touch_target_size: {
      finds: "All interactive elements",
      measures: "Width and height",
      flags: "Buttons < 44×44px on mobile",
      example: "Delete icon: 32×32px (TOO SMALL)"
    },
    
    focus_indicators: {
      simulates: "Tab through all focusable elements",
      captures: "Screenshot of each focus state",
      flags: "Elements with no visible focus ring",
      example: "Team edit button: No focus indicator visible"
    }
  },
  
  // Layout validation
  layout_checks: {
    responsive_breakpoints: [
      "Check all breakpoints (375px, 768px, 1024px, 1440px, 1920px)",
      "Flag: Horizontal scroll appears",
      "Flag: Text overflow/truncation",
      "Flag: Overlapping elements",
      "Flag: Broken grid layouts"
    ],
    
    cross_browser: [
      "Compare Chrome vs Safari vs Firefox",
      "Flag: Layout shifts between browsers",
      "Flag: Missing/broken styles in specific browser"
    ]
  }
}

// WORKFLOW:
// 1. First audit: Capture baseline screenshots (180 images)
// 2. Second audit: Capture new screenshots, compare to baseline
// 3. Generate visual diff report with highlighted changes
// 4. Flag regressions (unintentional changes)
// 5. Update baseline after intentional changes approved
```

**Tools Used:**
- Playwright (screenshot capture)
- Pixelmatch (image diffing)
- Puppeteer (browser automation)

**Output:**
```
.production-team/VISUAL_TESTING/ROUND_02/
├── screenshots/
│   ├── baseline/ (from round 1)
│   ├── current/ (from round 2)
│   └── diffs/ (highlighted differences)
│
├── REGRESSION_REPORT.md
│   ├── High severity changes (15)
│   ├── Medium severity changes (8)
│   └── Low severity changes (23)
│
└── accessibility_issues/
    ├── low_contrast.png (12 instances)
    ├── small_touch_targets.png (5 instances)
    └── missing_focus_indicators.png (18 instances)
```

**Result:**
- Never ship broken UI
- Catch design regressions automatically
- Validate accessibility visually
- Test across browsers/devices without manual QA

---

### 4. 🧠 AI-Powered Code Understanding

**Uses embeddings and semantic analysis to deeply understand code.**

```typescript
interface AICodeUnderstanding {
  // Semantic code analysis
  semantic_understanding: {
    what_it_does: "Understand code intent, not just syntax",
    
    example: {
      code: `
        const teams = await supabase
          .from('golf_teams')
          .select('*')
          .eq('coach_id', userId);
      `,
      
      traditional_analysis: "Queries golf_teams table with coach_id filter",
      
      ai_understanding: {
        intent: "Fetching all teams belonging to the authenticated coach",
        pattern: "Owner-based data filtering",
        security: "Relies on RLS + userId check (good)",
        potential_issues: [
          "No pagination - could be slow for coaches with 100+ teams",
          "SELECT * - fetches all columns when might only need subset",
          "No error handling - undefined behavior if query fails"
        ],
        similar_code: [
          "src/app/baseball/recruiting/queries.ts:45 (same pattern)",
          "src/app/golf/rounds/queries.ts:23 (same pattern)"
        ],
        recommendation: "Extract to shared utility function to maintain consistency"
      }
    }
  },
  
  // Cross-feature pattern detection
  pattern_detection: {
    finds: "Similar code across Golf and Baseball features",
    
    example: {
      golf_code: "src/app/golf/teams/actions.ts (createTeam)",
      baseball_code: "src/app/baseball/recruiting/actions.ts (createPipeline)",
      
      similarity: "95% similar structure",
      
      differences_found: [
        "Golf: Validates team name length",
        "Baseball: No team name validation",
        "Golf: Shows toast notification on success",
        "Baseball: No success notification",
        "Golf: Redirects to team detail page",
        "Baseball: Stays on same page"
      ],
      
      recommendation: [
        "Inconsistent UX patterns between platforms",
        "Extract shared createEntity() utility",
        "Standardize validation approach",
        "Standardize success feedback"
      ]
    }
  },
  
  // Copy-paste bug detection
  copy_paste_detection: {
    finds: "Code blocks that look identical but shouldn't be",
    
    example: {
      file1: "src/app/golf/teams/DeleteDialog.tsx",
      file2: "src/app/baseball/players/DeleteDialog.tsx",
      
      copied_code: "handleDelete function (identical)",
      
      bug_detected: {
        issue: "Both call 'golf_teams' table, baseball should call 'baseball_players'",
        evidence: "Table name copy-pasted incorrectly",
        severity: "CRITICAL - Delete button deletes wrong data",
        how_found: "Semantic analysis caught table name mismatch with feature context"
      }
    }
  },
  
  // Intent vs implementation gap
  intent_gap_detection: {
    what_it_does: "Compares function names/comments to actual behavior",
    
    example: {
      function_name: "deleteTeamAndPlayers",
      
      comment: "// Deletes team and removes all associated players",
      
      actual_code: `
        async function deleteTeamAndPlayers(teamId: string) {
          await supabase.from('golf_teams').delete().eq('id', teamId);
          // No player deletion!
        }
      `,
      
      gap_detected: {
        intent: "Delete team AND players",
        reality: "Only deletes team",
        severity: "HIGH - Function doesn't match its promise",
        recommendation: "Either fix implementation or rename function"
      }
    }
  },
  
  // Complexity analysis
  complexity_scoring: {
    analyzes: "Cognitive complexity of functions",
    
    example: {
      function: "createTeamWithValidation",
      lines: 180,
      cyclomatic_complexity: 23,
      cognitive_complexity: 45,
      
      assessment: "VERY COMPLEX - hard to understand and maintain",
      
      refactoring_suggestion: {
        extract: [
          "validateTeamData() - 30 lines",
          "checkDuplicateName() - 15 lines",
          "checkCoachPermissions() - 20 lines",
          "saveTeamToDatabase() - 25 lines",
          "sendNotifications() - 15 lines"
        ],
        result: "Main function becomes 5 lines, each helper is simple"
      }
    }
  }
}

// USAGE:
// 1. Embed all code files (vector embeddings)
// 2. Find similar code across codebase
// 3. Detect copy-paste bugs
// 4. Flag intent/implementation gaps
// 5. Suggest refactoring for complex code
```

**Result:**
- Find bugs that code review misses
- Detect inconsistencies across features
- Understand code intent, not just syntax
- Catch copy-paste bugs automatically

---

### 5. 🔮 Predictive Issue Detection

**Learns patterns and predicts bugs before they happen.**

```typescript
interface PredictiveDetection {
  // Pattern learning from history
  historical_patterns: {
    learns_from: [
      "Past audit findings",
      "Fixed bugs",
      "Repeated issues"
    ],
    
    patterns_learned: [
      {
        pattern: "When we add CREATE feature, we forget to add DELETE",
        confidence: "95% (observed 20/21 times)",
        prediction: {
          feature: "Tournament bracket creation just added",
          missing: "Tournament bracket deletion",
          recommended_action: "Add delete functionality now"
        }
      },
      
      {
        pattern: "New list views always missing pagination initially",
        confidence: "88% (observed 15/17 times)",
        prediction: {
          feature: "Recent recruits list added",
          missing: "Pagination for large lists",
          recommended_action: "Add pagination before 100+ items accumulate"
        }
      },
      
      {
        pattern: "Every create form missing duplicate check first time",
        confidence: "100% (observed 12/12 times)",
        prediction: {
          feature: "Create tournament form just added",
          missing: "Duplicate tournament name check",
          recommended_action: "Add duplicate check immediately"
        }
      },
      
      {
        pattern: "Empty states always forgotten in first implementation",
        confidence: "92% (observed 23/25 times)",
        prediction: {
          feature: "Player statistics table just added",
          missing: "Empty state when player has no stats",
          recommended_action: "Add empty state component"
        }
      }
    ]
  },
  
  // Co-occurrence detection
  bug_correlation: {
    learns: "When bug X exists, bug Y usually does too",
    
    correlations: [
      {
        if_found: "Missing loading state",
        then_likely: "Missing error state (89% correlation)",
        action: "Check for error state when finding missing loading state"
      },
      
      {
        if_found: "No duplicate check on create",
        then_likely: "Poor error message on DB constraint (100% correlation)",
        action: "Check error handling when finding missing validation"
      },
      
      {
        if_found: "Cascade delete issue",
        then_likely: "Missing referential integrity elsewhere (75% correlation)",
        action: "Audit all foreign key relationships when finding cascade issues"
      }
    ]
  },
  
  // Risk scoring for new features
  risk_prediction: {
    assesses: "Likelihood of bugs in new/changed code",
    
    risk_factors: [
      {
        factor: "Feature complexity",
        weight: 0.3,
        score_method: "Lines of code + cyclomatic complexity"
      },
      {
        factor: "Developer experience",
        weight: 0.2,
        score_method: "Track record with similar features"
      },
      {
        factor: "Code churn",
        weight: 0.15,
        score_method: "Frequency of changes to same files"
      },
      {
        factor: "Similar feature bugs",
        weight: 0.35,
        score_method: "Bug count in similar features"
      }
    ],
    
    example_prediction: {
      feature: "Tournament bracket system (just added)",
      risk_score: "87/100 (VERY HIGH)",
      reasoning: [
        "High complexity (500+ lines, nested state)",
        "Similar feature (round scoring) had 12 bugs",
        "First time implementing bracket logic",
        "High code churn (modified 15 times already)"
      ],
      recommended_actions: [
        "Extra thorough testing required",
        "Code review by senior dev",
        "Add comprehensive unit tests",
        "Consider pair programming for complex logic"
      ]
    }
  },
  
  // Temporal prediction
  when_will_break: {
    predicts: "When feature will break as data grows",
    
    example: {
      feature: "Team roster table",
      current_state: "Works fine with 10-20 players",
      
      prediction: {
        breaks_at: "~80 players per team",
        reason: "No pagination, renders all rows",
        confidence: "HIGH - performance degrades linearly",
        evidence: "Load time: 10 players=50ms, 20 players=100ms, pattern suggests 80 players=400ms+",
        recommendation: "Add pagination before typical team size reaches 80",
        estimated_time_until_break: "3 months (based on player growth rate)"
      }
    }
  }
}

// USAGE:
// 1. Analyze historical audit data
// 2. Learn "when we do X, we always forget Y"
// 3. Predict missing features before testing
// 4. Score risk of new code
// 5. Warn about future scaling issues
```

**Memory Required:**
```json
{
  "pattern_library": {
    "create_form_missing_duplicate_check": {
      "observed": 12,
      "total": 12,
      "confidence": 1.0,
      "prediction": "Always add duplicate check to new create forms"
    }
  }
}
```

**Result:**
- Catch bugs before they happen
- Learn from your own history
- Predict when code will break
- Focus testing on high-risk areas

---

### 6. 🛤️ User Journey Testing

**Tests complete end-to-end user flows, not isolated features.**

```typescript
interface JourneyTesting {
  // Define critical user journeys
  journeys: [
    {
      journey_name: "Coach creates team and adds players",
      user_role: "Golf coach",
      
      steps: [
        {
          step: 1,
          action: "Navigate to /golf/teams",
          expected: "See teams list or empty state",
          validate: ["Page loads < 1s", "UI renders correctly"]
        },
        {
          step: 2,
          action: "Click 'Create Team' button",
          expected: "Navigate to /golf/teams/create",
          validate: ["Form appears", "All fields present"]
        },
        {
          step: 3,
          action: "Fill form: name='Varsity Golf', division='varsity', season='2024'",
          expected: "Form accepts input",
          validate: ["No validation errors", "Fields populate"]
        },
        {
          step: 4,
          action: "Submit form",
          expected: "Team created, redirect to team page",
          validate: [
            "Loading spinner appears",
            "Success message shows",
            "Redirect happens < 2s",
            "Team appears in database"
          ],
          measure: {
            time_to_complete: "Target: < 3s",
            actual: "4.2s (SLOW)",
            bottleneck: "Database insert taking 2.1s"
          }
        },
        {
          step: 5,
          action: "Click 'Add Player' button",
          expected: "Player form appears",
          validate: ["Form renders", "Team pre-selected"]
        },
        {
          step: 6,
          action: "Add 10 players sequentially",
          expected: "Each player added successfully",
          validate: [
            "No errors on any player",
            "Players appear in roster immediately",
            "Performance doesn't degrade"
          ],
          measure: {
            time_per_player: "Target: < 1s",
            actual: "1.8s average (SLOW)",
            gets_slower: "Yes - 1.2s for first, 2.5s for 10th",
            issue: "N+1 query problem or cache issue"
          }
        },
        {
          step: 7,
          action: "Navigate back to teams list",
          expected: "New team appears in list with player count",
          validate: [
            "Team visible",
            "Shows '10 players'",
            "List loads < 1s"
          ]
        }
      ],
      
      journey_metrics: {
        total_time: "32.4s",
        target_time: "< 20s",
        status: "FAILED - 62% slower than target",
        
        friction_points: [
          "Step 4: Team creation slow (4.2s vs 3s target)",
          "Step 6: Adding players gets slower (N+1 issue)",
          "Overall: Too many round trips to server"
        ],
        
        recommendations: [
          "Optimize team creation query",
          "Fix N+1 query when adding players",
          "Consider bulk player import feature"
        ]
      }
    },
    
    {
      journey_name: "Player views their team and statistics",
      user_role: "Golf player",
      steps: [...],
      journey_metrics: {...}
    },
    
    {
      journey_name: "Coach creates round and enters scores",
      user_role: "Golf coach",
      steps: [...],
      journey_metrics: {...}
    }
  ],
  
  // Cross-feature integration testing
  integration_validation: {
    what_it_tests: "Features working together correctly",
    
    scenarios: [
      {
        scenario: "Delete team cascades to players and rounds",
        setup: [
          "Create team",
          "Add 10 players",
          "Create 3 rounds with scores",
          "Delete team"
        ],
        expected: "All related data handled correctly",
        validate: [
          "Confirm dialog shows player/round counts",
          "User chooses cascade option",
          "Players removed or orphaned correctly",
          "Rounds archived or deleted",
          "No foreign key violations"
        ]
      }
    ]
  },
  
  // Performance through journey
  journey_performance: {
    tracks: "Cumulative performance through entire flow",
    
    metrics: [
      "Total journey time",
      "Time per step",
      "Server requests made",
      "Data transferred",
      "Memory usage growth",
      "Performance degradation over journey"
    ],
    
    example: {
      journey: "Create team + 10 players",
      total_requests: 23,
      total_data: "450KB",
      total_time: "32.4s",
      
      optimization_opportunities: [
        "12 requests could be batched into 3",
        "150KB of duplicate data transferred",
        "Could reduce to 15s with optimizations"
      ]
    }
  }
}

// EXECUTION:
// 1. Define critical user journeys
// 2. Automate each journey with Playwright
// 3. Measure time, performance, friction
// 4. Validate data integrity after journey
// 5. Flag slow steps and integration issues
```

**Output:**
```markdown
# User Journey Test Results

## Journey: Coach creates team and adds players
**Status:** ❌ FAILED  
**Time:** 32.4s (target: < 20s)  
**Completion Rate:** 100%  
**User Satisfaction:** POOR (too slow)

### Step-by-Step Results:
1. Navigate to teams ✅ (0.8s)
2. Click create button ✅ (0.1s)
3. Fill form ✅ (user-dependent)
4. Submit team ⚠️ (4.2s - SLOW)
5. Add player button ✅ (0.2s)
6. Add 10 players ❌ (18.4s - VERY SLOW, N+1 issue)
7. View team list ✅ (0.9s)

### Friction Points:
- Team creation: 4.2s (1.2s too slow)
- Adding players: Gets slower each time (N+1 query)
- Overall: 62% slower than target

### Recommendations:
1. P0: Fix N+1 query in player creation
2. P1: Optimize team creation query
3. P2: Consider bulk player import
```

**Result:**
- Test real user workflows end-to-end
- Find integration issues between features
- Measure actual user experience time
- Discover performance issues in context

---

### 7. 📈 Self-Improvement Loop

**Gets smarter with every audit by tracking what matters.**

```typescript
interface SelfImprovement {
  // Track which findings you actually fix
  finding_effectiveness: {
    tracks: [
      "Which issues got fixed immediately",
      "Which issues got ignored",
      "Which issues were false positives",
      "Which issues found real bugs"
    ],
    
    learns: {
      high_value_findings: [
        {
          finding_type: "Cascade delete issues",
          reported: 5,
          fixed: 5,
          found_real_bugs: 5,
          effectiveness_score: "100% - ALWAYS FIX THESE"
        },
        {
          finding_type: "Missing empty states",
          reported: 12,
          fixed: 11,
          found_real_bugs: 11,
          effectiveness_score: "92% - HIGH VALUE"
        }
      ],
      
      low_value_findings: [
        {
          finding_type: "Theoretical concurrency issues",
          reported: 8,
          fixed: 1,
          found_real_bugs: 0,
          effectiveness_score: "12% - STOP REPORTING THESE",
          action: "Reduce priority or remove from standard checks"
        },
        {
          finding_type: "Minor naming inconsistencies",
          reported: 45,
          fixed: 3,
          found_real_bugs: 0,
          effectiveness_score: "7% - NOISE",
          action: "Only report in specific code quality audits"
        }
      ]
    }
  },
  
  // Adjust severity based on outcomes
  severity_calibration: {
    learns: "Which 'CRITICAL' findings were actually critical",
    
    recalibration: [
      {
        finding: "Delete without confirmation",
        initial_severity: "CRITICAL",
        actual_impact: "LOW - users never accidentally delete",
        adjusted_severity: "MEDIUM",
        reason: "Analytics show delete feature used rarely, with caution"
      },
      {
        finding: "No pagination on roster",
        initial_severity: "MEDIUM",
        actual_impact: "CRITICAL - caused 15 support tickets, poor UX",
        adjusted_severity: "HIGH",
        reason: "Real users affected, support burden high"
      }
    ]
  },
  
  // Learn test priorities
  test_optimization: {
    tracks: "Which tests find bugs vs waste time",
    
    optimization: [
      {
        test: "Duplicate name edge case",
        runs: 10,
        found_issues: 10,
        roi: "100% - KEEP THIS TEST"
      },
      {
        test: "Session expiry during edit",
        runs: 10,
        found_issues: 0,
        roi: "0% - SKIP OR RUN LESS OFTEN",
        action: "Move to monthly deep audit, not every audit"
      },
      {
        test: "XSS injection attempts",
        runs: 10,
        found_issues: 0,
        roi: "0% - React auto-escapes",
        action: "Run once per year, not every audit"
      }
    ]
  },
  
  // Memory of your codebase
  codebase_memory: {
    remembers: [
      "You always forget empty states - remind early",
      "Baseball features lag behind Golf - suggest feature parity",
      "Performance issues appear around 100 items - test earlier",
      "You fix P0s within 24 hours - confidence in prioritization",
      "You ignore minor style issues - stop reporting them"
    ],
    
    adapts_to_you: {
      communication_style: "You prefer brief, actionable reports → shorter outputs",
      fix_patterns: "You batch similar fixes → group recommendations",
      priorities: "Security > Performance > UX → adjust scoring weights",
      tech_stack: "Next.js 14, Supabase, Tailwind → use stack-specific best practices"
    }
  },
  
  // Continuous improvement metrics
  progress_tracking: {
    measures: [
      {
        metric: "Average feature completeness score",
        round_01: 61,
        round_02: 68,
        round_03: 74,
        round_04: 81,
        trend: "Improving 7 points per round ✅"
      },
      {
        metric: "Critical issues found",
        round_01: 12,
        round_02: 8,
        round_03: 4,
        round_04: 2,
        trend: "Decreasing ✅ - fixing faster than creating"
      },
      {
        metric: "Test coverage",
        round_01: "15%",
        round_02: "32%",
        round_03: "58%",
        round_04: "74%",
        trend: "Increasing ✅"
      }
    ],
    
    celebrates_wins: "You've improved average feature score from 61 → 81 in 4 rounds! 🎉"
  }
}

// IMPLEMENTATION:
// 1. After each audit, track which findings got fixed
// 2. Learn which tests find real bugs
// 3. Adjust priorities based on your fix patterns
// 4. Drop low-value tests
// 5. Get smarter with every round
```

**Memory Schema:**
```json
{
  "self_improvement": {
    "finding_effectiveness": {
      "cascade_delete_issues": {
        "reported": 5,
        "fixed": 5,
        "effectiveness": 1.0
      },
      "minor_naming": {
        "reported": 45,
        "fixed": 3,
        "effectiveness": 0.07
      }
    },
    "learned_patterns": [
      "Always forget empty states",
      "Performance issues at 100 items",
      "Fix P0s within 24h"
    ],
    "progress": {
      "round_01": { "score": 61, "criticals": 12 },
      "round_04": { "score": 81, "criticals": 2 }
    }
  }
}
```

**Result:**
- Gets smarter every audit
- Drops useless tests
- Focuses on what you actually fix
- Tracks your improvement over time
- Adapts to your workflow

---

## 🎯 ALL 7 WORKING TOGETHER

```typescript
// GENIUS AUDIT WORKFLOW:

async function runGeniusAudit() {
  // 1. PRODUCTION DATA LEARNING
  const productionIssues = await analyzeProduction();
  // "Top error: Duplicate team name (45 occurrences)"
  
  // 2. PREDICTIVE DETECTION
  const predicted = predictIssues();
  // "New tournament feature likely missing pagination"
  
  // 3. USER JOURNEY TESTING
  const journeys = await testUserJourneys();
  // "Create team + add players takes 32s (too slow)"
  
  // 4. AI CODE UNDERSTANDING
  const codeAnalysis = await analyzeCodeSemantics();
  // "Golf and Baseball have inconsistent validation"
  
  // 5. VISUAL REGRESSION
  const visualDiffs = await captureScreenshots();
  // "Button moved, contrast failed WCAG"
  
  // 6. AUTO-FIX GENERATION
  const fixes = await generateFixes(allIssues);
  // "Generated 12 auto-fixes, 5 need review"
  
  // 7. SELF-IMPROVEMENT
  updateLearnings(results);
  // "Empty state issues 100% fixed rate → keep reporting"
  // "Concurrency issues 0% fixed rate → stop reporting"
  
  return comprehensiveReport;
}
```

**Result: The smartest feature auditor possible** 🧠✨

---

*"Not just testing features, but learning from reality, predicting issues, generating fixes, and getting smarter with every audit."*
