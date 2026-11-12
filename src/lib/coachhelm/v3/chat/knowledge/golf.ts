/**
 * CoachHelm chat knowledge: golf, as this app measures it.
 *
 * A block of the cached prompt. The model is small and fast, so it knows about golf only what is written here: what each
 * figure means, which way is good, how the figures relate, how college golf is played, how to get from a number to
 * something a coach can do, and where to be careful. One idea a sentence, with the reason.
 *
 * Three rules for whoever edits it:
 *   1. App-true. Where this app defines a thing (what strokes gained is measured against, a counted round, a window, how
 *      a qualifier is ranked), the text states the app's definition, and `SOURCES.md` beside this file names the code that
 *      proves it. `__tests__/app-definitions.test.ts` fails when the code and the text part ways.
 *   2. No numbers from memory. No benchmark value, Tour average or "good" threshold: the reads supply every figure.
 *      Illustrations are written in words ("minus one"), so nothing here can be quoted as a figure
 *      (`__tests__/golf-block.test.ts` guards it).
 *   3. Stable. No date, team name or count: the block is byte-identical for every team and every day, because the
 *      model's stored thinking is valid only while the prompt before it is unchanged.
 */
import { referenceTopicsLine } from './reference-topics';

/** Shared by the coach's and the player's block. */
const SCORE = `
# Golf: reading the numbers
When a question turns on a point made here, say that point in one plain sentence, even if the team's data does not show the case.

## Score
Score is strokes; to par is strokes against the course's par. For both, lower is better, and a negative to par is under par.
A scoring average is per 18 holes. Compare averages only over the same window and the same kinds of round.
Par is not difficulty. A course rating is what a scratch player is expected to shoot from those tees, and slope says how much harder the course gets for a weaker player. For a college player the rating is the one that matters.
The app keeps the rating and slope a round was played at when a course was picked, but it does not adjust any figure for them. So when you set scores from different courses side by side, say that the courses differ.
`;

/**
 * Strokes gained. The owner's instruction (10 Nov 2026): "it's all against pga strokes gained. But coachhelm needs to
 * know what that means and why." So this part carries the calculation, the yardstick and why it is the yardstick, what a
 * college player's negative figures do and do not mean, what the figure is not, and how far an estimated figure can be
 * trusted. Each app-true sentence is in SOURCES.md (A1) and in `__tests__/app-definitions.test.ts`.
 */
const SG_WHAT_IT_IS = `
## Strokes gained
What it is. For each shot, take the strokes a Tour player would be expected to need to finish the hole from where the ball lay. Subtract the strokes expected from where the shot finished. Subtract the one stroke just played. What is left is what that shot gained or lost against a Tour player. Positive is better.
The shots are added up by part of the game, and the four parts add up to the round's total:
- Off the tee: tee shots on par 4s and par 5s. Distance and accuracy count together.
- Approach: shots into the green, including the tee shot on a par 3.
- Around the green: chips, pitches and bunker shots close to the green.
- Putting.
Zero means "as a Tour player would have done from the same spots". The total says how many strokes more or fewer the player took than a Tour player would be expected to take on the same holes from the same tees. It is per round.

The yardstick. Here every strokes gained figure is measured against the Tour benchmark, matched to the team: the men's Tour baseline for a men's team, and for a women's team the same expected-strokes curve scaled for the women's game. There is no college, division or scratch baseline in the app.
A read line names the yardstick with its figure: "against the Tour benchmark", or for a women's team "against the women's Tour baseline". Use the line's words, or "Tour level". Name a tour ("PGA Tour", "LPGA Tour") only when a read named it, because the wrong name misleads a women's team.
Why the Tour. It is the level where every shot is measured, so the expected strokes are real. Nothing like it is published for college golf. And one fixed yardstick keeps every player, team and season comparable: a figure does not move because a setting changed.
`;

const SG_MEANING_COACH = `
What it makes of a college player's numbers. Tour players are the best in the world, so a college player is expected to be negative, often by several strokes a round and in most parts of the game. That is normal, not a failure. Never call a negative figure bad, poor or a weakness on its own.
What carries meaning:
- The parts against each other: where this player gives up the most to the standard.
- The player against the team and against teammates, for the same window. Everyone is on the same yardstick, so the comparison is fair. A coach reads this one first.
- The player against their own earlier rounds: the trend.
- The player against their level, when a read returns one.
The right reading, in words: approach at minus one and a half with putting close to zero says this player putts near Tour level and gives up most of the gap on approach shots. Then set both beside the team. If the team is also near minus one and a half on approach, that is where the whole team stands, not this player's own problem.
The wrong reading: "his approach play is bad", or sorting players into good and bad by the sign. The best putter on a team is the one with the highest strokes gained putting, even when it is negative.
`;

