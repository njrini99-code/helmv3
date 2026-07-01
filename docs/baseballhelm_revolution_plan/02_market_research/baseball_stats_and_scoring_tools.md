# Baseball Stats And Scoring Tools

## Official stats anchor

Use NCAA baseball statistical conventions as the official source for formulas, scorekeeping definitions, innings pitched handling, sacrifices, earned runs, and official scoring logic.

## Product tiers

### Basic Stats Mode

Manual/CSV entry of game schedule, result, box score, player hitting, pitching, fielding, baserunning. This is the default for small programs.

### Coach Grades Mode

Adds coach-entered QABs, hard-hit balls, productive outs, baserunning grades, defensive reliability, bullpen grades, and appearance notes.

### Advanced Imported Metrics Mode

Adds imported chase, whiff, zone contact, pitch mix, velocity, spin, IVB/HB, extension, release consistency, spray data.

### Full Player Development Mode

Connects game outcomes to practice notes, cage/bullpen sessions, lifts, soreness, wellness, and CoachHelm AI trends.

## Stats BaseballHelm must support

Hitting: AVG, OBP, SLG, OPS, PA, AB, H, 1B, 2B, 3B, HR, BB, HBP, K, RBI, R, SB, CS, SH, SF, QAB, HHB, line-drive rate, chase, whiff, zone contact, two-strike, RISP, leadoff quality, productive outs.

Pitching: ERA, WHIP, IP, H, R, ER, BB, K, HBP, HR, BF, strike %, first-pitch strike %, K/BB, K/9, BB/9, GB/FB, pitch count, leverage, recovery, bullpen availability, velocity, command, pitch mix, spin, IVB, HB, extension, release consistency.

Fielding: chances, PO, A, E, fielding %, DP, PB, catcher pop, CS, blocking, OF assists, defensive reliability.

Baserunning: SB, CS, first-to-third, dirt ball reads, extra base taken, mistakes, run expectancy if feasible, coach grades.

## Import strategy

Support StatCrew/NCAA-style CSV, GameChanger box-score PDFs/exports when available, manual stat spreadsheets, SIDEARM/PrestoSports copied tables, and generic custom CSV mapping.
