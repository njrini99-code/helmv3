# Mark Feature Complete

Mark the specified feature as complete in `docs/FEATURE_CHECKLIST.md`.

## Feature ID to Complete
`$ARGUMENTS`

## Instructions

1. **Read the current checklist:**
   - Open `docs/FEATURE_CHECKLIST.md`
   - Find the feature with ID: `$ARGUMENTS`

2. **Update the feature status:**
   - Change checkbox from `- [ ]` to `- [x]`
   - If the feature is in "IN-PROGRESS FEATURES" or "PLANNED FEATURES" section:
     - Move the entire feature block to the appropriate subsection in "COMPLETED FEATURES"
     - Place it in the correct category (e.g., Authentication, Recruiting, etc.)
   - If already in "COMPLETED FEATURES", just update the checkbox

3. **Update Quick Stats section:**
   - Recalculate completion percentages:
     - Count total completed features (all `[x]` items)
     - Count total in-progress features
     - Count total planned features
     - Update "Completed: X features (Y%)"
     - Update "In Progress: X features (Y%)"
     - Update "Planned: X features (Y%)"
   - Update platform-specific percentages if applicable:
     - Baseball Platform completion %
     - Golf Platform completion %
   - Update user type progress if applicable:
     - College Coach, HS Coach, JUCO Coach, Showcase Coach, Player types
   - Update category breakdowns if applicable

4. **Update Next Steps roadmap:**
   - If the completed feature is in Week 1-2, Week 3-4, etc. sections:
     - Change emoji from ⚠️ to ✅
   - Remove from "IMMEDIATE ACTIONS REQUIRED" if listed there

5. **Provide summary:**
   - Show what was marked complete
   - Show updated completion stats
   - Show what's next in priority order

## Output Format

```
✅ Marked Complete: [FEATURE-ID] - [Feature Name]

📊 Updated Stats:
- Total Completed: X/100+ (Y%)
- In Progress: X features
- Planned: X features

🎯 Impact:
- [User Type/Category]: X% → Y% complete

📋 Next Priority:
- [Next highest priority incomplete item]
```

## Important Notes

- Only mark features as complete that are 100% done and tested
- Be precise with checkbox updates - make sure to update ALL checkboxes for that feature
- Recalculate percentages accurately
- Update ALL relevant sections (Quick Stats, Platform Breakdown, User Type Progress, Category Breakdown)
- Save the file after making changes
