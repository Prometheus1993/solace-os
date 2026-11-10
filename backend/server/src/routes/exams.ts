import type { ExamPatch } from '@solace/core';
import { EXAM_STATUSES } from '@solace/core';
import type { Deps } from '../deps.ts';
import { asBadRequest, json, jsonBody, requireId, type Routes } from '../http.ts';
import { bool, inEnum, intNonNeg, isoOf, need, ranged, str } from '../validate.ts';

/** MISSIONS: manual exam entry. No recompute — exams don't feed the stat tracks. */
export function examRoutes({ repo }: Deps): Routes {
  return {
    '/api/exams': {
      POST: async ({ req, res }) => {
        const b = await jsonBody(req);
        const course = need(str(b['course']), 'need course and examDate (YYYY-MM-DD)');
        const examDate = need(isoOf(b['examDate']), 'need course and examDate (YYYY-MM-DD)');
        const grade = ranged(b, 'grade', 0, 20);
        const resitGrade = ranged(b, 'resitGrade', 0, 20);
        const exam = await asBadRequest(() =>
          repo.addExam({ course, examDate, status: inEnum(b['status'], EXAM_STATUSES) ?? 'scheduled', grade, resitDate: isoOf(b['resitDate']), resitGrade, credits: intNonNeg(b['credits']), deliberated: bool(b['deliberated']), notes: str(b['notes']) }),
        );
        json(res, 200, { ok: true, id: exam.id });
      },

      PATCH: async ({ req, res, url }) => {
        const id = requireId(url);
        const b = await jsonBody(req);
        const p: ExamPatch = {};
        const course = str(b['course']);
        if (course) p.course = course;
        const examDate = isoOf(b['examDate']);
        if (examDate) p.examDate = examDate;
        const status = inEnum(b['status'], EXAM_STATUSES);
        if (status) p.status = status;
        if ('grade' in b) p.grade = ranged(b, 'grade', 0, 20);
        if ('resitGrade' in b) p.resitGrade = ranged(b, 'resitGrade', 0, 20);
        if ('resitDate' in b) p.resitDate = isoOf(b['resitDate']);
        if ('credits' in b) p.credits = intNonNeg(b['credits']);
        if ('deliberated' in b) p.deliberated = bool(b['deliberated']);
        if ('notes' in b) p.notes = str(b['notes']);
        const updated = await asBadRequest(() => repo.updateExam(id, p));
        if (updated) json(res, 200, { ok: true });
        else json(res, 404, { error: 'not found' });
      },

      DELETE: async ({ res, url }) => {
        json(res, 200, { ok: true, deleted: await repo.deleteExam(requireId(url)) });
      },
    },
  };
}
