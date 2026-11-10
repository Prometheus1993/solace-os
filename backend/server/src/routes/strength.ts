import { ManualStrengthValidationError, MAX_REPS, MAX_WEIGHT_KG, deleteLoggedStrengthSession, listLoggedStrengthSessions, logStrengthSession, validateManualStrengthInput } from '@solace/data';
import { STRENGTH_FRESH_START, type StrengthLogList } from '@solace/core';
import type { Deps } from '../deps.ts';
import { BadRequest, json, jsonBody, requireId, type Handler, type Routes } from '../http.ts';
import { bool } from '../validate.ts';

const REFUSAL: Record<string, string> = {
  future_date: 'That date is in the future.',
  before_reset: `That date is before the journey reset (${STRENGTH_FRESH_START}).`,
  bounds: `A set is out of range (weight over ${MAX_WEIGHT_KG} kg or reps over ${MAX_REPS}).`,
  archived: 'That session is archived (pre-reset) and cannot be changed.',
};

/** TRAINING → STRENGTH: log, list, edit and delete gym sessions. */
export function strengthRoutes({ repo, clock, serialize }: Deps): Routes {
  // POST adds, PATCH ?id= replaces: one handler, one set of rules.
  const save =
    (replacing: boolean): Handler =>
    async ({ req, res, url }) => {
      const replaceId = replacing ? requireId(url) : undefined;
      const b = await jsonBody(req);
      let input;
      try {
        input = validateManualStrengthInput({ date: b['date'], notes: b['notes'] ?? undefined, exercises: b['exercises'] });
      } catch (e) {
        if (e instanceof ManualStrengthValidationError) throw new BadRequest(e.message);
        throw e;
      }
      const r = await serialize(() => logStrengthSession(repo, clock, input, { allowSameDay: bool(b['allowSameDay']), replaceId }));
      switch (r.status) {
        case 'saved':
          return json(res, 200, { ok: true, status: 'saved', sessionId: r.sessionId, strength: r.strength });
        case 'already_logged':
          return json(res, 200, { ok: true, status: 'already_logged', sessionId: r.sessionId, strength: null });
        case 'same_day':
          return json(res, 409, { ok: false, error: 'same_day', existingSessionId: r.existingSessionId, date: r.date });
        case 'refused':
          if (r.reason === 'not_found') return json(res, 404, { error: 'not found' });
          return json(res, 400, { error: REFUSAL[r.reason] });
      }
    };

  return {
    '/api/strength': {
      GET: async ({ res }) => {
        const body: StrengthLogList = { sessions: await listLoggedStrengthSessions(repo) };
        json(res, 200, body);
      },
      POST: save(false),
      PATCH: save(true),
      DELETE: async ({ res, url }) => {
        const id = requireId(url);
        const r = await serialize(() => deleteLoggedStrengthSession(repo, clock, id));
        if (r.status === 'deleted') return json(res, 200, { ok: true });
        if (r.reason === 'not_found') return json(res, 404, { error: 'not found' });
        json(res, 400, { error: REFUSAL[r.reason] });
      },
    },
  };
}
