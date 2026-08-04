# Coaching Universe Audit — Executive Summary

**Report Date:** August 1, 2026  
**Status:** Awaiting Agent Completion  
**Audit Stage:** Pre-flight (expected outputs not yet available)

---

## Executive Summary

This audit is scheduled to begin once the following parallel seeding agents complete their work:

### Expected Deliverables (Outstanding)

| Agent Task | Expected Output | Status |
|---|---|---|
| NCAA D1/D2/D3 seed | CSVs seeded into CRM | ⏳ In Progress |
| JUCO_D1/D2/D3 + NAIA CSV production | Import-ready CSVs | ⏳ Pending |
| Phone backfill CSV | Backfill list | ⏳ Pending |
| NCAA validation/canonicalization | Cleaned NCAA data | ⏳ Pending |
| Review-queue triage CSV | Flagged rows for review | ⏳ Pending |

---

## Audit Checklist — To Run Upon Agent Completion

### 1. Verified NCAA Universe (Expected Queries)

Once agents complete seeding, run against production CRM:

```sql
-- NCAA coaches by division breakdown
SELECT 
  division,
  COUNT(*) as coaches,
  COUNT(DISTINCT id) as unique_ids,
  COUNT(DISTINCT school_id) as schools,
  COUNT(CASE WHEN is_head_coach THEN 1 END) as head_coaches,
  COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as with_email,
  COUNT(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 END) as with_phone
FROM crm_coaches
WHERE division IN ('D1', 'D2', 'D3')
GROUP BY division
ORDER BY division;
```

**Expected result structure:**
- NCAA D1: [X coaches], [Y head coaches], [Z schools]
- NCAA D2: [X coaches], [Y head coaches], [Z schools]
- NCAA D3: [X coaches], [Y head coaches], [Z schools]
- **Total NCAA:** [Sum] coaches, [Sum] head coaches, [Sum] schools

Email coverage: [%] with valid email  
Phone coverage: [%] with valid phone

---

### 2. JUCO + NAIA Ready State (From CSVs)

Once CSV production agents complete, count:

**JUCO_D1_coaches.csv**
- Expected shape: `first_name, last_name, email, phone, school_name, is_head_coach`
- Row count: [TBD] coaches (import-ready)
- Head coaches: [TBD]
- Email completeness: [%]

**JUCO_D2_coaches.csv**
- Expected shape: Same
- Row count: [TBD]
- Head coaches: [TBD]
- Email completeness: [%]

**JUCO_D3_coaches.csv**
- Expected shape: Same
- Row count: [TBD]
- Head coaches: [TBD]
- Email completeness: [%]

**NAIA_coaches.csv**
- Expected shape: Same
- Row count: [TBD]
- Head coaches: [TBD]
- Email completeness: [%]

**Combined JUCO + NAIA Total:** [TBD] coaches (import-ready)

---

### 3. Coverage Gaps (From _still_missing.csv Files)

Once agents produce missing-school reports:

```
D1_schools_still_missing.csv      → count schools
D2_schools_still_missing.csv      → count schools
D3_schools_still_missing.csv      → count schools
JUCO_D1_schools_still_missing.csv → count schools
JUCO_D2_schools_still_missing.csv → count schools
JUCO_D3_schools_still_missing.csv → count schools
NAIA_schools_still_missing.csv    → count schools
```

**Analysis to perform:**
- Are missing schools scrape-misses (should retry)? → Check if they're D1/D2/D3 Power 5 / mid-major / D2/D3 confirmed active.
- Are they genuinely gone? → Cross-reference against NCAA dissolution records, conference realignments.
- Count by category: Scrape-miss vs. genuinely gone.

---

### 4. Next Steps & Seeding Order

**Recommended seeding sequence:**

1. **JUCO (Tier 1 — High ROI, CSV ready)**
   - JUCO_D1: [TBD] rows
   - JUCO_D2: [TBD] rows
   - JUCO_D3: [TBD] rows
   - **Subtotal:** [TBD] rows
   - **Time:** ~[TBD] min (parallel INSERT via admin batch action)

2. **NAIA (Tier 2 — High ROI, CSV ready)**
   - NAIA: [TBD] rows
   - **Time:** ~[TBD] min (parallel INSERT)

3. **Review Queue Recovery (Tier 3 — Flagged NCAA rows)**
   - Rows from review-queue triage: [TBD] coaches
   - Action: Manual review + correction OR auto-canonicalize
   - **Time:** [TBD] min (depends on review depth)

