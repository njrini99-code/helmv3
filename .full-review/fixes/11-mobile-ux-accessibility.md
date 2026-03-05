# Fix Plan #11: Mobile UX & Accessibility for Shot Tracking

**Bugs:** P1 #33 (Edit shot modal not optimized for mobile field use), P1 #34 (No accessibility labels on key interactive elements)
**File:** `src/components/golf/ShotTrackingComprehensive.tsx`
**Risk:** Low -- additive ARIA attributes and CSS sizing changes only; no logic changes.

---

## Bug #33: Edit Shot Modal Not Optimized for Mobile Field Use

### Problem

The edit modal has three issues for on-course mobile use:

1. **Small touch targets in 3-column grids** -- The "Lie Before", "Result", "Putt Break", "Putt Slope", and "Miss Direction" button grids inside the edit modal use `py-2.5` (~36px effective height), which is below the 48px WCAG minimum for touch targets.
2. **Save/Delete buttons below the fold** -- The modal footer is `sticky bottom-0` (line 1869), which is already correct. However, the modal body buttons lack padding at the bottom to ensure the last form field is not obscured when the footer sticks.
3. **No distance presets in edit mode** -- The main shot entry view has quick-select distance buttons for putting (line 1107: `[5, 10, 15, 20, 30, 40]`), but the edit modal distance inputs (lines 1639-1669, 1730-1760) have no presets at all.

### Fix A: Increase touch targets to min 48px in edit modal grids

All edit modal grid buttons currently use `py-2.5`. Change to `py-3 min-h-[48px]` to guarantee a 48px minimum touch target.

**Affected locations (6 grids):**

#### A1. Lie Before grid (line 1620)

```
File: src/components/golf/ShotTrackingComprehensive.tsx
```

