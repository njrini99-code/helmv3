# CoachHelm v3 — Golf Analytics Reference
*Canonical knowledge base for the engine. Compiled 2026-05-24. Sources current to 2024-2025 PGA Tour seasons + Shot Scope/Arccos/Broadie research.*

This document is the source of truth for what the engine is allowed to claim about golf. Every causal assertion in v3 generators must trace back to a finding here. Every PGA baseline shown in standing bars must come from sources cited here.

---

## 1. The Strokes Gained Framework

### Origin
**Strokes Gained (SG)** was developed by **Mark Broadie**, Professor of Business at Columbia Business School. Built mid-2000s by manually tracking thousands of amateur shots at his home club in Pelham, NY, validated against PGA Tour's **ShotLink** dataset (launched 2003, laser-tracks every shot on Tour). PGA Tour officially adopted SG: Putting in 2011, full long-game breakdown by 2014. Broadie's 2014 book *Every Shot Counts* is the canonical reference.

### How It Works
SG compares every shot to a **baseline expected-strokes-to-hole-out** for that (lie, distance) pair, computed empirically from millions of ShotLink shots.

> **SG for a shot = (baseline expected strokes from start position) − (baseline expected strokes from end position) − 1**

A shot that improves position by more than baseline gains strokes; less, and the player loses strokes. Lie categories in baselines: **tee, fairway, rough, sand, recovery, green**.

### The Four Categories
- **SG: OTT (Off-the-Tee)** — tee shots on par-4/5 only (par-3 tee shots count as approach). Combines distance and accuracy.
- **SG: APP (Approach)** — all approach shots from beyond ~30 yards (and par-3 tee shots).
- **SG: ARG (Around the Green)** — within ~30 yards, not putts (chips, pitches, bunker).
- **SG: PUTT (Putting)** — all on-green shots.

Sum to **SG: Total** = strokes gained vs field average for the round.

### Why SG Dominates Traditional Stats
Traditional stats (GIR, FW%, putts/round) suffer severe interaction effects: putts-per-round is *lower* for bad iron players (they chip close and 1-putt for bogey). FW% doesn't distinguish a 320-yd miss into rough vs. a 250-yd fairway. SG isolates **per-shot quality** controlling for situation.

### Variance Explained at PGA Tour Level
Broadie's headline finding: **long game (tee + approach) explains ~65% of the scoring difference between top pros and average pros; short game + putting together explain ~35%; putting alone is ~15%**. Overturned "drive for show, putt for dough." Source: [Broadie, *Every Shot Counts*; Columbia SG paper](https://columbia.edu/~mnb2/broadie/Assets/strokes_gained_pga_broadie_20110408.pdf)

### Where Amateur/College Differs
At amateur level the variance shifts. As handicaps rise, **penalty-stroke avoidance and approach-shot proximity** explain a larger share. Shot Scope's data: GIR is the single biggest separator between handicap brackets, while FW% barely moves (scratch hits only ~4% more fairways than 20-handicap). For college players (mostly +2 to 4 handicap), distribution is closer to Tour, but **SG:APP and short-putt make % carry disproportionate weight** because driving accuracy converges among elite amateurs.

---

## 2. PGA Tour Baselines (2024 Season)

| Metric | PGA Tour Average | Notes |
|---|---|---|
| Scoring Average (adj.) | ~70.9 | Adjusted |
| Driving Distance | ~300.5 yds | 2024; first season Tour avg crossed 300 |
| Fairway Hit % | ~59-61% | |
| Greens in Regulation | ~65-67% | Top of leaderboard ~72% |
| Scrambling (overall) | ~58-60% | Up-and-down when green missed |
| Sand Save % | ~50% | Long-running Tour avg |
| Scrambling from Rough | ~58% | |
| Scrambling from Fairway (miss) | ~65% | |
| Putts per Round | ~29.0 | Includes putts after misses |
| Putts per GIR | ~1.77 | Cleanest putting proxy |
| 1-Putt % | ~40% | |
| 3-Putt Rate | ~2.7% (~1 per 1.85 rounds) | Scheffler 2024: 1.88% |

