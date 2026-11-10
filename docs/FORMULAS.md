# Stat & coaching formulas (single source of truth)

Deterministic, computed at query time. `stat_history` gets a row whenever a stat's value or level changes
(`detectLevelUps` in `backend/core/src/gamification/quests.ts`: trigger `first` / `level_up` / `level_down` / `changed`),
so these formulas can change without migrating data. Every output carries a
`confidence` the report prints verbatim. See `backend/core/src/gamification` and
`backend/core/src/coaching`.

## The level curve (all three stats) — `gamification/levels.ts`
Levels run **0–100** on a smooth power curve, NOT a flat divisor. The level is a
pure function of the current `value`, so it's an honest mirror — it can also go
**down** with detraining. No XP banking, no persistence.

    level(value) = clamp(floor(100 * (value/vMax)^(1/exp)), 0, 100)
    value(level) = vMax * (level/100)^exp          // inverse — a level's threshold

`exp > 1` makes early levels come fast and late levels grind. Each stat carries its
live `level`, `progressPct` (the XP-bar fill), `toNext` (points to the next level for
composites; null at LV100), `nextLevelValue`, a `tier`, and a **`breakdown`** of its
sub-factors.

**Composite (`compositeStat`)** is used by LEANNESS only: one sub-factor (fat-mass fraction) scored 0–100 by its
curve (`scoreForValue`, the un-floored `levelForValue`) and blended `Σ(weight·score)/Σweight` into the level.
Curve constants: `LEANNESS_FRACTION_CURVE` (`backend/core/src/gamification/stats.ts`); goals: editable in VITALS (`athlete_config.goal_*`), resolved by `gamification/goals.ts` (`resolveGoals`; unset = neutral default 75 kg / 15 % / 6:00 per km / 30 km/wk).
STAMINA and STRENGTH (below) are additive points sums, not curve blends, so they are monotonically non-decreasing.

**Tiers** (band → rank): 0–9 Novice · 10–24 Apprentice · 25–49 Adept · 50–74
Veteran · 75–94 Elite · 95–100 Mythic.
**Hero level** (`stats.hero`) = `round(avg of the three stat levels)`, own tier.
**`levelEvents`** = read-only crossings (live level vs last-persisted in
`stat_history`) → drive the dashboard level-up flash; never written by the DTO.

## STAMINA (running) — cumulative total + longest-ever & best-PR-ever milestones
`computeStamina` (`gamification/stats.ts`) is deliberately **NOT** a rolling-window
composite: all three inputs below are drawn from the **FULL run history with no time
window anywhere** — total distance, the longest-ever single run, and the best-ever race
PR are each a running total/maximum, so they can only go **up** as runs are added. The
level is therefore **monotonically non-decreasing** — it can never drop between
sessions, unlike LEANNESS above.

    staminaLevel = base(totalKm)            [max 60]
                 + longestBonus(longestKmEver) [max 20]
                 + paceBonus(bestPrEver)       [max 20]

**1. Base (max 60)** — a smooth power curve over all-time cumulative km:

    base = 60 * clamp(totalKm / 2500, 0, 1) ** (1 / 2.4)

  `totalKm` = Σ `totalDistanceM/1000` over every run ever imported. Reference points:
  55 km → 12.2 · 100 km → 15.7 · 250 km → 23.0 · 500 km → 30.7 · 1000 km → 41.0 ·
  2500 km → 60 (saturates).

**2. Longest-ever bonus (max 20)** — a hard-step milestone ladder on the single longest
run ever recorded (no interpolation between rungs; below 5 km → 0):

  | longest run | 5 km | 10 km | 15 km | 21.0975 km (HM) | 30 km | 42.195 km (FM) |
  |---|---|---|---|---|---|---|
  | bonus | 3 | 6 | 10 | 14 | 17 | 20 |

**3. Best-PR-ever pace bonus (max 20)** — for each of the 4 nominal race distances (5k /
10k / HM / FM), find the fastest-ever PR candidate and score it on that distance's
ladder; the bonus is the **MAX across the 4 distances, never an average or a sum** — a
first slow 10k must never drag down a fast 5k already banked.
  - **PR candidate**: a run qualifies for a nominal distance once
    `totalDistanceM >= nominal * 0.98`; the domain has no per-km splits, so its candidate
    time is PRO-RATED at the run's average pace out to the nominal distance
    (`durationSec * nominal / actualDistance`) — an honest approximation, not an
    invented split.
  - **Ladder** (cumulative bonus at each rung, hard steps; the 10k/HM/FM columns are
    Riegel equivalents of the 5k column, kept as explicit data, not computed):

    | bonus | 5 km | 10 km | HM | FM |
    |---|---|---|---|---|
    | 3  | 45:00 | 1:34:00 | 3:27:00 | 7:12:00 |
    | 5  | 40:00 | 1:23:30 | 3:04:00 | 6:24:00 |
    | 8  | 35:00 | 1:13:00 | 2:41:00 | 5:36:00 |
    | 11 | 30:00 | 1:02:30 | 2:18:00 | 4:48:00 |
    | 13 | 27:30 | 57:20   | 2:06:30 | 4:24:00 |
    | 15 | 25:00 | 52:00   | 1:55:00 | 4:00:00 |
    | 17 | 22:30 | 47:00   | 1:43:30 | 3:36:00 |
    | 20 | 20:00 | 41:40   | 1:32:00 | 3:12:00 |