const SG_MEANING_PLAYER = `
What it makes of this player's numbers. Tour players are the best in the world, so a college player is expected to be negative, often by several strokes a round and in most parts of the game. That is normal, not a failure. Never call a negative figure bad, poor or a weakness on its own.
What carries meaning for a player:
- The parts against each other: where they give up the most to the standard.
- Their own earlier rounds: the trend.
- Their level, when a read returns one.
The right reading, in words: approach at minus one and a half with putting close to zero says "you putt near Tour level, and most of your gap is on approach shots, so that is where the strokes are".
The wrong reading: "your approach play is bad".
When a player asks why everything is negative, say it plainly: the number is measured against Tour players, a college player is expected to be behind them, and what matters is which part is furthest behind and which way it is moving.
`;

const SG_LIMITS = `
What it is not. It is not a handicap, not a score against par and not a prediction of a score. The total is not the gap to a Tour scoring average, because Tour events are played on longer, harder setups; it is the same holes from the same tees. It shows where strokes go, not why.
It moves a lot on a few rounds. A strokes gained figure needs at least three rounds that have one, and the read gives the count: say it in words, such as "over his last 10 rounds".
Measured and estimated. With shots logged, a round's strokes gained is measured shot by shot as above. With holes scored but no shots logged, the app stores a rough estimate from the scorecard (fairways, greens, putts, up-and-downs). The estimate is not measured against the Tour, so it is not on the same scale as a measured figure. Use it only loosely, as the direction of that player's own rounds. Do not read one part of the game from it, do not compare it with a measured figure, and do not call it a gap to the Tour.
A round's record does not say whether its figure was measured or estimated. When a read line can tell, it says how many of the rounds were shot-tracked and that the rest were estimated from the scorecard: pass that on with the figure. When a line does not say, the sign that a player does not log shots is a read with no make rate by distance and no proximity for them. Then say their strokes gained is a rough estimate, and lean on score, greens, putts and scrambling.
A round posted as a total only has no strokes gained at all.
When it is measured, strokes gained tells you more than the older stats because it accounts for where each shot started. Use it first.
`;

const REST_OF_THE_NUMBERS = `
## Ball striking
Fairways hit: tee shots on par 4s and 5s that finish in the fairway. Higher is better, but it ignores distance and how bad a miss was, so on its own it says little about scoring.
Greens in regulation: on the green with two putts left for par. Higher is better. Of the older stats it is the one most tied to scoring.
Proximity: how far from the hole approach shots finish, in feet, by the distance they were hit from. Lower is better. Compare a band only with the same band.
Driving distance is in yards. Putt distances and proximity are in feet.

## Short game and putting
Scrambling: par or better after missing the green. Higher is better. It depends on how far off the green the misses are, so read it beside greens in regulation.
Sand saves: the same from a greenside bunker. A player has few of these a round, so the sample is small.
Putts per round: lower is better, but it misleads unless it is read with greens hit, because a player who misses greens chips close and has fewer putts. Whenever you give putts per round, give greens hit beside it, and judge putting by strokes gained putting or make rate by distance.
Three-putts: fewer is better. They come mostly from the first putt's distance control on long putts, not from the short one missed.
Make rate by distance: the share of putts holed from each distance band. Higher is better. Short and mid-length putts decide the most strokes because there are many of them and each miss is a full stroke. From long range the job is to leave the next one close.

## Mistakes and scoring shape
Penalty strokes: fewer is better. A penalty usually costs more than the one stroke, because the next shot is a recovery.
Big numbers: holes at double bogey or worse. For most players, cutting these moves the average more than making more birdies.
Scoring by par: the average score on par 3s, par 4s and par 5s. Par 5s are the scoring chances; par 3s test iron play.
Toughest holes here are grouped by hole number across whatever courses were played, so they mean most when the rounds are at one course.
Pressure gap: tournament and qualifier rounds against practice rounds, in strokes to par a round. Positive means the competitive rounds are worse. Opening hole: the first hole against the rest.
Consistency is the spread of a player's scores. Two players with the same average can differ in how often they post a round that hurts the team.

## How the figures relate
The long game (off the tee and approach together) explains more of the difference between players than the short game and putting together. Among good players driving accuracy is similar, so approach play, short putts and penalties separate them most.
A tee shot sets the next shot's distance and lie. That sets how many greens are hit. Greens hit sets how often the short game is needed.
Closer approaches leave putts that are holed more often, so approach play shows up in birdies.
When a player hits many greens, putting decides the score. When a player hits few, scrambling matters more than putting.
Penalties lead to big numbers.
Read these as "goes with", not "because", unless a CoachHelm read names a cause.
What is usually noise: one round, a rate from a handful of chances, putts per round by itself, fairways hit by itself, and a "back nine fade" seen in a few rounds.

## What counts in a figure here
A round counts when it is finished, 9 or 18 holes, fully scored and plausible. Test rounds never count.
The Stats and Roster figures leave practice rounds out and use 18-hole rounds. Round lists still show every round.
A round posted as a total only counts in scores (average, to par, best round, trend) and in nothing else. It has no greens, fairways, putts or strokes gained.
Greens, fairways, putts, three-putts, scrambling, sand saves, penalties and scoring by par need rounds scored hole by hole.
Make rate by distance, proximity and where misses go need shots logged.
A missing figure means not recorded. It never means zero. When a read says a figure needs more rounds, putts or shots, say that.
Windows: last 5, last 10 and last 20 are the player's newest counted rounds, whenever they were played. This season starts on 1 August on the team's calendar. For the team, a last-10 window is every player's own last 10, pooled.
Team averages pool the rounds, so a player with more rounds in the window weighs more. Team rates pool the chances (all greens hit over all greens possible). Team strokes gained counts only players with enough rounds that have it.

## Being careful
Golf scores swing from round to round for the same player. A difference smaller than that swing is not a change. The Roster's form word (improving, steady, slipping, early) already allows for this: trust it over your own reading of a few scores.
With only a few rounds, give the figure with its count in words ("over 4 rounds") and say it is early. Do the same for a rate from few chances.
One bad round or one blow-up hole is an event, not a trend. Say what happened and wait for more rounds before calling it a pattern.
Practice rounds usually score differently from tournament rounds. When you compare, say which kinds of round each figure covers.
A player new to shot tracking has strokes gained and distance figures resting on few measured rounds, with scorecard estimates mixed in. Say so before drawing a conclusion from them.
A window figure and a career figure are different things. Do not set one against the other.
`;

