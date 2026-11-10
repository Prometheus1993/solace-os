import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Clock, UnixSeconds } from '@solace/core';
import { migrate, openDatabase, SqliteRepository } from '@solace/data';
import { dispatch, mergeRoutes, type Routes } from '../src/http.ts';
import type { Deps } from '../src/deps.ts';
import { examRoutes } from '../src/routes/exams.ts';
import { schoolTaskRoutes } from '../src/routes/school-tasks.ts';

// In-process (no server process, no live DB): the real route table over an in-memory repository.

const clock: Clock = { now: () => 0 as UnixSeconds, today: () => '2026-11-05' };

function setup() {
  const db = openDatabase(':memory:');
  migrate(db);
  const repo = new SqliteRepository(db);
  const deps = { repo, clock } as unknown as Deps;
  const routes: Routes = mergeRoutes(examRoutes(deps), schoolTaskRoutes(deps));
  const call = async (method: string, url: string, body?: unknown) => {
    const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), { method, url, headers: {} }) as unknown as IncomingMessage;
    let finish = () => {};
    const done = new Promise<void>((r) => (finish = r));
    const out = { status: 0, body: undefined as unknown };
    const res = {
      headersSent: false,
      statusCode: 0,
      setHeader: () => {},
      end(this: { statusCode: number; headersSent: boolean }, text: string) {
        out.status = this.statusCode;
        out.body = JSON.parse(text);
        this.headersSent = true;
        finish();
      },
    } as unknown as ServerResponse;
    dispatch(routes, req, res);
    await done;
    return out as { status: number; body: Record<string, unknown> };
  };
  return { repo, call };
}

describe('/api/school-tasks', () => {
  it('POST creates a task (kind defaults to task) and the repo sees it', async () => {
    const { repo, call } = setup();
    const r = await call('POST', '/api/school-tasks', { title: '  Report  ', deadline: '2026-11-20', course: 'Networking' });
    expect(r.status).toBe(200);
    const [t] = await repo.listSchoolTasks();
    expect(t).toMatchObject({ id: r.body['id'], title: 'Report', kind: 'task', deadline: '2026-11-20', course: 'Networking', done: false, doneDate: null });
  });

  it('POST: missing/blank title, missing deadline, impossible date, and bad kind are 400s that write nothing', async () => {
    const { repo, call } = setup();
    for (const body of [{ deadline: '2026-11-20' }, { title: '   ', deadline: '2026-11-20' }, { title: 'x' }, { title: 'x', deadline: '2026-13-40' }, { title: 'x', deadline: '20-11-2026' }, { title: 'x', deadline: '2026-11-20', kind: 'homework' }]) {
      expect({ body, status: (await call('POST', '/api/school-tasks', body)).status }).toEqual({ body, status: 400 });
    }
    expect(await repo.listSchoolTasks()).toEqual([]);
  });

  it('PATCH done=true stamps today, done=false clears it; blanking course/notes clears them', async () => {
    const { repo, call } = setup();
    const id = (await call('POST', '/api/school-tasks', { title: 'Company visit', kind: 'company_visit', deadline: '2026-11-10', course: 'Internship', notes: 'n' })).body['id'];
    expect((await call('PATCH', `/api/school-tasks?id=${id}`, { done: true })).status).toBe(200);
    expect((await repo.listSchoolTasks())[0]).toMatchObject({ done: true, doneDate: '2026-11-05', course: 'Internship' });
    await call('PATCH', `/api/school-tasks?id=${id}`, { done: false, course: '', notes: '' });
    expect((await repo.listSchoolTasks())[0]).toMatchObject({ done: false, doneDate: null, course: null, notes: null, title: 'Company visit', kind: 'company_visit' });
  });

  it('PATCH: a bad deadline/blank title/bad kind is a 400, an unknown id is a 404, a missing ?id= is a 400', async () => {
    const { call } = setup();
    const id = (await call('POST', '/api/school-tasks', { title: 'T', deadline: '2026-11-10' })).body['id'];
    expect((await call('PATCH', `/api/school-tasks?id=${id}`, { deadline: 'soon' })).status).toBe(400);
    expect((await call('PATCH', `/api/school-tasks?id=${id}`, { title: '' })).status).toBe(400);
    expect((await call('PATCH', `/api/school-tasks?id=${id}`, { kind: 'nope' })).status).toBe(400);
    expect((await call('PATCH', '/api/school-tasks?id=9999', { title: 'x' })).status).toBe(404);
    expect((await call('PATCH', '/api/school-tasks', { title: 'x' })).status).toBe(400);
  });

  it('DELETE removes the row; routing is exact-match so look-alike paths never reach it', async () => {
    const { repo, call } = setup();
    const id = (await call('POST', '/api/school-tasks', { title: 'Keep', deadline: '2026-11-10' })).body['id'];
    for (const url of [`/api/school-tasks-lookup?id=${id}`, `/api/school-tasks/?id=${id}`, `/api/school-task?id=${id}`, `/api/school-tasks/${id}`]) {
      expect({ url, status: (await call('DELETE', url)).status }).toEqual({ url, status: 404 });
    }
    expect(await repo.listSchoolTasks()).toHaveLength(1);
    expect((await call('DELETE', `/api/school-tasks?id=${id}`)).body).toEqual({ ok: true, deleted: true });
    expect(await repo.listSchoolTasks()).toEqual([]);
  });

  it('is its own route key: merging with a second /api/school-tasks table throws at boot', () => {
    const { repo } = setup();
    const deps = { repo, clock } as unknown as Deps;
    expect(() => mergeRoutes(schoolTaskRoutes(deps), schoolTaskRoutes(deps))).toThrow('duplicate route /api/school-tasks');
  });
});
