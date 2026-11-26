# Briefs: My stats, Team Stats, Home "Your game"

Nick's asks, in his words: Stats "is too busy, complicated, and not airy modern and visual". "Not fewer. Just better organized." A summary with a visual that opens a detailed version with more visuals, the way production does. On the design page: "Beautiful", then the missing stats (scrambling, greens and others) and the strokes gained visual, both fixed in the version in `redesign/`. And for every build: "I want all of the designs to be accurately reflected in the builds", including "the feature mechanics and sub pages and all of it the motion".

The approved look is `redesign/stats-and-home-phone.html`. Open it in a browser; the control bar switches screen, light and dark, data state, Text Size and Reduce Motion, and every view has a link (`04-FIDELITY-SPEC.md` section 1). The build copies it. Exact values, states, mechanics and motion are in `04-FIDELITY-SPEC.md`; file by file in `02-PLAN.md`; every number's source in `03-DATA-CHECKS.md`.

Rules for all three:

- **Top bar:** the app's green bar in `--ch-frame` (98pt, 16pt lip, switcher title with chevron and champagne dot, bell). A detail uses today's pushed bar: "‹ My stats" or "‹ Stats" in champagne, the page name centred, no bell.
- **Window switch:** the house green segmented (Roster's), all five windows (5, 10, 20, Season, Qualifiers) plus the filter button, sticky under the bar.
- **Cards:** one card style. Title, meta and chevron in the card's head. No accent left-border cards, ever.
- **Text Size:** follows iPhone Text Size (`--ch-type-k`). At the largest standard size the switch scrolls sideways and card heads wrap; nothing clips.
- **Edges:** 16pt, 20pt from 430pt phones.
- **Motion:** the house push; light, dark, Reduce Motion and Animations off all work.
- **Data:** only what the Stats route already loads. No new queries. No change to shot tracking. Tour figures only from `golf_pga_standards`. A summary card and its detail never show different numbers for the same figure.
- **Nothing removed:** every block on today's phone Stats is still reachable (`02-PLAN.md`, "Where today's content goes").
- **Release:** prep and PRs only. No deploy, migration or flag flip.

---

## 1. My stats (player)

**Route:** `/golf/dashboard/stats` for a player; a coach on `?player=` sees the same with the coach head. Preview: `/clubhouse-preview/player?state=self`.

**What it's for:** a player sees how they're scoring and why, in a minute, and can go as deep as they want into one part of the game.

**Today** (`screenshots/before/before-my-stats-*.jpg`, `today-my-stats-*.jpg`): one long scroll of mixed panels, charts, tables and chips at the same weight, so nothing leads. Parts of the game open inline, so the page changes length under the thumb.

**Redesign:**
- **Overview:** the Scoring average as the one green feature card (figure, to par, change chip, the line by round that you can drag to read), What changed (one sentence and two bars: this window against the one before), and At a glance (six tiles: Greens, Fairways, Scrambling, Putts, Birdies, Bogeys; each opens its part).
- **Your game:** Strokes gained (four bars from zero, the total and its likely range), then a card per part (Off the tee, Approach, Short game, Putting): the key figure, an SG pill, and one small visual of the part.
- **Rounds:** Round by round, a ticker of the window's rounds (lower is taller, the best in green).
- **Development:** Goals and focus areas, as rings.
- **Every card opens a detail page** with the house push: 8 details (Scoring, Strokes gained, the four parts, Rounds, Goals), each a hero figure and its cards (spec section 5).
- **Early (2 rounds):** strokes gained shows dashes and "Strokes gained shows from 3 rounds"; tones stay flat.
- **No rounds:** the empty card in the Overview, Goals still shown.

**Must not change:** the bar, the section switch, the window options and filter, the honesty rules (grey inside the likely error, early tags, floors), what the figures mean, desktop's layout.

**Done when:** the fidelity check passes (spec section 9) for the summary, all 8 details, the 2-round, no-round, failed and loading states, dark, XXL and 430; every inbound link lands on its detail; every block on today's page is reachable.

## 2. Team Stats (coach)

**Route:** `/golf/dashboard/stats/team`. Preview: `/clubhouse-preview/stats`.

**What it's for:** a coach sees how the team is scoring, which part of the game costs the most, and who is gaining or losing, then goes to a player.

**Today** (`screenshots/before/before-team-stats-iphone.jpg`, `today-team-stats.jpg`): hero, trend, figures, a leg picker, rank, players and putting bands stacked at one weight.

**Redesign:**
- **Overview:** Team scoring average as the green feature card (by round day, mean line), Team game (strokes gained by leg, four bars), Players (top three by SG, "Who gains and loses").
- **3 details:** Team scoring (by round day, the round, a Round days table with a Rounds column), Team game (SG by leg, tap to pin a leg), Players (every player by SG, tap to pin, second tap opens the player; then today's Players list with its Avg / SG sort and peek).
- Team putting and TeamInsight live in the details (spec section 8).

**Must not change:** the window options (round days), the player peek, the team's figures and their sources.

**Done when:** the fidelity check passes for the summary, the 3 details, Last 20, 2 round days, none, failed, loading, dark, XXL and 430.

## 3. Home "Your game" (player)

**Route:** `/golf/dashboard` (player Home). Preview: `/clubhouse-preview/home-player`.

**What it's for:** on Home, a glance at the four parts of the game, which way each is going, and a way into Stats.

**Today** (`screenshots/before/before-player-home-your-game-iphone.jpg`, `today-home-your-game.jpg`): low-contrast sparks and labels; Tour rails asked for on legs that have no Tour value, so they never draw.

**Redesign:** one card, "Your game · Strokes gained vs Tour", four rows. Each: the part's icon, its strokes gained a round this season, its key figure for the last 10 rounds, the trend word ("Improving", "Slipping", or "No clear change" in flat ink), a spark of the last rounds, and the counts behind the figure ("59 of 140 fairways"). A You vs Tour rail on Approach only. The footnote says what the figures cover and when a line turns green or amber. A row opens that part on My stats.

**Must not change:** where the card sits on Home and what's around it; the figures' sources.

**Done when:** the fidelity check passes in full, 2 rounds and none, light and dark, XXL and 430; contrast AA on every text and on the spark (3:1 for the line).
