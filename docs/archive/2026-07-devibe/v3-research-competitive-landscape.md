# CoachHelm v3 — Competitive Landscape Reference
*College golf analytics market analysis · May 2026*

This document is the source of truth for who we're competing with, what they do, where we differentiate, and what we risk copying. Every "this is white space" or "this is table stakes" claim in the master plan traces back here.

---

## Executive Context (READ FIRST)

Two market-defining events have reshaped the landscape since 2023:

1. **NCAA dropped Golfstat after ~30 years (May 2023)**, awarded the official scoring contract to **Spikemark**, which crashed on day one and was non-functional for most of the 2023 fall season. Coaches reverted to **pen, paper, text screenshots, and Google Sheets**.
2. **The NCAA handed the contract to Clippd in October 2023**, and Clippd launched **"Scoreboard powered by Clippd"** in 2024 — making Clippd both the **official scoring/rankings authority** AND the **leading performance-analytics platform** (200+ college programs as of 2025-2026). Rare moment of vertical integration in the category.

**Translation:** Clippd is no longer just an analytics vendor — they are infrastructure. Any competitor that wants college coaches has to play around (or under) Clippd.

---

## 1. Clippd (PRIMARY THREAT)

**Who it's for:** Elite-to-aspirational college programs + player/coach SaaS tier. 200+ college programs including Stanford and Wake Forest women (last two NCAA D1 champs), Georgia Tech and Florida State men.

**Core offering:** Shot-by-shot performance analytics built around two proprietary 0-200 metrics — **Shot Quality** (how good one shot was, normalized for conditions, course difficulty, lie, weather, altitude) and **Player Quality** (skill estimator from CASE algorithm, where 100 ≈ PGA Tour and 108 ≈ Tour top-25). Now also the official scoring & rankings home of NCAA/NAIA/NJCAA college golf via Scoreboard.

