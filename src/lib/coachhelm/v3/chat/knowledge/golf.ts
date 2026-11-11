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
const READING_THE_NUMBERS = `
# Golf: reading the numbers

## Score
Score is strokes; to par is strokes against the course's par. For both, lower is better, and a negative to par is under par.
A scoring average is per 18 holes. Compare averages only over the same window and the same kinds of round.
Par is not difficulty. A course rating is what a scratch player is expected to shoot from those tees, and slope says how much harder the course gets for a weaker player. For a college player the rating is the one that matters.
The app keeps the rating and slope a round was played at when a course was picked, but it does not adjust any figure for them. So when you set scores from different courses side by side, say that the courses differ.

## Strokes gained
Strokes gained compares each shot with the strokes a reference player would need from the same spot. A shot that leaves the player better off than the reference gains strokes; a worse one loses them. Positive is better.
Here the reference is Tour level, matched to the team (the men's Tour for a men's team, a women's baseline for a women's team). So zero means Tour level, and a negative figure is normal for a college player. Never call a negative figure bad on its own.
What matters is the comparison: against the team for the same window, against the player's own earlier rounds, and between the four areas.
The four areas add up to the total:
- Off the tee: tee shots on par 4s and par 5s. Distance and accuracy count together.
- Approach: shots into the green, including the tee shot on a par 3.
- Around the green: chips, pitches and bunker shots close to the green.
- Putting.
It is per round. Example in words: a total of minus two with approach at minus one and a half says most of the gap to Tour level is approach play, and the other three areas share the rest.
How it is built here: with shots logged, a round's strokes gained is worked out shot by shot. With holes scored but no shots logged, it is a rough estimate from the scorecard. A round posted as a total only has none. A strokes gained figure needs at least three rounds that have one, and the read gives the count: say it.
Strokes gained tells you more than the older stats because it accounts for where each shot started. Use it first when the read has it.

## Ball striking
Fairways hit: tee shots on par 4s and 5s that finish in the fairway. Higher is better, but it ignores distance and how bad a miss was, so on its own it says little about scoring.
Greens in regulation: on the green with two putts left for par. Higher is better. Of the older stats it is the one most tied to scoring.
Proximity: how far from the hole approach shots finish, in feet, by the distance they were hit from. Lower is better. Compare a band only with the same band.
Driving distance is in yards. Putt distances and proximity are in feet.

## Short game and putting
Scrambling: par or better after missing the green. Higher is better. It depends on how far off the green the misses are, so read it beside greens in regulation.
Sand saves: the same from a greenside bunker. A player has few of these a round, so the sample is small.
Putts per round: lower is better, but it misleads. A player who misses greens chips close and has fewer putts. Example in words: fewer putts than a teammate, with fewer greens hit, is not better putting. Use strokes gained putting or make rate by distance to judge putting.
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
With only a few rounds, give the figure with its count and say it is early. Do the same for a rate from few chances.
One bad round or one blow-up hole is an event, not a trend. Say what happened and wait for more rounds before calling it a pattern.
Practice rounds usually score differently from tournament rounds. When you compare, say which kinds of round each figure covers.
A player new to shot tracking has strokes gained and distance figures resting on few rounds, or on scorecard estimates. Say so before drawing a conclusion from them.
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
Qualifying decides who travels. Here a qualifier has a number of rounds, a squad size and a number of coach's picks. The board ranks by total to par, then total strokes, then more rounds played. A card with fewer rounds in than the others ranks below every complete card. The top places qualify on score, the rest of the squad is the coach's pick, and nothing is final until the coach confirms the squad.
A qualifier is a small sample. When the coach asks who should play, lay out the qualifier standing, recent tournament scoring, form and course history side by side, and leave the choice to the coach.
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

const COACH_GOLF = tidy([READING_THE_NUMBERS, COLLEGE_GOLF_COACH, FROM_NUMBER_TO_ACTION, LIMITS, lookUp()]);
const PLAYER_GOLF = tidy([
  READING_THE_NUMBERS,
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
  sgBaseline: 'Here the reference is Tour level, matched to the team (the men\'s Tour for a men\'s team, a women\'s baseline for a women\'s team).',
  sgFloor: 'A strokes gained figure needs at least three rounds that have one',
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
