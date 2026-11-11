import { assembleDashboard, recomputeStats } from '@solace/data';
import type { Deps } from '../deps.ts';
import { BadRequest, json, jsonBody, type Routes } from '../http.ts';
import { goalField, isoOf, num, str } from '../validate.ts';

/** The dashboard DTO plus everything that feeds the stat tracks: Garmin sync, weigh-ins, goals. */
export function trainingRoutes({ repo, clock, serialize, sync, sky }: Deps): Routes {
  return {
    '/api/dashboard': {
      GET: async ({ res }) => {
        const dto = await assembleDashboard(repo, clock, await sky());
        if (dto) json(res, 200, dto);
        else json(res, 503, { error: 'Not seeded — drop your export files to begin.' });
      },
    },

    // Pull everything new from Garmin (runs + wellness), ingest, recompute, and return the fresh dashboard.
    // CommandBar ⟲ button.
    '/api/sync-garmin': {
      POST: async ({ res }) => {
        const out = await sync.run(); // a non-Garmin error propagates to dispatch (logged, generic 500)
        if (out.state === 'busy') return json(res, 409, { ok: false, error: 'busy', message: 'A Garmin sync is already running.' });
        if (out.state === 'failed') return json(res, 200, { ok: false, error: out.kind, message: out.message });
        json(res, 200, { ok: true, summary: out.summary, dashboard: await assembleDashboard(repo, clock, await sky()) });
      },
    },

    // Add a manual weight point (VITALS).
    '/api/weight': {
      POST: async ({ req, res }) => {
        const b = await jsonBody(req);
        // Coerce through num() — JSON can deliver any runtime type; an unchecked string/object would be
        // bound straight into the REAL column (corrupt data, or a 500 from better-sqlite3).
        const date = isoOf(str(b['date']) ?? clock.today());
        const weightKg = num(b['weightKg']);
        if (date == null || weightKg == null || weightKg <= 20 || weightKg > 400) throw new BadRequest('need a valid date (YYYY-MM-DD) and numeric weightKg above 20 and at most 400');
        const bodyFatPct = b['bodyFatPct'] == null ? null : num(b['bodyFatPct']);
        if (b['bodyFatPct'] != null && (bodyFatPct == null || bodyFatPct < 0 || bodyFatPct > 100)) throw new BadRequest('bodyFatPct must be a number 0–100');
        await serialize(async () => {
          await repo.saveWeightPoint({ date, weightKg, bodyFatPct, source: 'manual', notes: null });
          await recomputeStats(repo, clock);
        });
        json(res, 200, { ok: true });
      },
    },

    // Replace the four editable goals (VITALS). All four keys are required; a number sets the goal, null
    // resets it to the neutral default. Any bad value → 400 and nothing is written. Recomputes the stats
    // (LEANNESS depends on the goals) inside the serialised queue, like the weigh-in route.
    '/api/goals': {
      PATCH: async ({ req, res }) => {
        const b = await jsonBody(req);
        const goals = {
          weightKg: goalField(b, 'weightKg', 30, 250),
          bodyFatPct: goalField(b, 'bodyFatPct', 3, 60),
          paceMinPerKm: goalField(b, 'paceMinPerKm', 2.5, 15),
          weeklyKm: goalField(b, 'weeklyKm', 1, 300),
        };
        await serialize(async () => {
          const config = await repo.getAthleteConfig();
          if (!config) return json(res, 503, { error: 'not seeded' });
          await repo.saveAthleteConfig({ ...config, goals });
          await recomputeStats(repo, clock);
          json(res, 200, { ok: true });
        });
      },
    },
  };
}