**Top 3 features users actually use:**
- **"What To Work On"** — personalized, data-driven priority list per player with a menu of practice drills (Golf Monthly calls it "Clippd's most powerful feature")
- **Coach dashboards organizing players by skill level, form, trends** with progress tracking
- **Scoreboard / ScoreboardLive** — live tournament scoring + official NCAA rankings (Mark Broadie's algorithm) — essentially the NCAA's official college golf homepage now

**Pricing (verified from clippd.com/pricing):**
- Player: $25/mo, $135/6mo, **$240/yr**
- Coach: $150/quarter, **$480/yr**
- College team Early-Bird: **$2,200/yr** (ends July 31)
- Men's & Women's combined: **$3,960/yr**
- Single team: $2,440/yr (includes 2 coach seats, full roster, onboarding)
- ScoreboardLive scoring: $395/tournament

**What users love:**
- "Incredible level of insight" — corrects misconceptions about your own game
- Beautiful design, polished UI
- Aggregates from Arccos, Garmin, TrackMan, Full Swing KIT (Jan 2025 partnership added Shot Quality to KIT launch monitor)
- One user: "Easy to use, uses AI to tell me exactly what I need to work on…lowered handicap 15% in nine months" ([App Store](https://apps.apple.com/us/app/clippd-golf-data-analysis/id6444164123))

**What users complain about:**
- **Manual entry pain** if you don't own Arccos/Garmin — "potentially tedious" (Golf Monthly)
- **Strokes Gained metrics are hard to interpret** inside the platform (Golf Monthly)
- **Advanced Analytics (team-v-team, player-v-player) locked behind Pro tier**
- **Scoreboard Standard lacks Smart Scheduler** — coaches asked for tee-sheet generation; Clippd said "coming in phase 2"
- Public discourse around Clippd reveals **no native AI chat / no LLM round narrative** — their "AI" branding is the CASE algorithm + practice-priority recommender, not a conversational coach
- Coach Portal explicitly described as "first release with more functionality coming soon"

**Where they're vulnerable:**
- **No conversational/LLM layer** — round summaries are static dashboards, not narrative explanations
- **Practice "What To Work On" is data-driven but not coach-curated or goals-aware** — surfaces weaknesses but doesn't tie them to a player-set objective or season arc
- **No outcome causality** ("why did your score change from last week" — currently a chart, not a thesis)
- Coach-player chat is comment-thread on posts, not a workflow surface
- Their attention is split — running official NCAA scoring infrastructure is a distraction from deepening the coaching product

Sources: [Clippd Coaches](https://www.clippd.com/coaches), [Pricing](https://www.clippd.com/pricing), [Shot Quality methodology](https://www.clippd.com/post/shot-quality-and-player-quality-clippds-new-performance-metrics), [Golf Monthly review](https://www.golfmonthly.com/reviews/golf-tech-and-training-aids/clippd-review), [NCAA selects Clippd](https://www.ncaa.com/news/golf-men/article/2023-10-16/clippd-selected-manage-ncaa-golf-scoring-and-rankings)

---

## 2. Golfstat

**Who it's for:** Historically every NCAA/NAIA/NJCAA program. **Lost NCAA contract in 2023.** Resurged 2024-2025 as individual tournaments voluntarily returned to it after Spikemark failed.

**Core offering:** Tournament scoring software (free to NCAA/NAIA/NJCAA programs), Adjusted Ratings rankings, official NCAA Championship scorer (legacy).

**Top 3 features:** Live tournament scoring, Adjusted Ratings (scoring average vs par normalized to par 72 vs the field), paperless on-course score verification.

**Pricing:** Free to schools for scoring software; historical data subscription separate.

**What users love:** Reliability — one coach quoted: "It worked pretty well. I never had any issues" ([Monday Q article](https://www.mondayq.com/posts/ncaa-we-have-a-problem)).

**What users complain about:**
- **Stats limited to scoring/FIR/GIR/putts** — "the three stats that matter most" per their own blog, which is exactly the 1990s view
- **No strokes gained, no shot-level data, no player development view**
- Outdated UI / coaches' corner is literally cold-fusion era CFM URLs (`golfstat.com/index.cfm?event=public.coaches`)
- Historical data 2021-22 and earlier became inaccessible during the transition chaos

**Where they're vulnerable:** They're already losing — a scoring engine in an analytics era. Sources: [Golfstat](https://golfstat.com/), [Monday Q: NCAA we have a problem](https://www.mondayq.com/posts/ncaa-we-have-a-problem)

---

## 3. Golf Genius (Tournament Management)

**Who it's for:** Tournament operators globally — 41M rounds across 1.33M events at ~11,000 facilities in 2025. NCAA events run on GG. Acquired CoachNow (now "CoachNow Academy by Golf Genius").

**Core offering:** Tournament management infrastructure (registration, pairings, live scoring, leaderboards). Not a player-analytics product.

**Top 3 features:** Bulletproof tournament operations, live scoring across NCAA/NAIA, native handicap/roster import.

**Pricing:** Not publicly listed; B2B enterprise per-facility/per-event.

**What users love:** 97% subscriber retention in 2025, 100% uptime, 325+ new features shipped in 2025.

**What users complain about:** Operations software, not coaching software. Analytics depth is event-scoped, not season/player-arc-scoped.

**Where they're vulnerable to CoachHelm:** Not really head-to-head — but distribution channel risk if they bundle CoachNow Academy + GG TM and pitch same coaches with "good enough" analytics tile.

Source: [GG 2025 momentum](https://golfgenius.com/resources/2025-tm-momentum)

---

## 4. CoachNow (now CoachNow Academy by Golf Genius)

**Who it's for:** 1M+ coaches and athletes across 60+ sports, 140+ countries. Heavy use by individual golf instructors; less so by college teams as primary tool.

**Core offering:** Video analysis + coach-athlete communication around "Spaces" (per-athlete training feeds with posts, video, notes, feedback). 2025 added scheduling, billing, packages, view tracking, read receipts.

**Top 3 features:**
- **AI Skeleton Tracking** + slow-mo (240 fps) video analysis
- **Spaces** (athlete-specific training feeds)
- **Multicam** (multiple angles per swing, launched 2025)

**Pricing:** Custom via golfgenius.com sales contact.

**What users love:** Best-in-class video review UX, deep integrations (SwingU for on-course stats, USGA handicap, launch monitors).

**What users complain about:** Not native to golf-specific scoring/strokes gained/tournament context. Communication is post-and-comment, not workflow-integrated.

**Where they're vulnerable:** Their analytics are someone else's data piped in. A video + communication layer, not a thinking-about-golf layer.

Sources: [CoachNow](https://coachnow.com/), [CoachNow Academy launch](https://golfgenius.com/resources/news/cnacademyrelease)

---

## 5. Arccos Caddie

**Who it's for:** Recreational golfers + free **Arccos Coaches Dashboard** for instructors and college coaches (USC, Alabama, Oklahoma State, FAMU, Howard signed up). New users reportedly drop ~5 strokes in year one.

**Core offering:** Club-grip sensors auto-detect shots, sync to app with strokes gained + AI Caddie club recommendations factoring wind, elevation, temp. Plus free Coaches Dashboard with shot-by-shot review.

**Top 3 features:**
- **Strokes Gained Analytics** (de facto consumer-grade SG product)
- **AI Caddie** club + target recommendations
- **Apple Watch + Arccos Air + Smart Laser** (removed need for phone in pocket)

**Pricing:** Sensors ~$200, **$155.88/yr** ($99/yr after year 1). $12.99/mo. **Coaches Dashboard is free** for instructors.

**What users love:** Pluggedin Golf, Golf Monthly, MyGolfSpy all positive. Auto-capture works without thinking.

**What users complain about (GolfWRX, Golf Monthly):**
- **~90% shot-detection accuracy** — minor misses (tap-ins) common, occasional major errors (a 120-yd shot logged as 360-yd drive onto green) ([GolfWRX review](https://www.golfwrx.com/379408/review-arccos-and-arccos-driver/))
- **Sensors fall off** — users dump bags 3-4× per round to find them; dead batteries common
- **"New strokes gained format is confusing"** — users miss the simpler old version
- **Phone-in-pocket requirement** despite Air/Watch workarounds
- **$300 first-year cost is a barrier**

**Where they're vulnerable:** Hardware-dependent, data is shot-only (no practice, no fitness, no strategy, no goals), "AI" Caddie is club recommender not a coach. Source: [Arccos Coaches Dashboard](https://www.arccos.coach/), [Plugged In review](https://pluggedingolf.com/arccos-caddie-review/)

---

## 6. Shot Scope

**Who it's for:** Cost-conscious recreational golfers who don't want subscriptions.

**Core offering:** GPS watches (X5, V5) + club tags + free desktop dashboard. No subscription.

**Top 3 features:** Watch-based GPS (no phone), tag-based shot tracking, web dashboard with strong filters.

**Pricing:** Hardware-only, **no subscription** ($229-$329 range). Lifetime data access.

**What users love:** Wickedsmartgolf: "Shot Scope wins the data battle with more comprehensive shot tracking analytics" on raw data + filters. No subscription = no resentment.

**What users complain about:** App "less responsive" than Arccos, UX less polished, weaker AI/strategy features.

**Where they're vulnerable:** No coach-side workflow. No college-team product. Source: [Wickedsmartgolf](https://www.wickedsmartgolf.com/blog/shotscope-vs-arccos-golf)

---

## 7. TheGrint

**Who it's for:** Recreational handicap-focused players with social bent. USGA-licensed handicap affiliate in US.

**Core offering:** Handicap calculation + 18+ stat modules + GPS for 40K courses + golf-society community.

**Pricing:** Freemium, Pro tier competitively priced.

**What users love:** Best-in-class customer service, pro tier delivers strong value.

**What users complain about:** GPS occasionally fails to provide distances.

**Where they're vulnerable:** Not a coaching product. Source: [TheGrint](https://thegrint.com/)

---

## 8. 18Birdies

**Who it's for:** Mass-market recreational golfers; 45K courses. Premium $60-$90/yr.

**Core offering:** Free GPS + scoring + social/gamification + a **direct LLM competitor**: 18Birdies AI Coach.

**Top 3 features:**
- **AI Coach** — uploads swing video → AI auto-trims → color-coded swing feedback in seconds → prescribes drills based on "the single fix that would cascade the most other improvements"
- **Side-by-side swing comparison** with pros (real-time)
- **Gamification** — badges, Golf Bucks → scratch tickets → prize redemption, group leaderboards, Scramble/Best Ball/Alt Shot side games

**What users love:** GolfWRX members and MyGolfSpy reviewers praise AI Coach as "pretty dang cool" with appropriate, helpful drill prescriptions.

**What users complain about:** Casual aesthetic doesn't translate to elite players.

**Where they're vulnerable:** Wrong demographic — but their AI Coach UX is the closest existing product to a "coach chat" experience, and college players see it because it's free.

Sources: [18Birdies AI Coach](https://18birdies.com/aicoach/), [GolfWRX member reviews](https://forums.golfwrx.com/topic/1747782-member-reviews-18birdies-ai-coach-see-what-members-are-saying/)

---

## 9. DECADE Golf (Scott Fawcett) — UNEXPECTED STRATEGIC PEER

**Who it's for:** Strategy/decision-making methodology used by **1,000+ college players, 50+ Tour pros, 500+ instructors**. Direct college team product.

**Core offering:** Course-management framework (Distance, Expectation, Correct Target, Analyze, Discipline, Execute) backed by Mark Broadie-era shot pattern math. Delivered via video, an app (DECADE powered by BirdieFire), yardage books, and Combines (skill tests).

**Top 3 features:**
- **Tour-grade strategy methodology** taught via video + drills
- **Unlimited yardage books for every course**
- **Combines + Driving Target** — skill testing + satellite-based course mapping in 5-10 min

**Pricing — the killer datapoint for CoachHelm:**
- Foundations: $125/6mo, Elite: $250/6mo
- **DECADE for Colleges: $1,499/team/year** (vs Clippd's $2,440)
- Add-ons: **TEAM Elite $349** (qualifying leaderboards, custom reporting, trend analysis, viz), **PRACTICE Rx $199** (auto-generated practice + Game Improvement practices per player)

**What users love:** Will Zalatoris went from world #3,000 junior to #3 in three months on the system. NCAA once banned Fawcett from doing team seminars for "unfair competitive advantage." 20-40% handicap reduction claims.

**What users complain about:** Heavy mental-model investment; not a real-time analytics platform.

**Where they're vulnerable:** App layer is light vs methodology. Practice Rx auto-generation is a direct shot at the same surface CoachHelm wants to own — but it's drill-library-driven, not goals/cadence/outcome-causality driven.

**Note for CoachHelm:** Many of your players' coaches *already teach the DECADE mental model*. Your analytics will be evaluated through that lens. Either integrate the vocabulary (start lines, expected zones, OB %, doubles avoidance) or risk feeling theoretically inferior.

Sources: [Decade for Colleges](https://decade.golf/college/), [Decade memberships](https://decade.golf/memberships/), [GCAA Q&A with Fawcett](https://gcaa.coach/news/564-golf-qaa-scott-fawcett-of-decade)

---

## 10. AimPoint / AimPoint Express

**Who it's for:** Pros, college players, serious amateurs learning green reading. Taught only by certified instructors.

**Core offering:** Methodology, not software. Feet-feel slope (1-5 scale) → finger-count to aim point → start line.

**No app, no analytics layer, no measurement of skill acquisition.** Biggest gap in the category: no product tracks AimPoint skill development against putting outcomes. Sources: [AimPointGolf.com](https://aimpointgolf.com/), [Golf.com explainer](https://golf.com/instruction/putting/aimpoint-green-reading-basics-30-seconds/)

---

## 11. TrackMan Performance Studio

**Who it's for:** Elite practice environments (academies, college indoor facilities, Tour pros).

**Core offering:** Launch monitor + simulation + Performance Center practice modes (strokes gained, skill-based drills, structured environments designed for transfer to course). **Tracy AI assistant** interprets data and suggests improvements.

**Top 3 features:** Shot Analysis (ball speed, launch, spin, etc.), Performance Center practice with SG, Tracy AI for drill suggestions.

**Pricing:** Enterprise (launch monitor $20K+).

**What users love:** Industry-standard ball-flight data; Performance Center "immensely popular with pros."

**What users complain about:** Hardware-bound, expensive, indoor/range-only — doesn't follow player to course.

**Where they're vulnerable:** Range data doesn't natively roll into course outcome causality. Tracy is a drill recommender, not a coach. Source: [TrackMan Performance Center guide](https://support.trackmangolf.com/hc/en-us/articles/37847865938971-Practice-Guide-to-the-Performance-Center)

---

## 12. Hudl

**Who it's for:** Industry standard in team sports video (HS + college football, basketball, soccer, etc.). Has **Hudl Technique Golf** — but it's a consumer slow-mo swing tool at $7.99/mo, not a college team product.

**Core offering:** Video tagging, annotation, telestration, playlist sharing, Hudl Assist auto-tagging, recruiting highlight reels.

**Top 3 features:** Hudl Sportscode for code-and-share, Hudl Studio telestration, distribution/presentation tools for team review.

**Pricing:** Tiered by org type (HS, club, college). Sportscode is enterprise.

**What users love:** Industry default — every college SID and coach already knows how to use it.

**What users complain about:** Not built for golf. Hudl Technique Golf is essentially abandoned ware.

**Where it informs CoachHelm:** The **coach-comment-on-exact-video-moment + share-as-playlist** workflow is the gold standard, and college coaches expect that fluency. Sources: [Hudl Sports](https://www.hudl.com/sports), [Hudl Technique Golf](https://justuseapp.com/en/app/581759921/hudl-technique-golf)

---

## 13. Whoop — STEAL FROM THIS

**Who it's for:** Athletes + growing team-coach product. **Vector Connect** is a third-party WHOOP team dashboard used in college athletics (University of Miami Football case study — 20% HRV increase season-over-season).

**Core offering:** Recovery score, HRV, sleep, strain. Coach team dashboard with PROTECT/MONITOR/READY status, ACWR (acute-chronic workload ratio), overreach detection. Weekly Monday email summary.

**Top 3 features:** Daily readiness color-coding, weekly trend email, AI coach that ties readiness to training decisions.

**What users love:** Players don't have to think — band collects, platform thinks. Coaches get one number per athlete per morning.

**What CoachHelm should steal from this immediately:**
- **The "one-glance team status" view** (every player a color tile)
- **The weekly Monday summary email** (who trended up, who flagged, who needs a conversation)
- **Tying recovery → training prescription → outcome** — closest existing model to outcome-causality reasoning

Sources: [Vector Connect](https://connect.sportsvector.co/), [WHOOP AI Coach](https://www.athletedata.health/guides/whoop-recovery-coach), [Miami case study](https://coya.life/miami-football-partners-own-it-whoop/)

---

# SYNTHESIS

## 1. Who Owns College Golf Coaching Today

**Clippd owns the high end. Everyone else is fragmented.** Actual stack a 2026 college coach uses on any given week:

| Surface | Tool |
|---|---|
| Official tournament scoring + rankings | **Clippd Scoreboard** (since 2024) |
| Player shot-level analytics | **Clippd** (200+ programs) or Arccos Coaches Dashboard |
| Strategy/course mgmt methodology | **DECADE** ($1,499/team — 1,000+ college players) |
| Video review/coach feedback | **CoachNow** / Hudl Technique / Onform |
| Range/launch monitor practice | **TrackMan Performance Studio** |
| Qualifying tracking + travel selection | **Google Sheets** (still — this is real) |
| Daily coach-player comms | Group text + CoachNow Spaces |
| Practice planning | Whiteboard + DECADE Combines + Clippd "What To Work On" |

**Why Clippd won:** they were the best analytics tool when NCAA needed emergency replacement for Spikemark, so they got the official scoring contract — which now drives mandatory daily usage by every D1 program. Distribution advantage is enormous. **But their coaching product is still described in their own community as "first release with more functionality coming soon."**

Golfstat is legacy fallback. Spreadsheets are still the unspoken truth for qualifying.

---

## 2. Table Stakes (Must-Have or Look Amateur)

1. **Strokes Gained** — broken into OTT / APP / ARG / PUTT minimum, ideally with distance/lie sub-buckets
2. **Course-normalized shot quality** — Clippd set the standard with conditions/altitude/weather/lie adjustments. Raw score alone now looks naive
3. **Auto-ingest from Arccos and Garmin** — manual entry was #1 Clippd complaint. Manual-only = DOA for elite programs
4. **PGA Tour benchmark comparison + ability to compare to other tiers** (juniors, elite amateurs, college peers)
5. **Coach roster dashboard** — every player one row, sortable by trend, form, last round
6. **Live tournament leaderboard** integration (you don't need to be the scorer, but you need to display Scoreboard/Golfstat/Golf Genius results inline)
7. **Mobile + web** — players live on phone, coaches do triage on laptop
8. **Video at least good enough** to attach to a note (don't have to beat Hudl/CoachNow, but can't be absent)
9. **Practice drill library** tied to identified weaknesses (Clippd, DECADE Practice Rx both have this)

---

## 3. White Space — What No One Is Doing Well

Real gaps verified across the research:

1. **Conversational LLM round review** — nobody has it. Clippd has dashboards. 18Birdies has AI swing analysis (single video). TrackMan has Tracy (single drill suggestion). **None sit down with the player and narrate "here's what happened in your round, here's why, here's what to do tomorrow."** GolfWRX has a thread of players manually pasting their data into ChatGPT — literal user-discovered unmet need.
2. **Outcome causality** — every platform shows trends. None explain *why* the trend exists ("your putting average dropped 0.4 because you switched to bermuda greens for 3 tournaments, not because your stroke changed"). Killer LLM use-case.
3. **Goals workflow as first-class object** — Clippd's "What To Work On" is data-derived weaknesses. DECADE has Combines. Nobody has player-set, coach-approved, measurable goals that drive what the system surfaces. Whoop has closest analog (recovery → training prescription) but nothing in golf.
4. **Composite insights across data sources** — Clippd aggregates but reports independently. No one generates "your range carry was consistent this week but your scoring suffered because your start lines on holes #4 and #11 don't match your range pattern."
5. **Coach-player chat tied to data** — Clippd has post-and-comment. CoachNow has Spaces. Nobody has chat where the LLM is a third participant referencing the player's stats in context.
6. **AimPoint and green-reading skill tracking** — completely absent. AimPoint has 0 software footprint.
7. **Qualifying & travel selection** — coaches still in Google Sheets. Most-shipped, most-painful workflow with worst tooling.
8. **Player genome / "this is who you are as a golfer"** — Player Quality is one number. Nobody has built multi-dimensional player identity model.
9. **Mental/sleep/recovery integration** — Whoop owns this elsewhere, no golf-native tool has crossed over.
10. **Standing benchmarks "PGA + team + you"** — Clippd compares to PGA. UpGame compares to peers. Nobody renders **three bars in one chart: PGA Tour, your team's average, you** — psychologically devastating in the right way for elite-aspiring players.

---

## 4. Where CoachHelm IS Differentiated

| CoachHelm | Closest competitor | Gap |
|---|---|---|
| **LLM round review** | 18Birdies AI Coach (single swing video) | Nobody does round-narrative LLM. Defensible if executed well. |
| **Goals workflow** | DECADE Combines (skill tests), Clippd "What To Work On" (data-derived) | Nobody has coach-approved, player-set goals as first-class object. Strong moat if actually wired in. |
| **Standing bars: PGA + team + you** | Clippd (PGA only), UpGame (peer only) | Nobody combines all three in one render. Cheap to build, surprisingly differentiating. |
| **Coach chat** | CoachNow Spaces (post-and-comment), Clippd comments | If chat has LLM as third participant with full data context, genuinely novel. |
| **Composite insights** | TrackMan Tracy (single-shot), Clippd "What To Work On" (single-dimension priority list) | Multi-source synthesis is real LLM use case nobody has shipped. |
| **Player genome** | Clippd Player Quality (one number) | Multi-dimensional identity is white space. |
| **Outcome causality** | None | Single biggest unmet need in entire space. |

**Strongest differentiators:** Outcome causality, LLM round review, composite insights, player genome. Lead marketing with these four.

---

## 5. Where CoachHelm Risks Me-Too

1. **If "LLM round review" is just `summarize(stats)` it's a parlor trick.** Clippd's dashboards already render the data more cleanly. LLM has to do something dashboards *can't* — causality, comparison to a goal, narrative connecting practice to tournament outcome.
2. **If "coach chat" is a chatbot with vague context, it's worse than CoachNow text threads.** Coaches will use group text on iMessage instead. Chat has to be the place where you act on data, not the place you discuss data.
3. **If "Goals workflow" doesn't drive what the system surfaces every day, it's a vanity feature.** DECADE Combines and Clippd "What To Work On" already exist — yours has to actually change the dashboard.
4. **If "Standing bars: PGA + team + you" is just a chart, Clippd will add it in a sprint** once they see it. Make it the *frame* through which every metric is shown, not a single widget.
5. **If shot-level analytics are anything less than Clippd's quality, you'll lose the elite tier** that already pays $2,440/yr and won't downgrade. Be free or much cheaper, OR much better at the coaching layer above the stats. DECADE does this — they don't out-stat Clippd, they out-strategy them. Pick your lane.
6. **No auto-ingest = dead.** Manual data entry is #1 Clippd complaint and has to be solved at launch (Arccos + Garmin minimum).

---

## 6. Top 3 Features to ADOPT from Competitors

1. **DECADE's PRACTICE Rx auto-generated practice plans** ($199 add-on). Auto-generate a 7-day practice plan from player's recent SG profile + season schedule + identified weaknesses. CoachHelm could differentiate by making the LLM the generator (not a rules engine) and tying it to the Goals workflow. **→ Becomes W38 (Practice Rx).**
2. **Whoop's "one tile per athlete + Monday email summary"** for the coach. Single most-loved coach UX pattern in research. Color-coded readiness/form per player at-a-glance + weekly digest with "who to talk to." **→ Becomes W37 (Weekly Coach Email).**
3. **Arccos / Clippd auto-ingest from sensors + launch monitors**. Non-negotiable. Players already own this hardware. Pull from Arccos API, Garmin Connect, TrackMan, Full Swing KIT, Foresight. Bonus: pull from Clippd Scoreboard live tournament data so by the time player gets to the car, the LLM round review is already written. **→ Becomes W39-W41 (Auto-Ingest).**

---

## 7. Top 3 Features NO Competitor Has That College Coaches Would Use

1. **Qualifying & travel-team selection workspace.** Coaches still using Google Sheets to manage 5-day qualifying → top-4 picks + coach's pick → travel roster → tournament prep. Most-painful, most-frequent, most-poorly-tooled workflow in college golf. Build a first-class qualifying object: ingest scores from any source, render leaderboard, store coach's-pick reasoning, generate tournament prep packet with each selected player's last 30 days of data and LLM's per-player "what to focus on this week." Nobody has it. Coaches will switch tools for this alone. **→ Becomes W29 (Qualifying & Travel Workspace).**

2. **The "Why" engine — outcome causality with confidence.** Every chart in every competitor shows *what* changed. None explains *why* with evidence. Build a feature where any metric on any chart is clickable → LLM generates a thesis ("Your putting SG dropped 0.6 over the last 3 events. Evidence: 11 of 14 missed putts were uphill on bermuda; range data shows no stroke change; previous bermuda events show similar pattern. Hypothesis: green-reading on bermuda, not technique."). Show the data the LLM used. Let player or coach mark thesis right/wrong → feedback loop. **Single most defensible feature on this list because it requires shot-level data AND season-context AND LLM AND feedback loop.** **→ Becomes W35-W36 (Outcome Causality).**

3. **The composite player-genome page that the coach hands to the player at start of season.** A one-page identity: "You are a long-but-wild driver who scores best on courses under 7,200 yards with bermuda greens, your scoring distribution is bimodal (you shoot 68 or 76, rarely 72), your worst hole-type is short par-4s with water right, your best practice ROI is wedge distance control 75-115 yd." None of this exists today; the data to compute it does. Becomes the artifact players show their swing coach, share with recruiters, talk about with sport psych. Self-replicating distribution surface — and the one thing Clippd cannot ship without rebuilding their data model. **→ Becomes W33-W34 (Player Genome).**

---

## Bottom-Line Strategic Read

- **Clippd is the incumbent and the threat.** Official NCAA infrastructure, beautiful UI, best metrics (Shot Quality / Player Quality), 200+ programs. Not invincible — their coaching product is admittedly v1, no LLM, no outcome causality, no goals workflow, SG interpretation "hard to follow" per Golf Monthly.
- **Don't try to out-stat Clippd; out-coach them.** Their stats are excellent. Their coaching layer is shallow. Win at the layer above.
- **DECADE is the unexpected strategic peer**, not Clippd. They charge $1,499/team for an app that's mostly methodology + yardage books + auto-practice generator. Their playbook (lean on methodology + simple tooling + coach evangelism) is what a focused challenger looks like.
- **Free-tier urgency:** Arccos Coaches Dashboard is free. Clippd starts at $2,200. Room in the middle for a CoachHelm tier cheaper than Clippd but vastly more capable than Arccos's free dashboard.
- **The single largest wedge** is the combination of: (a) qualifying/travel workspace, (b) LLM round review with causality, (c) the player genome — none of those three exists and all three reinforce daily/weekly/seasonal usage cadences respectively.
- **Hardest discipline:** every feature must answer "what does this do that Clippd's existing dashboards don't?" If you can't answer, cut it. Features that survive that test are the roadmap.

---

## SOURCES

- [Clippd Coaches platform](https://www.clippd.com/coaches), [Clippd Pricing](https://www.clippd.com/pricing), [Shot Quality / Player Quality methodology](https://www.clippd.com/post/shot-quality-and-player-quality-clippds-new-performance-metrics), [Clippd App Store listing](https://apps.apple.com/us/app/clippd-golf-data-analysis/id6444164123)
- [Golf Monthly Clippd review](https://www.golfmonthly.com/reviews/golf-tech-and-training-aids/clippd-review)
- [NCAA selects Clippd for scoring](https://www.ncaa.com/news/golf-men/article/2023-10-16/clippd-selected-manage-ncaa-golf-scoring-and-rankings)
- [Full Swing × Clippd Jan 2025 partnership](https://www.firstcallgolf.com/industry-news/release/2025-01-21/full-swing-partners-with-clippd-to-bring-shot-quality-into-kit-launch-monitor-experience)
- [Golfstat](https://golfstat.com/), [Mark Broadie ranking debate](https://www.nbcsports.com/golf/news/mark-broadie-faces-the-coaches-as-college-golfs-standardization-debate-re-ignites)
- [Monday Q: NCAA, We Have A Problem (Spikemark fail)](https://www.mondayq.com/posts/ncaa-we-have-a-problem), [Junior Golf Hub: Coaches Convention recap](https://juniorgolfhub.com/hitthelinks/coaching/key-takeaways-from-the-college-golf-coaches-convention)
- [Golf Genius 2025 momentum](https://golfgenius.com/resources/2025-tm-momentum)
- [CoachNow Academy launch](https://golfgenius.com/resources/news/cnacademyrelease), [CoachNow 2025 features](https://coachnow.com/blog/2025-key-features)
- [Arccos Coaches Dashboard](https://www.arccos.coach/), [Arccos Team Program](https://www.arccosgolf.com/pages/arccos-team-program), [Plugged In Golf Arccos review](https://pluggedingolf.com/arccos-caddie-review/), [GolfWRX Arccos review](https://www.golfwrx.com/379408/review-arccos-and-arccos-driver/)
- [Shot Scope vs Arccos](https://www.wickedsmartgolf.com/blog/shotscope-vs-arccos-golf)
- [TheGrint](https://thegrint.com/)
- [18Birdies AI Coach](https://18birdies.com/aicoach/), [18Birdies GolfWRX member reviews](https://forums.golfwrx.com/topic/1747782-member-reviews-18birdies-ai-coach-see-what-members-are-saying/)
- [DECADE for Colleges ($1,499)](https://decade.golf/college/), [DECADE memberships](https://decade.golf/memberships/), [GCAA Q&A with Fawcett](https://gcaa.coach/news/564-golf-qaa-scott-fawcett-of-decade), [Practical Golf DECADE](https://practical-golf.com/decade-scott-fawcett/)
- [AimPointGolf](https://aimpointgolf.com/), [Golf.com AimPoint explainer](https://golf.com/instruction/putting/aimpoint-green-reading-basics-30-seconds/)
- [TrackMan Performance Center](https://support.trackmangolf.com/hc/en-us/articles/37847865938971-Practice-Guide-to-the-Performance-Center), [TrackMan U Summit 2026](https://www.trackman.com/lp/the-trackman-university-summit)
- [Hudl sports](https://www.hudl.com/sports), [Hudl Technique Golf](https://justuseapp.com/en/app/581759921/hudl-technique-golf)
- [Vector Connect (Whoop team dashboard)](https://connect.sportsvector.co/), [WHOOP AI Coach](https://www.athletedata.health/guides/whoop-recovery-coach), [Miami × WHOOP case study](https://coya.life/miami-football-partners-own-it-whoop/)
- [GolfWRX: using ChatGPT to analyze swing/launch data thread](https://forums.golfwrx.com/topic/2076322-chatgpt-to-analyze-swing-and-launch-data/)

---

**This document is referenced by `docs/v3-master-plan.md` and informs the W29, W33-W34, W35-W36, W37, W38, W39-W41 wave designs.**
