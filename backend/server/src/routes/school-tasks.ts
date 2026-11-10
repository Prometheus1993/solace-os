import type { SchoolTaskPatch } from '@solace/core';
import { SCHOOL_TASK_KINDS } from '@solace/core';
import type { Deps } from '../deps.ts';
import { asBadRequest, BadRequest, json, jsonBody, requireId, type Routes } from '../http.ts';
import { bool, inEnum, isoOf, need, str } from '../validate.ts';

/** SCHOOL TERM: manual school task/deadline entry. No recompute — tasks don't feed the stat tracks. */
export function schoolTaskRoutes({ repo, clock }: Deps): Routes {
  /** The kind when the body carries one: absent/null stays absent, anything outside the enum is a 400. */
  const kindOf = (v: unknown) => (v == null ? null : need(inEnum(v, SCHOOL_TASK_KINDS), `kind must be one of ${SCHOOL_TASK_KINDS.join('/')}`));
  /** doneDate follows `done`: ticking off stamps the given (valid) date or today, un-ticking clears it. */
  const doneDateOf = (done: boolean, v: unknown) => (done ? (isoOf(v) ?? clock.today()) : null);

  return {
    '/api/school-tasks': {
      POST: async ({ req, res }) => {
        const b = await jsonBody(req);
        const title = need(str(b['title']), 'need title and deadline (YYYY-MM-DD)');
        const deadline = need(isoOf(b['deadline']), 'need title and deadline (YYYY-MM-DD)');
        const done = bool(b['done']);
        const task = await asBadRequest(() =>
          repo.addSchoolTask({ title, kind: kindOf(b['kind']) ?? 'task', deadline, course: str(b['course']), notes: str(b['notes']), done, doneDate: doneDateOf(done, b['doneDate']) }),
        );
        json(res, 200, { ok: true, id: task.id });
      },

      PATCH: async ({ req, res, url }) => {
        const id = requireId(url);
        const b = await jsonBody(req);
        const p: SchoolTaskPatch = {};
        if ('title' in b) p.title = need(str(b['title']), 'title cannot be blank');
        if ('deadline' in b) p.deadline = need(isoOf(b['deadline']), 'deadline must be YYYY-MM-DD');
        if ('kind' in b) {
          const kind = kindOf(b['kind']);
          if (!kind) throw new BadRequest(`kind must be one of ${SCHOOL_TASK_KINDS.join('/')}`);
          p.kind = kind;
        }
        if ('course' in b) p.course = str(b['course']);
        if ('notes' in b) p.notes = str(b['notes']);
        if ('done' in b) {
          p.done = bool(b['done']);
          p.doneDate = doneDateOf(p.done, b['doneDate']);
        }
        const updated = await asBadRequest(() => repo.updateSchoolTask(id, p));
        if (updated) json(res, 200, { ok: true });
        else json(res, 404, { error: 'not found' });
      },

      DELETE: async ({ res, url }) => {
        json(res, 200, { ok: true, deleted: await repo.deleteSchoolTask(requireId(url)) });
      },
    },
  };
}