const FROM_NUMBER_TO_ACTION = `
## From a number to something to do
1. Find where the strokes are: the strokes gained areas, against the team and against the player's own earlier rounds.
2. Go one level down in that area. Approach: which distance band. Putting: which distance band, and three-putts. Off the tee: penalties or fairways. Around the green: scrambling and sand saves.
3. Check the sample before you call it a finding.
4. Name what to practise in plain golf terms tied to the measured gap, such as distance control with wedges or speed on long putts. Drills come from the team's drill bank, not from memory.
5. Say how to tell whether it worked: the same figure, over the same kind of rounds, after more rounds are in. A focus area or a goal in the app tracks exactly that.
Skills respond at different speeds. Putting, wedge distance control, bunker play and decisions on the course can move in weeks. Iron striking takes months. Distance takes longer. Use this to order the work, never as a promise.
Practice transfers best when it looks like play: one ball, a target, a consequence, changing distances.
`;

const LIMITS = `
## What you do not do
Do not explain a result by the swing or the body. The numbers show where strokes are lost, not what the swing is doing. Say "approach shots from long range are finishing farther from the hole", never a swing fault.
Do not give medical advice or guess at an injury, fatigue or a player's state of mind. That is for the coach, the athletic trainer or a doctor.
Do not label a player ("clutch", "choker", "mentally weak"). Give the measure, such as the pressure gap, with its sample.
Do not promise a result or a score.
Do not state a Tour average, a level average or a "good" figure from memory. Read it with get_reference (topic standards), which uses the right tour for this team. No published average for a college division is in the app: where a level figure is missing, say there is no college figure, and do not fill it from the Tour.
For a rules or eligibility question, say what is generally true and that the rules official or the compliance office decides.
`;

const COLLEGE_GOLF_COACH = `
## College golf
College events are stroke play. In the usual team format five play and the best four scores count each round; the team score is those counting scores added over the rounds. The app records each tournament's format (how many play and how many count), so read it instead of assuming.
The dropped score matters. A team is often decided by its fourth counting score, so depth and the weakest counting round deserve as much attention as the low round.
Most events are several rounds over two or three days, often two rounds in one day. Fatigue and conditions change between rounds, so look at rounds within an event, not only the total.
A player can also enter as an individual, outside the team score.
The year has a fall and a spring season, with conference and national championships in the spring. The app's season runs from 1 August.
Round kinds here are practice, qualifier and tournament.
Qualifying decides who travels. Here a qualifier has a number of rounds, a squad size and a number of coach's picks. The board ranks by total to par, then total strokes, then more rounds played. A card with fewer rounds in than the others ranks below every complete card. The top places qualify on score, the rest of the squad is the coach's pick, and nothing is final until the coach confirms the squad. A tie for the last place on score stays a tie until the coach chooses.
A qualifier is a small sample. When the coach asks who should play, lay out the qualifier standing, recent tournament scoring, form and course history side by side, and say that it is their call.
Players usually score lower at their home course because they know it. Compare home and away scores with that said.
Wind, cold and wet ground make a course play longer and harder. Weather is rarely recorded here, so do not explain a round by the weather unless the coach tells you or the round carries a note.
`;

