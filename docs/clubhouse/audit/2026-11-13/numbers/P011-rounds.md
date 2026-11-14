# P011 Rounds: numbers vs staging
| Shown | Expected (staging) | Verdict | Query |
| --- | --- | --- | --- |
| Review 4625ba2c: 79, +7, Out 40, In 39; the Rounds list also 79 (it reads the nines) | total_score 78, score_to_par 6; holes sum 79 (front 40, back 39) | Stored total is stale; screens that read it print 78 (F-0003) | select total_score, score_to_par, sum(golf_holes.score) for the round |
| Strokes gained −6.4: tee +2.5, approach −4.8, around green −0.6, putting −3.6 | −6.42 = 2.52 − 4.76 − 0.58 − 3.60 | Right (parts shown rounded sum to −6.5) | golf_rounds strokes_gained_* |
| 15 of 93 team rounds with full holes disagree (2–19 Jul) | | Data + two sources | mismatch CTE |
