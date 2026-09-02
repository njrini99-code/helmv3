# Triage of knip's 881 unused exports

**Measured:** 2026-08-19 ~06:55Z · read-only · `triage_exports.py` ·
row-level output in `UNUSED_EXPORTS_TRIAGE.json`

Applying the discriminator: **an aggregate of string literals cannot make a symbol
reachable; an aggregate of references can.** Mechanical, so it catches the
aggregate case and nothing else.

**Coverage:** 873 of 881 rows parsed. The 8 unparsed rows are a formatting variant
I did not match; they are not in any bucket below and remain untriaged.

**Sanity case — PASSED.** `weeklyHealthPing` and `onCoachHelmRoundSubmitted`, both
known-live via `export const functions = [weeklyHealthPing, onCoachHelmRoundSubmitted]`,
classify as `AGGREGATE_OF_REFERENCES`. The tool finds the case it must find.
(It did not, on the first run — see *Instrument note*.)

---

## The rate, before the list

| Verdict | Count | % |
|---|---:|---:|
| **`NO_INFILE_REFERENCE`** — survives the check | **365** | **41%** |
| `BARE_ITEM_CONTEXT_UNCLEAR` — bare list item, nesting unresolved | 239 | 27% |
| `AGGREGATE_OF_REFERENCES` — **confirmed knip false positive** | 125 | 14% |
| `REFERENCED_IN_FILE_OTHER` | 84 | 9% |
| `CALLED_IN_FILE` | 60 | 6% |

**The headline is not the one either of us predicted.** The guess was that most of
the 881 would be aggregate-consumed. **Confirmed aggregate consumption is 14%** —
below the 20% threshold at which the caveat would be judged overstated.

But "the list is 86% trustworthy" would be the wrong conclusion, because **58% have
an in-file reference of some kind**. Splitting that honestly:

- **14% are proven false positives** (aggregate of references).
- **27% are unresolved.** These appear as a bare `symbol,` on its own line — the
  shape of an array member — but my bracket-balance check could not confirm the
  enclosing literal. They are *probably* mostly aggregates, and I am not counting
  them as such without proof.
- **15% are referenced or called within their own file** by some other means. That
  does not make them externally reachable, and knip may still be right about them —
  but it does mean the symbol is not inert.

**So: the caveat was overstated as to mechanism and roughly right as to
conclusion.** The aggregate rule alone does not account for most of the list, yet
fewer than half the entries come through clean.

## The deliverable: 365 exports that survive

These have no in-file reference of any kind, so the aggregate explanation does not
apply and knip's claim stands unchallenged by this pass. Concentrated rather than
scattered — the top 12 files hold ~40% of them:

| Count | File |
|---:|---|
| 35 | `src/app/baseball/actions/lifting-v11.ts` |
| 25 | `src/components/ui/skeleton.tsx` |
| 14 | `src/app/golf/actions/round-reviews.ts` |
| 13 | `src/lib/coachhelm/v3/motion.ts` |
| 12 | `src/app/golf/actions/insights.ts` |
| 11 | `src/app/baseball/actions/recruiting-philosophy.ts` |
| 7 | `src/app/baseball/actions/tasks.ts` |
| 7 | `src/app/golf/actions/documents.ts` |
| 6 | `src/app/baseball/actions/video-classes.ts` |
| 6 | `src/lib/motion/gsap/primitives.ts` |
| 5 | `src/components/fairway/pages/hub/hub-parts.tsx` |
| 5 | `src/lib/cache/golf-stats-calculator.ts` |

The concentration is the actionable part: this is not 365 scattered dead symbols,
it is a handful of files carrying large unused surfaces. `skeleton.tsx` exporting
25 unreferenced skeletons and `lifting-v11.ts` exporting 35 are single decisions,
not 60.

## What this did NOT check

Stated so the 365 is not mistaken for a verified kill list.

- **Dynamic dispatch, string lookup, framework convention.** A symbol reached by
  name at runtime, by a route convention, or through `next/dynamic` looks identical
  to a dead one here. This pass is blind to all three.
- **Cross-file aggregates.** The discriminator only inspects the symbol's *own*
  file. A symbol collected into a registry *elsewhere* is not caught.
- **Whether knip's own config is right for these paths.** The corrected config
  turned 7 unused files into 86; nothing revalidated it for exports.
- **The 2,249 unused types**, entirely untriaged.
- **8 unparsed rows.**

Evidentiary standing, explicitly: the **46 UNWIRED files** were each checked
individually. These **365 exports** have passed one mechanical filter. They should
not be quoted with equal confidence, and nothing here should be deleted on the
strength of this pass alone.

## Instrument note — the first run was wrong, and the sanity case is why I know

The first run parsed **310 of 881** rows and reported **zero** aggregate
consumption.

Both symptoms had one cause: knip emits two row shapes — `<symbol> <kind> <path>`
and `<symbol> <path>` — and my regex required the middle column. The 571 dropped
rows included `weeklyHealthPing` itself, so the sanity case was **absent from the
input** rather than misclassified, and "0% aggregate consumption" was produced by a
tool that had never seen the canonical example.

A rate computed from 35% of the list, presented as the answer, would have been
wrong in the most confident possible way. What caught it was the Commander's own
rule, applied literally: name a known-live item the tool MUST find, and assert on
it. The assertion is now in the script and prints PASS/FAIL on every run.

**Eighth instrument defect of the run**, and the first one caught by an automated
check rather than by noticing an implausible number.