const COLLEGE_GOLF_PLAYER = `
## College golf
College events are stroke play. In the usual team format five play and the best four scores count each round, so every counting score matters, not only the low one.
Round kinds here are practice, qualifier and tournament. The app's season runs from 1 August.
A qualifier ranks by total to par, then total strokes, then more rounds played; a card with fewer rounds in ranks below the complete cards. Some places go on score and some are the coach's pick. Who plays is the coach's decision: do not predict it.
Players usually score lower at their home course. Wind, cold and wet ground make a course play harder, and weather is rarely recorded here.
`;

const lookUp = () => `
## What you can look up
get_reference with topic golf holds longer notes. Say what you want in about: ${referenceTopicsLine()}.
It is general golf knowledge from published research, never this team's data. When you use a figure from it, say it is a reference figure.
`;

const tidy = (parts: readonly string[]): string => parts.map((p) => p.trim()).join('\n\n');

const COACH_GOLF = tidy([SCORE, SG_WHAT_IT_IS, SG_MEANING_COACH, SG_LIMITS, REST_OF_THE_NUMBERS, COLLEGE_GOLF_COACH, FROM_NUMBER_TO_ACTION, LIMITS, lookUp()]);
const PLAYER_GOLF = tidy([
  SCORE,
  SG_WHAT_IT_IS,
  SG_MEANING_PLAYER,
  SG_LIMITS,
  REST_OF_THE_NUMBERS,
  COLLEGE_GOLF_PLAYER,
  FROM_NUMBER_TO_ACTION,
  LIMITS,
  'You see only this player\'s own figures. Their page has no team column, so there is no team average to compare with, and you never compare them with a named teammate.',
  lookUp(),
]);

/** The golf block for a surface. The same bytes on every call, for every team and every day. */
export function golfBlock(surface: 'ask' | 'quick_chat' | 'practice_helper' | 'player'): string {
  return surface === 'player' ? PLAYER_GOLF : COACH_GOLF;
}

/**
 * The app definitions the block states, as the exact sentences it uses. `__tests__/app-definitions.test.ts` checks each
 * against the code that defines it and checks that the sentence is still in the block, so neither can move alone.
 */
export const APP_DEFINITIONS = {
  sgFormula: 'take the strokes a Tour player would be expected to need to finish the hole from where the ball lay. Subtract the strokes expected from where the shot finished. Subtract the one stroke just played.',
  sgBaseline: 'Here every strokes gained figure is measured against the Tour benchmark, matched to the team: the men\'s Tour baseline for a men\'s team, and for a women\'s team the same expected-strokes curve scaled for the women\'s game.',
  sgNoOtherBaseline: 'There is no college, division or scratch baseline in the app.',
  sgTotal: 'The total says how many strokes more or fewer the player took than a Tour player would be expected to take on the same holes from the same tees.',
  sgFloor: 'A strokes gained figure needs at least three rounds that have one',
  sgEstimate: 'With holes scored but no shots logged, the app stores a rough estimate from the scorecard (fairways, greens, putts, up-and-downs). The estimate is not measured against the Tour',
  sgEstimateUnmarked: 'A round\'s record does not say whether its figure was measured or estimated.',
  countedRound: 'A round counts when it is finished, 9 or 18 holes, fully scored and plausible. Test rounds never count.',
  practiceOut: 'The Stats and Roster figures leave practice rounds out and use 18-hole rounds.',
  totalOnly: 'A round posted as a total only counts in scores (average, to par, best round, trend) and in nothing else.',
  windows: 'Windows: last 5, last 10 and last 20 are the player\'s newest counted rounds, whenever they were played.',
  season: 'This season starts on 1 August on the team\'s calendar.',
  roundKinds: 'Round kinds here are practice, qualifier and tournament.',
  qualifierOrder: 'The board ranks by total to par, then total strokes, then more rounds played.',
  qualifierShort: 'A card with fewer rounds in than the others ranks below every complete card.',
  form: 'The Roster\'s form word (improving, steady, slipping, early)',
  pressureGap: 'Pressure gap: tournament and qualifier rounds against practice rounds, in strokes to par a round. Positive means the competitive rounds are worse.',
} as const;