4. **Phone Backfill (Tier 4 — Enhancement)**
   - Coaches missing phone: [TBD] rows
   - Data source: Phone backfill CSV
   - **Time:** ~[TBD] min (parallel UPDATE)

5. **Retry Missing Schools (Tier 5 — Optional)**
   - Schools identified as scrape-misses: [TBD]
   - Action: Re-scrape with refined patterns
   - **Decision point:** Requires cost/benefit analysis

---

## Quality Snapshot Protocol

Once agents complete, validate:

### NCAA Sample (10 coaches, mix of D1/D2/D3)

```
Sample from CRM after seeding:
- Check 2-3 D1 coaches: emails, names, head coach flag
- Check 3-4 D2 coaches: emails, names, phone coverage
- Check 3-4 D3 coaches: emails, names, data cleanliness
```

**Quality gates:**
- ✓ No obviously fake emails (e.g., `noemail@example.com`, `coach123@fakeemail.net`)
- ✓ Names are capitalized correctly (no ALL_CAPS, no lowercase)
- ✓ No junk rows (empty names, single-letter entries, "test" entries)
- ✓ Phone format is consistent (if present)
- ✓ School associations are correct (coach at expected school)

### JUCO/NAIA Sample (5 coaches, mix of divisions)

```
Sample from CSV before import:
- Check 2 JUCO_D1 coaches: email format, name case, head coach flag
- Check 2 NAIA coaches: same checks
- Check 1 JUCO_D3 coach: data completeness
```

**Quality gates:** (same as above)

---

## Known Unknowns & Blockers

### Data Availability

| Question | Current Status | Needed For |
|----------|---|---|
| Are NCAA coaches already in prod CRM? | ❌ Unknown (need to query) | Baseline count |
| How many schools are NCAA active? | ❌ Unknown | Coverage %, gap analysis |
| Phone backfill source | ❌ Unknown | Phone completeness timeline |
| NCAA canonicalization rules | ❌ Unknown | Review-queue sizing |

### Timing Risks

- **Agent parallelism:** If one agent (e.g., phone backfill) is slower, it holds up seeding order. Recommend proceeding with JUCO/NAIA in parallel while phone backfill completes.
- **Review queue depth:** If canonicalization identifies >500 rows needing review, manual QA becomes a bottleneck. Consider sampling + auto-canonicalize for high-confidence rows.

---

## Post-Audit Action Items

### Immediate (Once CSVs Land)

- [ ] Run counting queries on each CSV file
- [ ] Verify email formats (regex: valid domain, no test patterns)
- [ ] Spot-check 10 NCAA + 5 JUCO/NAIA coaches for quality
- [ ] Flag review-queue rows for manual triage
- [ ] Estimate phone backfill impact (% of coaches affected)

### Phase 1: Seeding (JUCO + NAIA)

- [ ] Batch INSERT JUCO_D1 coaches
- [ ] Batch INSERT JUCO_D2 coaches
- [ ] Batch INSERT JUCO_D3 coaches
- [ ] Batch INSERT NAIA coaches
- [ ] Verify row counts match CSV expectations
- [ ] Spot-check 5 random coaches in CRM post-import

### Phase 2: Cleanup (Phone + Review Queue)

- [ ] Apply phone backfill UPDATE statements
- [ ] Manual review of flagged rows (canonicalization)
- [ ] Re-verify email/phone completeness %

### Phase 3: Coverage & Metrics (Optional)

- [ ] Query schools NOT represented in any division
- [ ] Segment gap analysis (scrape-misses vs. genuinely gone)
- [ ] Decide: Retry missing-school scrape? (Tier 5)

---

## Audit Report Will Include

Once agents complete, this report will be regenerated with:

1. **Final NCAA counts** (D1/D2/D3, by school/coach/head-coach)
2. **JUCO/NAIA counts** (ready-to-import row counts per division)
3. **Coverage by division** (% with email, % with phone)
4. **Gap summary** (schools still missing, categorized)
5. **Seeding roadmap** (rows per step, estimated duration)
6. **Quality sample results** (sample coaches, quality gates passed/failed)
7. **Timeline** (when each phase expected to complete)

---

**Next step:** Wait for agents to complete CSV production, then re-run this audit with final data. Handoff doc is ready for the seeding push.