`confidence` = always high. `breakdown` still has 3 rows (`Total`/`Longest`/`Pace`), but
`level` on each row now means **points contributed to the 100-pt total**, not a 0–100
sub-score: `{Total: floor(base), Longest: longestBonus, Pace: paceBonus}`.
`weeklyKmOf`/`bestPaceMinPerKmOf` (rolling 28-day helpers) are KEPT — they still feed the
QUESTS volume/pace goals below, which are intentionally recency-based (motivation, not a
stat input).

**No upper bound on the PR floor (deliberate):** the `>= nominal * 0.98` check is a LOWER
bound only — a run far longer than the nominal distance (e.g. a full marathon pro-rated
down to a 5k) still qualifies. This is intentional, not an oversight: pro-rating a long
run's steady pace down to a shorter distance is physiologically CONSERVATIVE relative to
Riegel's endurance formula — a 3:00:00 marathon pace pro-rates linearly to a 21:20 5k,
while Riegel predicts a much faster ~18:46 — so the lack of a ceiling under-credits
rather than inflates. Keep it.

**STAMINA and STRENGTH are career/high-water-mark stats, not fitness mirrors:** unlike
LEANNESS (which still reflects CURRENT form and can move both ways), their inputs are all
running totals/maxima, so they never drop.

## STRENGTH (gym) — cumulative tonnage + per-lift best-ever points
`computeStrength` (`gamification/stats.ts`) has the same shape as STAMINA: every input is a
running total/maximum over ALL counted sessions (no rolling window, no frequency input), so
the level is **monotonically non-decreasing under insertion**. Counted = sessions on/after
`STRENGTH_FRESH_START`, not `excludedFromTrend`, with a real load;
archived pre-reset sessions never count. Total weight as logged via the STRENGTH tab.

    strengthLevel = base(totalTonnageKg)          [max 60]
                  + keyLiftBonus(per-lift bests)       [max 20]
                  + relativeBonus(per-lift bests ÷ bw) [max 20]

- **Base** = `60 * clamp(totalTonnage / 750000, 0, 1) ** (1/2.4)`; totalTonnage = Σ realLoad·reps
  over every counted session. (75 t ≈ 23, 375 t ≈ 45, 750 t = 60.)
- **Pool lifts** (`keyLiftOf`): Bench = name matches "bench press", not "incline", barbell; Squat =
  name contains "squat" and none of smith / hack / goblet / split / bulgarian / leg press, barbell;
  Sumo Deadlift = name contains "sumo" and "deadlift", any equipment (conventional, Romanian,
  trap-bar and stiff-leg deadlifts do NOT count). Anything else counts toward tonnage only.
- **Key-lift bonus** = each pool lift climbs its OWN ladder on its all-time max (kg); an untrained
  lift earns 0; the three results are summed and capped at 20 (3 × 7 = 21).

      lift max kg | ≥40 | ≥50 | ≥60 | ≥70 | ≥80 | ≥100 | ≥120     (below 40 → 0; hard steps)
      points      |  1  |  2  |  3  |  4  |  5  |   6  |   7

- **Relative bonus** = the same idea on each lift's max ÷ bodyweight (own ladder per lift, summed, capped at 20).
  bodyweight = the MIN positive weigh-in dated on/before the latest counted session date; no weigh-in
  at all → 0. (A min over a set that only grows under insertion, so adding a weigh-in at any date can
  never lower it. Deliberately the lightest-ever weigh-in, not the current one.)

      lift max ÷ bw | ≥0.2 | ≥0.35 | ≥0.5 | ≥0.6 | ≥0.75 | ≥0.9 | ≥1.1   (below 0.2 → 0; hard steps)
      points        |  1   |   2    |  3   |  4   |   5    |  6   |  7