### Putt Make % by Distance (Tour 2024 — Dethier/Broadie data)

**This is the bar-chart-critical table — seeds `golf_pga_standards`:**

| Distance | Make % |
|---|---|
| 3 ft | 99.4% |
| 4 ft | 91.4% |
| 5 ft | 80.7% |
| 6 ft | 70.2% |
| 7 ft | 60.6% |
| 8 ft | 52.9% |
| 9 ft | 46.4% |
| 10 ft | 41.3% |
| 11-15 ft | 30.1% |
| 15-20 ft | 18.3% |
| 20-25 ft | 12.5% |
| 25+ ft | 5.5% |

Source: [Golf.com — Dethier on Tour putting make %s](https://golf.com/instruction/putting/pga-tour-putting-make-percentages-distance/)

### SG Benchmarks ("Good" = Top 30 Tour)
- SG:OTT: 0.5+/round = elite; 0.0 = field avg
- SG:APP: 0.5+/round = elite (Scheffler routinely >1.0)
- SG:ARG: 0.3+/round = elite
- SG:PUTT: 0.4+/round = elite (Harry Hall led 2025 at 1.677)
- SG:Total leader: ~+2.0/round = best player in world

Sources: [PGA Tour Stats](https://www.pgatour.com/stats), [Data Golf 2026 SG](https://datagolf.com/stats), [PGA Tour Approach 50-125](https://www.pgatour.com/stats/detail/340)

### Proximity Benchmarks (Tour Avg)
- 100-125 yds: ~20 ft from hole (75.4% GIR from fairway)
- 50-125 yds: ~16-19 ft; Tour leader 14'9"
- 150-175 yds: ~30 ft
- 200+ yds: ~45+ ft

---

## 3. College Golf Baselines

### Scoring Averages (Recruiting Benchmarks)

| Level | Scoring Avg | USGA Handicap |
|---|---|---|
| Top-25 D1 | 71-72 | +2 to +4 |
| Mid/Lower D1 | 73-74 | 0 to +2 |
| D2 / Top NAIA | 74-76 | 3.5-4 |
| D3 / Lower NAIA | mid 70s — low 80s | 4-8 |
| JUCO | 76-82 | 5-10 |

Sources: [NCSA Recruiting Guidelines](https://www.ncsasports.org/mens-golf/recruiting-guidelines); [Golf Globally / Clippd 2024](https://www.golfglobally.com/college-golf-scoring-averages); courses typically 6,600-7,000 yards.

### Typical College Stat Profile (D1)
- FW%: ~62-68% (above Tour, courses set up easier)
- GIR%: ~58-65%
- Putts/round: 29.5-30.5
- Scrambling: ~50-55%
- 3-putt rate: ~5-7%
- Driving distance: 285-310 (top D1 averages ~295)

### Where College Differs from Tour
1. **Pin positions less brutal** — proximity numbers closer to Tour than scoring suggests
2. **Short putt make % is the biggest invisible gap** — even +2 player makes ~92% from 3 ft vs Tour 99.4%; that's 1-2 strokes per round in pressure putts
3. **Penalty avoidance dominates college variance** — top teams <0.5 penalties/round; struggling teams 2+
4. **Wedge proximity from 75-125** is the single biggest D1 vs Tour gap (~28 ft vs 19 ft)

### Junior / AJGA Benchmarks
- AJGA-invitational: 73-75 scoring on 6,800-yard setups
- Top-25 ranked junior: 71-73
- Coaches weight multi-round (36-54 hole) tournament scores far above single rounds

### Shot Scope Make % by Handicap

Critical for college player benchmarking (college players ≈ 0 HCP or better):

| Distance | 0 HCP | 5 HCP | 10 HCP | 15 HCP | 20 HCP |
|---|---|---|---|---|---|
| 0-6 ft | 92.8% | 90.2% | 89.3% | 84.4% | 84.0% |
| 6-12 ft | 42.8% | 41.4% | 38.1% | 39.6% | 37.8% |
| 12-18 ft | 25.1% | 23.9% | 20.2% | 20.2% | 18.8% |
| 18-24 ft | 14.5% | 13.0% | 10.3% | 11.2% | 11.8% |
| 24-30 ft | 8.3% | 10.1% | 5.4% | 7.8% | 6.8% |
| 30+ ft | 4.3% | 4.3% | 2.8% | 3.2% | 1.9% |

3-putt rates: scratch ~3%, 5-HCP ~5.8%, 15-HCP ~11%, 20-HCP ~13%+. Source: [Shot Scope](https://shotscope.com/blog/practice-green/stats-and-data/putting-make-percentages-by-handicap-how-do-you-compare/)

---

## 4. Causal Chains — What Actually Moves Scoring

### Drive → Approach Distance/Lie → GIR
Arccos: 15-HCP hits the green 50% from 110 yds but drops below 50% by 150 yds. Each 25 yds farther from pin costs ~3-5 ft of proximity. Lie quality premium: fairway → ~65% GIR from 150; rough → ~45%; sand → ~25%. **Distance gain matters only if it doesn't increase penalty/recovery rate.**

### GIR → Scrambling Load (Inverse Coupling)
If player hits 12+ GIR, putting drives score. If 8 or fewer, **scrambling % is more predictive than putting**. "Scrambling % × greens missed" is the single most useful derived stat for sub-elite players.

### Approach Proximity → Putt Make % → Birdie Conversion
Using Tour make-% curve: 10 ft = 41% birdie chance; 20 ft = 18%; 30 ft = ~7%. **Every 5 ft closer ≈ 10-15 percentage points of conversion in the 5-15 ft zone** (steepest part of curve). Why SG:APP is the most leveraged skill.

### Lag Putting (>25 ft) → 3-Putt Avoidance
3-putts dominated by **speed control**, not line. Tour 3-putts from 25+ ft ≈ 5-8%; amateur 15-HCP ≈ 25-30%. (Source: [Golf.com 3-putt by handicap](https://golf.com/instruction/how-likely-you-are-3-putt-based-handicap/)) Second-putt distance is the proxy: leave the lag inside 3 ft and 3-putt risk drops below 5% for any skill level.

### Short Putt (3-8 ft) Performance → Round Variance
Short putts have **highest leverage per attempt** because make-vs-miss is 1 full stroke and frequency is ~6-10/round. College player who shifts 5-ft make % from 75% → 85% saves ~0.6-1.0 stroke/round.

### Penalty Strokes → Scoring
**70% of double bogeys start with a penalty or failed recovery.** (Source: [GolScore](https://golsco.app/en/blog/reduce-double-bogey)) Each penalty = 1 stroke direct + ~0.5-1 stroke recovery. For amateurs, eliminating 1 penalty/round = ~1.5 strokes. For college, each penalty is more diagnostic and tournament-decisive.

### Big-Number Avoidance
Double-bogey-or-worse holes are **#1 separator** between 70s rounds and 80s rounds for any given player. A 10-HCP averaging 3 doubles/round gives back 6 strokes on 3 holes — more than entire birdie production typically nets.

### Pressure Gap (Tournament vs Practice)
PGA Tour research (Pope & Schweitzer; Hickman & Metz) confirms **measurable choking under tournament pressure**: 4th-round scores significantly worse than 3rd round across 28 years; putts for par convert at lower rate than equivalent putts for birdie (loss aversion). For amateurs/college, practice-to-tournament gap typically **2-5 strokes** for sub-handicap players. Source: [Hickman & Metz](https://www.sciencedirect.com/science/article/abs/pii/S0167268115001110)

### Wedge Play (75-125 yd) — Biggest College → Tour Gap
Tour averages 19'7" from 100-125 yds; college typically 25-32 ft. Improving wedge proximity by 5 ft ≈ 2 percentage points of birdie conversion per wedge approach.

### Bunker Play
Tour sand save ~50%; college ~40%; 15-HCP ~20%. **Bunker vs rough surprise**: from inside 10 yds Tour pros get up-and-down 65% from sand vs 87% from clean lies — sand actually *harder* than fairway lies at that range.

### Course Management — Conservative vs Aggressive
Arccos data: amateurs systematically over-estimate driver value. **Switching to 3W/hybrid on tight holes typically costs ~10-15 yards but cuts penalty rate by 60-70%**, net-positive at scoring level for any handicap above scratch.

### Closing Holes / Back-9 Fade
**Myth on aggregate, real situationally.** Golf Insider data: average golfers score *marginally better* on back 9. The "back-9 fade" perception comes from emotional weighting of memorable collapses. However, **swing speed drops ~10% in the final 6 holes** (fatigue is real); decision quality degrades with cognitive load.

### Wind & Cold
- **Cold:** ~2 yards lost per 10°F drop on driver (USGA/Trackman). Pitching wedge: ~1.3 yds per 10°F.
- **Wind:** 10 mph headwind ≈ 10% distance loss with driver, ~15% with wedge (relative spin effect).
- **Wet/soft:** 5-10% effective distance loss on rollout; soft greens shift advantage toward high-flight, high-spin players.

---

## 5. Lie Types

| Lie | Key Effect | Skill That Matters | Expected Outcome |
|---|---|---|---|
| **Fairway** | Clean strike, full spin | Iron contact | Tour 65% GIR from 150 |
| **First cut** | Slight friction, minor flyer risk | Same as fairway | -3-5% GIR vs fairway |
| **Light rough** | Variable spin reduction, flyer possible | Hands/clubhead speed | -10-15% GIR |
| **Heavy rough** | Major spin loss, lower launch, knuckleballs | Wedge play, strength | -25-40% GIR; often forces lay-out |
| **Flyer lie** | Grass between face/ball → backspin reduced ~50% → ball flies further with no stopping power | Reading lie; club-down decision | Wedges go 10-20 yds long; mid-irons can fall short due to apex drop |
| **Buried lie** | Ball below grass plane, force-out only | Wrist strength, acceptance | Punch out short; treat as penalty |
| **Fairway bunker** | Stable lie but must clear lip; small contact margin | Clean strike, lower-lofted club | Pros: ~50% GIR if good lie; amateurs: ~20% |
| **Greenside bunker (clean)** | High skill leverage; predictable for skilled | Bunker technique, splash | Tour 50% sand save |
| **Plugged bunker** | Ball under sand, forced low/runout | Specialized technique | Save % drops ~40% |
| **Pine straw** | Surprisingly clean if ball sits up; loose impediment rules | Patience, don't ground club | Treat near-fairway |
| **Waste area / hardpan** | No grass cushion, thin/blade risk; full spin retained | Ball-first contact | Mid-iron friendly; wedge dangerous |
| **Divot** | Reduced bounce, lower launch, more spin | Hands ahead, steeper strike | Expect -1 club, lower flight |
| **Mud ball** | Mud deflects flight unpredictably (away from mud side) | Acceptance | High variance; play to fat side |
| **Wet lie** | Splash-out, reduced energy transfer | Steeper attack | ~10-15% distance loss |

**The flyer warning is the most important practical lie heuristic:** light/medium rough with grass standing up behind ball + dry conditions = expect 10-20 yards extra and no stopping power. Sources: [Golf.com flyer explanation](https://golf.com/instruction/what-is-flier-lie-golf/); [Golf Loopy spin physics](http://www.golfloopy.com/golf-ball-spin-playing-from-the-rough-and-flyer-lies/)

---

## 6. Shot Types & Shot Decisions

### Tee Club Selection
- **Driver:** when fairway wide enough to absorb miss dispersion AND distance unlocks meaningfully shorter approach club
- **3-Wood/Hybrid:** narrow corridor, water/OB in driver landing zone, dogleg where extra distance runs through fairway
- **Long iron (2-4i):** stinger conditions (wind), extremely narrow par-4s where position matters more than distance

**Rule of thumb (Arccos):** if downgrading from driver costs <20 yds but cuts penalty rate by 50%+, it's correct for most golfers.

### Approach Club Selection
- **Long iron:** workable shape, lower trajectory, harder to launch — best for high swing speed players
- **Hybrid:** higher launch, soft landing, more forgiving — most college players gain SG by switching long irons to hybrids
- **Fairway wood:** par-5 second shots when reachable

### Wedge Gapping (Standard Setup)

| Club | Loft | Amateur Male Carry | College Male Carry |
|---|---|---|---|
| PW | 44-46° | 110-130 yds | 130-145 |
| GW | 50-52° | 90-110 yds | 110-125 |
| SW | 54-56° | 70-90 yds | 90-110 |
| LW | 58-60° | <70 yds | 70-90 |

Target ~10-15 yd gaps between wedges. Sources: [Golf Digest wedge lofts](https://www.golfdigest.com/story/everything-you-need-to-know-about-wedge-lofts); [MyGolfSpy wedge gapping](https://mygolfspy.com/news-opinion/instruction/wedge-gapping-chart-by-handicap-distance-lofts-and-trends/)

### Specialty Full-Swing Shots
- **Punch shot:** wind under, low trajectory, ball back, abbreviated finish
- **Stinger:** very low launch (3i/4i) under wind, advanced; ball back, hands forward, hold release
- **Knockdown:** 3/4 swing, less spin, lower flight — single most underused shot among college players in wind

### Around the Green Decision Tree
- **Lie tight + clean roll-path + green firm:** putt from off ("Texas wedge") — highest-probability play
- **Lie tight + must carry rough/fringe:** bump-and-run with 7i-9i
- **Lie cushioned + green sloping away or firm:** pitch with PW/GW
- **Short-sided + green slopes away + good lie:** lob/flop with 58-60° — high-variance, only when no other option
- **Plugged lie / wet rough:** sand wedge open face, splash technique

---

## 7. Hole Context

### Par-3 Length Tiers
- Short (<175): GIR target ~75%+; pin-hunting acceptable
- Mid (175-210): GIR ~60-65%; play to safe quadrant
- Long (210+): Tour avg ~50% GIR; center-green is percentage play

### Par-4 Length Tiers
- Short (<380): scoring hole; aggressive; driver may not be needed
- Mid (380-440): standard distribution; ~70% GIR achievable
- Long (440+): bogey-equivalent for high handicaps; GIR target ~50%; long-iron approaches drop proximity dramatically

### Par-5 Reachability
- **Reachable in 2:** birdie expectancy ~35-40% Tour; eagle ~6%
- **Lay-up only:** birdie expectancy ~25-30%; lay-up to **favorite wedge yardage**, not nearest to green (Arccos: 80-100 yd lay-up beats 30-50 yd lay-up for most amateurs)

### Hazard Effects
- **Water/OB in landing zone:** 10% penalty rate adds ~1 stroke to expected hole score
- **Greenside bunker placement:** short-sided pin (bunker between ball and pin) raises scrambling difficulty ~20%
- **Fairway bunker in landing zone:** functionally equivalent to 25-yd FW miss + lie penalty
- **Dogleg with inside trouble:** cut corner only if carry distance + dispersion margin clears safely 80%+ of time

### Green Characteristics
- **Stimp 10:** typical municipal — speed manageable
- **Stimp 12-13:** tournament/college championship pace; 3-putt rate roughly doubles
- **Firmness:** firm greens punish high approach players, reward runners
- **Slope (back-to-front vs crowned):** front-pin on crowned green = highest 3-putt risk

---

## 8. Course Type → Skill Premium

| Course Type | Conditions | SG Premium |
|---|---|---|
| **Links** | Wind, firm-and-fast turf, low ball flight, undulating greens, putting from off green common | SG:OTT (ball placement under wind), SG:ARG (creative chips/putts), SG:PUTT (long lag putting) |
| **Parkland** | Soft greens, lush rough, tree-lined, target golf | SG:APP (proximity matters most), SG:PUTT |
| **Desert** | Forced carries, firm fast, accuracy critical, OB everywhere | SG:OTT (penalty avoidance), SG:APP |
| **Mountain/Elevation** | Distance recalibration (~10% gain per 5,000 ft altitude), sloped putts | Club-selection IQ, SG:APP |
| **Tropical** | Humidity (slight distance loss), wind/rain, soft conditions, bermuda grain | SG:APP (high spin), SG:PUTT (grain reading) |

Links vs parkland data: links golfers get up-and-down from bunkers ~20% more often, use putter from 30+ yds, consistently show better short-game proximity. Source: [Shot Scope / Troon links vs parkland](https://troon.com/shot-scope/articles/links-vs-parkland)

---

## 9. Mental Game / Pressure

### Tournament vs Practice Gap
- PGA Tour: significant 4th-round vs 3rd-round scoring difference across 28 years (Hickman & Metz, 2015)
- Tour pros putt **for par worse than for birdie** of equal distance (loss-aversion — Pope & Schweitzer, *Is Tiger Woods Loss Averse?*, AER 2011)
- College/amateur: typical 2-5 stroke practice-to-tournament gap; widens with handicap

### Choking Mechanics
Biomechanical chain: pressure → cortisol/tension → grip tightening → decel through impact → short-putt miss (push or pull) + tentative wedge contact (chunk or thin). Most measurable on putts 4-8 ft ("knee-knockers").

### Recovery After Bad Hole
After double bogey, average golfer score on next hole is **0.3-0.5 strokes worse than baseline**. "Bounce-back" (birdie after bogey) is Tour-tracked; Tour avg ~20%; elite ~24%.

### Opening / Closing Holes
- **First-tee jitters:** opening hole ~0.1-0.15 strokes worse than round avg on Tour; larger for amateurs
- **18th hole:** marginally harder than course-avg hole for Tour; pressure adds ~0.1 strokes when in contention
- **Holes 13-17 ("back nine pressure"):** Tour pros with lead choke at measurable rate; amateurs lose ~10% swing speed in final 6 holes (fatigue dominates)

Sources: [Hickman & Metz pressure study](https://www.sciencedirect.com/science/article/abs/pii/S0167268115001110); [Front-9 vs Back-9 data study](https://golfinsideruk.com/front-9-vs-back-9-scoring/); [Golf Monthly fatigue](https://theleftrough.com/golf-fatigue/)

---

## 10. Coachable vs Uncoachable & Improvement Windows

### Highly Coachable (Weeks-to-Months)
- **Putting (all distances):** GolfTec data shows measurable 3-putt reduction within 2-4 weeks of focused work
- **Wedge proximity (75-125 yd):** distance control improves quickly with launch-monitor feedback (4-8 weeks)
- **Bunker technique:** discrete skill, fast to acquire
- **Course management / decision-making:** instant — strategy changes don't require physical change
- **Pre-shot routine consistency:** weeks

### Moderately Coachable (Months-to-Years)
- **Iron ball-striking / SG:APP:** swing technique changes typically take 3-6 months to bed in
- **Short-game shot variety (flop, bump):** months of reps
- **Pressure performance:** simulation training works but slow

### Slow / Limited (Years or Innate)
- **Driving distance:** swing-speed gains <2 mph/year typical for adults; college-age can add 5-10 mph in 2 years with structured speed training (Stack, SuperSpeed)
- **Driver accuracy at high speed:** highly correlated with talent ceiling
- **Putting touch on long lag putts:** improvable but plateau common

### Typical Improvement Curves
- GolfTec aggregate data: **~7-stroke improvement within 1 year of consistent lessons** for committed students
- College players plateau most often on **wedge proximity and pressure putting** — not driving
- Equipment fitting: 1-3 strokes of latent improvement for un-fit players, single biggest one-time gain available

### Why Plateaus Happen
Three causes: (1) **technique ceiling** — without video/launch monitor feedback, errors get grooved; (2) **practice quality** — block range practice doesn't transfer to course; (3) **mental skills** lag physical ones, so range numbers exceed course numbers indefinitely without competitive reps.

---

## ENGINE IMPLICATIONS (CONSTRAINTS)

1. **Use SG categories as the spine of all skill assessment** — not traditional GIR/FW/putts.
2. **Baselines must be context-aware** — college baselines (~73 scoring avg, ~62% FW, ~62% GIR, 30 putts) not Tour baselines for player comparison.
3. **Make-% by distance is canonical putting chart** — Shot Scope handicap-bracket curves for amateur context, Tour curves as aspiration ceiling.
4. **Causal claims ALLOWED:** SG:APP drives birdie conversion via proximity; penalty rate drives big-number rate; lag distance drives 3-putt rate; short-putt make % drives scoring variance.
5. **Causal claims NOT ALLOWED** without further data: "mental toughness" scores, "clutch" labels, swing-mechanics inferences from outcome data alone.
6. **Improvement framing:** prioritize wedge-proximity, short-putt %, penalty reduction, lag-distance for fast wins; treat driving distance as long-horizon project.
7. **Course-context modifiers required:** links/parkland/desert weighting; wind/temperature distance adjustments; green-speed × 3-putt-rate interaction.
8. **Pressure adjustment** is real and measurable — engine compares tournament rounds vs practice/qualifying rounds separately when surfacing trends.

---

## SOURCES

- [Mark Broadie — *Assessing Golfer Performance on the PGA TOUR* (Columbia paper)](https://columbia.edu/~mnb2/broadie/Assets/strokes_gained_pga_broadie_20110408.pdf)
- [Golfity — Mark Broadie biography](https://golfity.com/en/blog/mark-broadie-the-creator-of-strokes-gained/)
- [Golf.com — Mark Broadie profile](https://golf.com/travel/the-man-with-two-brains-stokes-gained-guru-mark-broadies-pioneering-analytics-have-radically-altered-the-game/)
- [USGA — Importance of Strokes Gained](https://www.usga.org/content/usga/home-page/articles/2024/03/importance-of-strokes-gained-statistic.html)
- [Columbia Business School — Mark Broadie profile](https://business.columbia.edu/insights/business-society/golf-guru)
- [PGA Tour Stats — Strokes Gained](https://www.pgatour.com/stats/strokes-gained)
- [PGA Tour Stats — Putting](https://www.pgatour.com/stats/putting)
- [PGA Tour Stats — Off the Tee](https://www.pgatour.com/stats/off-tee)
- [PGA Tour Stats — Approach the Green](https://www.pgatour.com/stats/approach-green)
- [PGA Tour Stats — Around the Green](https://www.pgatour.com/stats/around-green)
- [PGA Tour 50-125 yard approach detail](https://www.pgatour.com/stats/detail/340)
- [Data Golf — 2026 SG leaders](https://datagolf.com/stats)
- [Data Golf — True SG Query Tool](https://datagolf.com/true-sg-query)
- [USGA 2024 Distance Report](https://www.usga.org/content/dam/usga/images/equipment-standards/2024-distance-report/2024-Distance-Report.pdf)
- [Golf.com — PGA Tour putt make % by distance (Dethier)](https://golf.com/instruction/putting/pga-tour-putting-make-percentages-distance/)
- [Shot Scope — Putting make % by handicap](https://shotscope.com/blog/practice-green/stats-and-data/putting-make-percentages-by-handicap-how-do-you-compare/)
- [Shot Scope — 15hcp Law of Averages](https://shotscope.com/blog/practice-green/game-improvement/reduce-your-handicap-15hcp/)
- [Shot Scope — Strokes Gained ebook](https://shotscope.com/ebook/Strokes_Gained.pdf)
- [Arccos — Distance vs Accuracy study](https://www.arccosgolf.com/blogs/community/does-distance-or-accuracy-matter-more-in-golf-the-data-decides)
- [Arccos — Chances of hitting green by distance](https://www.arccosgolf.com/blogs/community/from-this-distance-you-have-a-50-chance-of-hitting-the-green)
- [Arccos — Pros vs Joes 3-putt analysis](https://www.arccosgolf.com/blogs/community/pros-vs-joes-analyzing-3-putts)
- [Arccos — Top 3 approach stats](https://www.arccosgolf.com/blogs/community/top-3-approach-stats-to-know-about-your-golf-game)
- [NCSA Sports — Men's college golf recruiting](https://www.ncsasports.org/mens-golf/recruiting-guidelines)
- [Golf Globally — 2024 college scoring averages (Clippd)](https://www.golfglobally.com/college-golf-scoring-averages)
- [Clippd College Scoreboard](https://scoreboard.clippd.com/)
- [Golfstat — College golf stats](https://golfstat.com/)
- [Golf.com — 3-putt rate by handicap](https://golf.com/instruction/how-likely-you-are-3-putt-based-handicap/)
- [Golf Monthly — 3-putt vs 1-putt distance precipice](https://www.golfmonthly.com/features/golfs-putting-precipice-at-what-distance-is-a-3-putt-more-likely-than-a-1-putt)
- [MyGolfSpy — Putting make % by handicap](https://mygolfspy.com/news-opinion/putting-make-percentage-by-handicap-full-chart-are-you-above-or-below-average/)
- [Foy Golf Academy — Putting stats by handicap](https://foygolfacademy.com/putting-statistics/)
- [Golf.com — Flyer lie explanation](https://golf.com/instruction/what-is-flier-lie-golf/)
- [Golf Loopy — Ball spin physics from rough and flyer lies](http://www.golfloopy.com/golf-ball-spin-playing-from-the-rough-and-flyer-lies/)
- [Golf Monthly — Bunker vs rough miss data](https://www.golfmonthly.com/features/is-it-better-to-miss-the-green-in-the-bunker-or-rough-the-data-is-clear-cut)
- [Golf Digest — Wedge lofts complete guide](https://www.golfdigest.com/story/everything-you-need-to-know-about-wedge-lofts)
- [MyGolfSpy — Wedge gapping chart by handicap](https://mygolfspy.com/news-opinion/instruction/wedge-gapping-chart-by-handicap-distance-lofts-and-trends/)
- [Troon / Shot Scope — Links vs Parkland data](https://troon.com/shot-scope/articles/links-vs-parkland)
- [Golf.com — Cold weather distance formula](https://golf.com/instruction/cold-weather-golf-ball-formula-yardages/)
- [Hickman & Metz — *The Impact of Pressure on Performance: PGA Tour evidence*](https://www.sciencedirect.com/science/article/abs/pii/S0167268115001110)
- [Pope & Schweitzer — Choking under pressure on PGA Tour](https://www.tandfonline.com/doi/abs/10.1080/01973533.2012.655629)
- [Golf Insider — Front-9 vs Back-9 data study](https://golfinsideruk.com/front-9-vs-back-9-scoring/)
- [The Left Rough — Late-round fatigue](https://theleftrough.com/golf-fatigue/)
- [GolScore — Why reducing double bogeys changes everything](https://golsco.app/en/blog/reduce-double-bogey)
- [Golf.com — Strokes you can drop in a year (GOLFTEC data)](https://golf.com/instruction/strokes-you-can-expect-drop-after-year-lessons/)

---

**This document is referenced by `docs/v3-master-plan.md` and every v3 generator's causal claims must trace back to a finding here.**