**Current (line 1620):**
```tsx
                              className={`py-2.5 rounded-lg font-semibold text-sm transition-all ${
```

**Change to:**
```tsx
                              className={`py-3 min-h-[48px] rounded-lg font-semibold text-sm transition-all ${
```

#### A2. Result grid (line 1710)

**Current (line 1710):**
```tsx
                              className={`py-2.5 rounded-lg font-semibold text-sm transition-all ${
```

**Change to:**
```tsx
                              className={`py-3 min-h-[48px] rounded-lg font-semibold text-sm transition-all ${
```

#### A3. Miss Direction grid (line 1774)

**Current (line 1774):**
```tsx
                                className={`py-2.5 rounded-lg font-semibold text-sm capitalize transition-all ${
```

**Change to:**
```tsx
                                className={`py-3 min-h-[48px] rounded-lg font-semibold text-sm capitalize transition-all ${
```

#### A4. Putt Break grid (line 1806)

**Current (line 1806):**
```tsx
                                  className={`py-2.5 rounded-lg font-semibold text-sm transition-all ${
```

**Change to:**
```tsx
                                  className={`py-3 min-h-[48px] rounded-lg font-semibold text-sm transition-all ${
```

#### A5. Putt Slope grid (line 1824)

**Current (line 1824):**
```tsx
                                  className={`py-2.5 rounded-lg font-semibold text-sm transition-all ${
```

**Change to:**
```tsx
                                  className={`py-3 min-h-[48px] rounded-lg font-semibold text-sm transition-all ${
```

#### A6. Edit modal Club toggle buttons (lines 1588, 1598)

**Current (line 1588):**
```tsx
                              className={`flex-1 py-2.5 rounded-md font-semibold text-sm transition-all ${
```

**Current (line 1598):**
```tsx
                              className={`flex-1 py-2.5 rounded-md font-semibold text-sm transition-all ${
```

**Change both to:**
```tsx
                              className={`flex-1 py-3 min-h-[48px] rounded-md font-semibold text-sm transition-all ${
```

#### A7. Edit modal distance unit toggle buttons (lines 1650, 1660, 1741, 1751)

These use `px-3 py-2` -- increase to `py-2.5 min-h-[44px]` (slightly smaller since they are secondary controls, but still approaching the 48px target).

**Current (line 1650):**
```tsx
                              className={`px-3 py-2 rounded-md font-semibold text-xs uppercase transition-all ${
```

**Change all four instances (lines 1650, 1660, 1741, 1751) to:**
```tsx
                              className={`px-3 py-2.5 min-h-[44px] rounded-md font-semibold text-xs uppercase transition-all ${
```

### Fix B: Add distance presets in edit mode

Add quick-select distance buttons to the edit modal's "Distance After" section (after line 1736), matching the style already used in the main view (lines 1107-1126). For the edit modal, provide presets contextual to the shot type: putting gets foot presets, non-putting gets yard presets.

**Insert after line 1736 (after the distance input's `onChange` closing tag, before the closing `/>` and the unit toggle):**

Actually, the edit distance section structure is different from the main view. The edit modal has the input and unit toggle in a flex row (lines 1729-1761). The presets should go between the label and the input row.

**Current (lines 1727-1736):**
```tsx
                        <div>
                          <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-3">Distance After</p>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              value={editFormData.distanceToHoleAfter}
                              onChange={(e) => updateEditForm({ distanceToHoleAfter: e.target.value })}
                              className="flex-1 h-12 px-4 rounded-lg text-lg font-semibold text-warm-900 text-center bg-white border-2 border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none transition-all"
                            />
```

**Replace with:**
```tsx
                        <div>
                          <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-3">Distance After</p>
                          {/* Quick-select distance presets */}
                          {editingShot.shotType === 'putting' ? (
                            <div className="grid grid-cols-6 gap-2 mb-3">
                              {[3, 5, 10, 15, 20, 30].map((ft) => (
                                <button
                                  key={ft}
                                  type="button"
                                  onClick={() => updateEditForm({ distanceToHoleAfter: String(ft), distanceUnitAfter: 'feet' })}
                                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                                    editFormData.distanceToHoleAfter === String(ft) && editFormData.distanceUnitAfter === 'feet'
                                      ? 'bg-primary-600 text-white shadow-sm'
                                      : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-primary-300'
                                  }`}
                                >
                                  {ft}ft
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="grid grid-cols-5 gap-2 mb-3">
                              {[50, 100, 150, 200, 250].map((yds) => (
                                <button
                                  key={yds}
                                  type="button"
                                  onClick={() => updateEditForm({ distanceToHoleAfter: String(yds), distanceUnitAfter: 'yards' })}
                                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                                    editFormData.distanceToHoleAfter === String(yds) && editFormData.distanceUnitAfter === 'yards'
                                      ? 'bg-primary-600 text-white shadow-sm'
                                      : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-primary-300'
                                  }`}
                                >
                                  {yds}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              value={editFormData.distanceToHoleAfter}
                              onChange={(e) => updateEditForm({ distanceToHoleAfter: e.target.value })}
                              className="flex-1 h-12 px-4 rounded-lg text-lg font-semibold text-warm-900 text-center bg-white border-2 border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none transition-all"
                            />
```

### Fix C: Add bottom padding to modal body so sticky footer does not obscure content

**Current (line 1513):**
```tsx
            <div className="px-6 py-4 space-y-5">
```

**Change to:**
```tsx
            <div className="px-6 py-4 pb-6 space-y-5">
```

This adds slightly more bottom padding so the last form field has breathing room above the sticky footer.

---

## Bug #34: No Accessibility Labels on Key Interactive Elements

### Problem

Multiple interactive elements lack ARIA attributes needed by screen readers:

1. Scorecard hole buttons have no `aria-label` (just visual text children)
2. Segmented controls (driver toggle, break, slope, result, miss direction) have no `role="radiogroup"` / `role="radio"` semantics
3. Distance input has no `aria-label`
4. Decorative SVG course view has no `aria-hidden`

### Fix D: ARIA labels on scorecard hole buttons

#### D1. Front 9 hole buttons (line 611)

**Current (lines 611-614):**
```tsx
                <button
                  key={hole.number}
                  id={`hole-${hole.number}`}
                  onClick={() => canNavigate && onNavigateToHole(idx)}
                  disabled={!canNavigate}
```

**Change to:**
```tsx
                <button
                  key={hole.number}
                  id={`hole-${hole.number}`}
                  aria-label={`Hole ${hole.number}, Par ${hole.par}, ${hole.yardage} yards${hasScore ? `, Score: ${hole.score}` : ', not yet played'}${isCurrent ? ' (current hole)' : ''}${canNavigate && !isCurrent ? ', click to edit' : ''}`}
                  onClick={() => canNavigate && onNavigateToHole(idx)}
                  disabled={!canNavigate}
```

#### D2. Back 9 hole buttons (line 660)

**Current (lines 660-664):**
```tsx
                <button
                  key={hole.number}
                  id={`hole-${hole.number}`}
                  onClick={() => canNavigate && onNavigateToHole(actualIdx)}
                  disabled={!canNavigate}
```

**Change to:**
```tsx
                <button
                  key={hole.number}
                  id={`hole-${hole.number}`}
                  aria-label={`Hole ${hole.number}, Par ${hole.par}, ${hole.yardage} yards${hasScore ? `, Score: ${hole.score}` : ', not yet played'}${isCurrent ? ' (current hole)' : ''}${canNavigate && !isCurrent ? ', click to edit' : ''}`}
                  onClick={() => canNavigate && onNavigateToHole(actualIdx)}
                  disabled={!canNavigate}
```

### Fix E: `role="radiogroup"` on segmented controls

#### E1. Driver/Non-Driver toggle (line 928)

**Current (line 928):**
```tsx
                  <div className="inline-flex bg-warm-100 rounded-lg p-1 w-full">
```

**Change to:**
```tsx
                  <div className="inline-flex bg-warm-100 rounded-lg p-1 w-full" role="radiogroup" aria-label="Club off tee">
```

And add `role="radio"` + `aria-checked` to the two buttons:

**Current (line 929-933):**
```tsx
                    <button onClick={() => dispatch({ type: 'SET_DRIVER', payload: true })}
                      className={`flex-1 py-3 rounded-md font-semibold text-sm transition-all ${
                        usedDriver === true
                          ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                          : 'text-warm-600 hover:text-warm-900'}`}>
                      Driver
                    </button>
```

**Change to:**
```tsx
                    <button onClick={() => dispatch({ type: 'SET_DRIVER', payload: true })}
                      role="radio"
                      aria-checked={usedDriver === true}
                      className={`flex-1 py-3 rounded-md font-semibold text-sm transition-all ${
                        usedDriver === true
                          ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                          : 'text-warm-600 hover:text-warm-900'}`}>
                      Driver
                    </button>
```

**Current (line 936-940):**
```tsx
                    <button onClick={() => dispatch({ type: 'SET_DRIVER', payload: false })}
                      className={`flex-1 py-3 rounded-md font-semibold text-sm transition-all ${
                        usedDriver === false
                          ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                          : 'text-warm-600 hover:text-warm-900'}`}>
                      Non-Driver
                    </button>
```

**Change to:**
```tsx
                    <button onClick={() => dispatch({ type: 'SET_DRIVER', payload: false })}
                      role="radio"
                      aria-checked={usedDriver === false}
                      className={`flex-1 py-3 rounded-md font-semibold text-sm transition-all ${
                        usedDriver === false
                          ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                          : 'text-warm-600 hover:text-warm-900'}`}>
                      Non-Driver
                    </button>
```

#### E2. Break segmented control (line 957)

**Current (line 957):**
```tsx
                    <div className="inline-flex bg-white rounded-lg p-1 w-full border border-primary-200">
```

**Change to:**
```tsx
                    <div className="inline-flex bg-white rounded-lg p-1 w-full border border-primary-200" role="radiogroup" aria-label="Putt break direction">
```

And add `role="radio"` + `aria-checked` to each button in the `.map()`:

**Current (line 959):**
```tsx
                        <button key={b.v} onClick={() => dispatch({ type: 'SET_PUTT_BREAK', payload: b.v as ShotRecord['puttBreak'] })}
                          className={`flex-1 py-2.5 rounded-md font-semibold text-sm transition-all ${
```

**Change to:**
```tsx
                        <button key={b.v} onClick={() => dispatch({ type: 'SET_PUTT_BREAK', payload: b.v as ShotRecord['puttBreak'] })}
                          role="radio"
                          aria-checked={puttBreak === b.v}
                          className={`flex-1 py-2.5 rounded-md font-semibold text-sm transition-all ${
```

#### E3. Slope segmented control (line 971)

**Current (line 971):**
```tsx
                    <div className="inline-flex bg-white rounded-lg p-1 w-full border border-primary-200">
```

**Change to:**
```tsx
                    <div className="inline-flex bg-white rounded-lg p-1 w-full border border-primary-200" role="radiogroup" aria-label="Putt slope">
```

And add `role="radio"` + `aria-checked` to each button:

**Current (line 973):**
```tsx
                        <button key={s.v} onClick={() => dispatch({ type: 'SET_PUTT_SLOPE', payload: s.v as ShotRecord['puttSlope'] })}
                          className={`flex-1 py-2.5 rounded-md font-semibold text-sm transition-all ${
```

**Change to:**
```tsx
                        <button key={s.v} onClick={() => dispatch({ type: 'SET_PUTT_SLOPE', payload: s.v as ShotRecord['puttSlope'] })}
                          role="radio"
                          aria-checked={puttSlope === s.v}
                          className={`flex-1 py-2.5 rounded-md font-semibold text-sm transition-all ${
```

#### E4. Shot Result grid (line 997)

**Current (line 997):**
```tsx
                <div className="grid grid-cols-3 gap-2">
```

**Change to:**
```tsx
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={isPutting ? 'Putt result' : 'Shot result'}>
```

And add `role="radio"` + `aria-checked` to the buttons (line 1016):

**Current (line 1016):**
```tsx
                      <button key={r} onClick={() => handleResultSelect(r)}
                        className={`py-3 rounded-lg font-semibold text-sm transition-all ${
```

**Change to:**
```tsx
                      <button key={r} onClick={() => handleResultSelect(r)}
                        role="radio"
                        aria-checked={resultOfShot === r}
                        className={`py-3 rounded-lg font-semibold text-sm transition-all ${
```

#### E5. Miss Direction (tee shot) segmented control (line 1053)

**Current (line 1053):**
```tsx
                    <div className="inline-flex bg-warm-100 rounded-lg p-1 w-full">
```

**Change to:**
```tsx
                    <div className="inline-flex bg-warm-100 rounded-lg p-1 w-full" role="radiogroup" aria-label="Miss direction">
```

And add `role="radio"` + `aria-checked` to each button (line 1055):

**Current (line 1055):**
```tsx
                        <button key={d} onClick={() => dispatch({ type: 'SET_MISS_DIRECTION', payload: d })}
                          className={`flex-1 py-3 rounded-md font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
```

**Change to:**
```tsx
                        <button key={d} onClick={() => dispatch({ type: 'SET_MISS_DIRECTION', payload: d })}
                          role="radio"
                          aria-checked={missDirection === d}
                          className={`flex-1 py-3 rounded-md font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
```

### Fix F: `aria-label` on distance input

#### F1. Main view distance input (line 1095)

**Current (lines 1095-1103):**
```tsx
                    <input
                      ref={distanceInputRef}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={distanceAfterShot}
                      onChange={(e) => dispatch({ type: 'SET_DISTANCE_AFTER', payload: e.target.value })}
                      placeholder="Enter distance"
                      className="w-full h-14 px-5 rounded-xl text-3xl font-bold text-primary-900 text-center bg-white border-2 border-primary-300 focus:border-primary-500 focus:ring-4 focus:ring-primary-100 focus:outline-none transition-all placeholder:text-warm-300"
                    />
```

**Change to (add `aria-label`):**
```tsx
                    <input
                      ref={distanceInputRef}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      aria-label={isPutting ? 'Leave distance in feet or yards' : 'Distance remaining to hole'}
                      value={distanceAfterShot}
                      onChange={(e) => dispatch({ type: 'SET_DISTANCE_AFTER', payload: e.target.value })}
                      placeholder="Enter distance"
                      className="w-full h-14 px-5 rounded-xl text-3xl font-bold text-primary-900 text-center bg-white border-2 border-primary-300 focus:border-primary-500 focus:ring-4 focus:ring-primary-100 focus:outline-none transition-all placeholder:text-warm-300"
                    />
```

#### F2. Edit modal "Distance Before" input (line 1639)

**Current (lines 1639-1645):**
```tsx
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={editFormData.distanceToHoleBefore}
                            onChange={(e) => updateEditForm({ distanceToHoleBefore: e.target.value })}
                            className="flex-1 h-12 px-4 rounded-lg text-lg font-semibold text-warm-900 text-center bg-white border-2 border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none transition-all"
                          />
```

**Change to:**
```tsx
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            aria-label="Distance to hole before shot"
                            value={editFormData.distanceToHoleBefore}
                            onChange={(e) => updateEditForm({ distanceToHoleBefore: e.target.value })}
                            className="flex-1 h-12 px-4 rounded-lg text-lg font-semibold text-warm-900 text-center bg-white border-2 border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none transition-all"
                          />
```

#### F3. Edit modal "Distance After" input (line 1730)

**Current (lines 1730-1736):**
```tsx
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              value={editFormData.distanceToHoleAfter}
                              onChange={(e) => updateEditForm({ distanceToHoleAfter: e.target.value })}
                              className="flex-1 h-12 px-4 rounded-lg text-lg font-semibold text-warm-900 text-center bg-white border-2 border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none transition-all"
                            />
```

**Change to:**
```tsx
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              aria-label="Distance to hole after shot"
                              value={editFormData.distanceToHoleAfter}
                              onChange={(e) => updateEditForm({ distanceToHoleAfter: e.target.value })}
                              className="flex-1 h-12 px-4 rounded-lg text-lg font-semibold text-warm-900 text-center bg-white border-2 border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none transition-all"
                            />
```

### Fix G: `aria-hidden` on decorative SVG course view

The entire course visualization (lines 1244-1383) is decorative -- it provides visual context but no information that is not already available in text form elsewhere. Add `aria-hidden="true"` to the container.

**Current (line 1245):**
```tsx
            <div className="relative rounded-xl h-56 overflow-hidden shadow-inner">
```

**Change to:**
```tsx
            <div className="relative rounded-xl h-56 overflow-hidden shadow-inner" aria-hidden="true">
```

---

## Summary of All Changes

| Fix | Bug | Location (line) | Change |
|-----|-----|-----------------|--------|
| A1 | #33 | 1620 | `py-2.5` -> `py-3 min-h-[48px]` (Lie Before) |
| A2 | #33 | 1710 | `py-2.5` -> `py-3 min-h-[48px]` (Result) |
| A3 | #33 | 1774 | `py-2.5` -> `py-3 min-h-[48px]` (Miss Direction) |
| A4 | #33 | 1806 | `py-2.5` -> `py-3 min-h-[48px]` (Putt Break) |
| A5 | #33 | 1824 | `py-2.5` -> `py-3 min-h-[48px]` (Putt Slope) |
| A6 | #33 | 1588, 1598 | `py-2.5` -> `py-3 min-h-[48px]` (Club toggle) |
| A7 | #33 | 1650, 1660, 1741, 1751 | `py-2` -> `py-2.5 min-h-[44px]` (Unit toggles) |
| B  | #33 | after 1728 | Add distance preset grid before input |
| C  | #33 | 1513 | `py-4` -> `py-4 pb-6` (modal body bottom padding) |
| D1 | #34 | 611 | Add `aria-label` to front 9 hole buttons |
| D2 | #34 | 660 | Add `aria-label` to back 9 hole buttons |
| E1 | #34 | 928-942 | `role="radiogroup"` on wrapper, `role="radio"` + `aria-checked` on driver toggle |
| E2 | #34 | 957-966 | `role="radiogroup"` on wrapper, `role="radio"` + `aria-checked` on break buttons |
| E3 | #34 | 971-980 | `role="radiogroup"` on wrapper, `role="radio"` + `aria-checked` on slope buttons |
| E4 | #34 | 997, 1016 | `role="radiogroup"` on result grid, `role="radio"` + `aria-checked` on result buttons |
| E5 | #34 | 1053, 1055 | `role="radiogroup"` on miss direction wrapper, `role="radio"` + `aria-checked` on buttons |
| F1 | #34 | 1095 | Add `aria-label` to main distance input |
| F2 | #34 | 1639 | Add `aria-label` to edit distance-before input |
| F3 | #34 | 1730 | Add `aria-label` to edit distance-after input |
| G  | #34 | 1245 | Add `aria-hidden="true"` to course visualization |

**Total edits:** 22 targeted changes across 1 file
**Lines of new code:** ~35 (distance presets block in edit modal)
**Lines modified:** ~20 (CSS class additions + ARIA attribute additions)
**No logic changes, no layout redesign.**

---

## Testing Checklist

- [ ] Edit modal buttons are at least 48px tall on mobile (use browser dev tools element inspector)
- [ ] Edit modal save/delete footer remains visible when scrolling form content
- [ ] Distance presets appear in edit modal for both putting (ft) and non-putting (yds) shots
- [ ] Clicking a distance preset fills the input and sets the correct unit
- [ ] Screen reader announces hole button info (hole number, par, score, navigation hint)
- [ ] Screen reader announces segmented controls as radio groups with checked state
- [ ] Screen reader skips the decorative course visualization
- [ ] Distance inputs are announced with descriptive labels
- [ ] No visual regressions on desktop layout