- **Replaces** (v0.2.x, issue #13) an averaged index `(bench + squat + sumo) / 3` (missing lift = 0) on
  one ladder (≥60/80/100/120/150/180 kg → 3/6/10/14/17/20) and index ÷ bw (≥0.6/0.8/1.0/1.25/1.75 → 3/6/10/14/20).
  The averaging gave a bench-only athlete nothing. The new ladders are never lower than the old ones
  on the tested domain (every lift 0–140 kg, bodyweight 60–200 kg; `strength-dominance.test.ts`), so no
  existing level drops. Outside it a single huge lift can pay less than before (bench 300 kg alone:
  old 10 + 10, new 7 + 7), because one lift now earns at most 7.
  Example, bench max 50 kg only, bodyweight 80 kg: old 0 + 0 = 0, new 2 + 4 (50/80 = 0.625 ≥ 0.6) = 6.

**Hold exercises** (plank, dead hang; a set is `{ seconds }`, 1–3600, instead of reps × kg) store only
`duration_seconds`: no reps, no load, `excluded_from_trend = 1`. They skip the load conversion/correction
funnel and never count toward tonnage, lift points, the bench/squat maxes
or the lift history. A hold-only session still counts as "last session" on the tab.

**Monotonic under insertion:** adding a session or a weigh-in at ANY date (incl. back-dated, or an
exercise added to an existing day) never lowers the level. Editing or deleting a session MAY
lower it (same as deleting a run lowers STAMINA).

`confidence` = always high; `note` = empty. `breakdown` = `Total lifted` (kg) / `Best lifts` (kg, the SUM of
the three per-lift bests, a missing lift = 0) / `Lifts ÷ body weight` (×bw, that sum ÷ the bodyweight above).
Displayed values are FLOORED (kg to 1 dp, ×bw to 2 dp); each row's `level` is **points contributed** to the
100-pt total (`floor(base)`, key-lift bonus, relative bonus). `lastSessionDaysAgo` (additive field) = days since
the latest session on/after the fresh start (hold-only sessions included), null = none. Empty breakdown before
the first counted session (LV0, `toNext`/`nextLevelValue` in points toward LV1, like STAMINA).

## LEANNESS (fat loss) — toward the goal weight @ goal body-fat % (target fat mass = weight × bf%)
- `value` = progress on **fat mass** from the first weigh-in toward the goal:
  `fraction = clamp((startFat − curFat)/(startFat − targetFat), 0, 1)`, `targetFat = goalWeightKg × goalBodyFatPct/100` (default 75 × 15 % = 11.25 kg), curved (exp 1.1).
  Fat mass = weight × bf%. Goals come from `AthleteConfig.goals` (`targetFatMassKg` in `gamification/goals.ts`); `computeLeanness` takes the resolved goals, so changing a goal recomputes the stat.
- **Fresh-start anchor**: "first weigh-in" means the earliest point on/after
  `LEANNESS_FRESH_START`, not the whole history, so an earlier baseline
  weigh-in doesn't distort the "how far have you come" mirror. Falls back to the
  unfiltered history only when there are ZERO weigh-ins on/after the anchor. This anchor is a
  single shared helper (`anchoredWeightPoints` in `gamification/stats.ts`) applied to EVERY
  weight-progress baseline in the app, not just this stat: the QUESTS leanness quest below.
  They must never each compute their own baseline, or the same "progress since the restart"
  would read differently in two places.
- No body-fat % logged → falls back to weight toward the goal weight (`confidence` low).
- `confidence` = low, until ≥2 weigh-ins span ≥4 weeks → medium (`computeLeanness`).
- LEANNESS can sit at 0 after a weight regain: progress clamps at 0. By design, not a bug.

## QUESTS — "on the road to your goals" (goal-oriented)
`goalQuests(runs, weightPoints, goals)` → three quests toward the END goals (the editable goals): leaner
(goal weight @ goal body-fat %, on fat mass), faster (goal pace), more volume (goal km/wk).
Each carries `current/target/unit/pct/done/detail`. Context/motivation only — never a
stat input.
- **Ladders** (`goals.ts`, built from the goal): fixed pace rungs `8:30 → 8:00 → 7:30 → 7:00 → 6:30 → 6:00 → 5:30 → 5:00`
  min/km and fixed volume rungs `10 → 15 → 20 → 30 → 40 → 50` km/wk. `paceLadder(goal)` = the rungs STRICTLY
  slower than the goal, then the goal as the last rung; `weeklyKmLadder(goal)` = the rungs strictly below the goal,
  then the goal (goal on a rung: no duplicate; goal easier than every rung: the goal is the only rung; goal harder
  than every rung: all rungs, then the goal). `ladderStep` picks the next UNREACHED rung + the previous one
  (pace reached when `pace <= rung`, volume when `wk >= rung`; exactly on a rung = reached).
- **pct is measured from the previous rung**: pace `(prev − pace)/(prev − next)` (prev = previous
  rung, or `max(PACE_LADDER_FLOOR 9:00, next + 0:30)` for the first), volume `(wk − prev)/(next − prev)` (prev = 0 for
  the first); clamped 0–100. The label/target is the NEXT rung; the detail names the end goal.
- **`done` only at the END goal** (pace ≤ goal pace, ≥ goal km/wk) — reaching a rung just advances the target.
- Pace = best single-run average pace in the last 28 days (quest only exists with a run in the
  window); volume = 28-day rolling average ×7 anchored on the latest run.

## Weekly report — `views/weekly-report.ts` (STATUS, display only)
Last COMPLETED local Mon–Sun week (`lastCompletedWeekRange`, so Monday 00:00 rolls it over; the current week is never
included) next to the week before it. Dates are local calendar dates (`Run.startTimeLocal`). A metric with no data is
`null` (shown "—"), never 0; a week with no data in any row shows "No data".
- Runs: count; km (1 decimal); pace = Σ time ÷ Σ km (distance-weighted, moving speed as in STAMINA); avg HR = mean of runs that have HR.
- Strength: sessions = distinct dates with any set on/after `STRENGTH_FRESH_START` (hold-only sessions count); kg lifted = the
  STRENGTH tonnage rule (`isLoadedSet`/`setTonnageKg`: load × reps, hold sets excluded), null when no loaded set.
- Vitals: mean HRV / resting HR / sleep score / Body Battery (%) of the `recovery_days` rows in the week, skipping nulls.
- Weight: last weigh-in in the week minus the last weigh-in BEFORE the week; null if either is missing.
- Arrow = last week vs the week before: `up`/`down`, or `same` when the change is within 2% of the week-before value
  (weight: within 0.1 kg). Null when either side is null. Arrows are neutral in the UI (no good/bad colour).

## Shoe mileage — `conventions/shoe-mileage.ts`
Total = `priorCountedKm` (the shoe's distance at the start) + km of runs logged with that shoe since
(`reconcileShoeMileage`). Every run in the DB is new mileage, since pre-reset runs were wiped (never re-import the archived pre-reset exports).

## Coaching
- Recovery windows: 7-day HRV & sleep, 3-day resting HR; null-skipping (rolling
  average, coverage-based confidence). These are no longer the direct readiness-gate
  input (see Readiness below) — they're the per-signal FALLBACK when `asOf` has no
  reading yet, and the coverage/confidence signal (`DashboardDTO.recovery`). The
  VITALS tab tiles show each vital's latest DAILY reading instead (display only,
  dated so a stale point is never shown as today's), and a separate `recoveryWeek`
  slice (`lastCompletedRecoveryWeek`, `coaching/recovery-windows.ts`) carries the
  LAST COMPLETED Mon–Sun week's per-field averages for Home's weekly overview card —
  the Mon–Sun block ending before the Monday of `asOf`'s own week (so it's always the
  PRIOR week, on any day, and rolls over automatically every Monday with no stored
  state). Per field, only non-null days average; `nDays` counts days (of the 7)
  carrying ANY reading across the four fields, not per-field; an all-null field
  returns `null`.
- Readiness (`coaching/readiness.ts` `dailyReadiness`): judges TODAY's HRV, sleep,
  and resting HR (the `recovery_days` row for `asOf`) against the athlete's
  baseline — suppressed HRV (<92% of `hrvBaselineMs`) + poor sleep (score <55) ⇒
  easy; + elevated resting HR (>baseline+5) ⇒ rest. Per signal, when `asOf` has no
  reading yet, falls back to that signal's rolling window above instead of skipping
  it. Confidence starts from `worst(hrv.window.confidence, sleep.window.confidence)`
  (+ resting HR's window confidence when it drove the call), THEN degrades one step
  (high→medium, medium→low, low stays low) if any contributing signal used the
  window fallback rather than today's own reading — the rationale says so
  explicitly ("No HRV reading for today — fell back to the 7-day average…"). No
  data at all (today or window, for both HRV and sleep) ⇒ easy (low confidence).
- Coaching helpers:
  - `coaching/hrv-baseline.ts`: self-referenced ln(HRV) baseline (rolling short window vs a
    28-day window, `MIN_BASELINE_DAYS` = 28; `ready` needs `MIN_BASELINE_READINGS` = 20
    readings). Display only (DTO `hrv` slice + today's flag) — NOT a readiness-gate input,
    which still uses `hrvBaselineMs`.
- Run classifier: subtract the heat offset (≈0.5 bpm/°C above 20°C, cap 10) BEFORE
  judging Z4 drift (`heatHrOffset`, `conventions/heat.ts`); hedge near the soft Z3/Z4 line (Z4 lower bound =
  80% of max HR, `z3z4LineBpm`, not hardcoded); FLAG, never a verdict; assert a pattern only with
  ≥3 considered recent runs and at least half flagged (`coaching-engine.ts`); otherwise the flags are "isolated".
- Read-together: weight + distance + HR jointly; the efficiency signal is the
  falling resting HR (not noisy pace-vs-HR); never concludes "slower".
