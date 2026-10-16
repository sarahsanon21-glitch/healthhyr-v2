import { describe, expect, it } from 'vitest';
import {
  createAdmin,
  createApplication,
  createEmployer,
  createJob,
  createSeeker,
  grantPro,
  optIn,
} from './fixtures';
import { tx, type Db } from './helpers';

async function scene(db: Db, applicationOptions: Parameters<typeof createApplication>[3] = {}) {
  const employer = await createEmployer(db, 'Sunrise Care');
  const otherEmployer = await createEmployer(db, 'Beta Care');
  const seeker = await createSeeker(db);
  const otherSeeker = await createSeeker(db);
  const job = await createJob(db, employer, { status: 'published' });
  const application = await createApplication(db, job, seeker, applicationOptions);
  return { employer, otherEmployer, seeker, otherSeeker, job, application };
}

const appRow = (db: Db, id: string) =>
  db.one('select status, cover_note, resume_url, job_id, seeker_id from applications where id = $1', [id]);

describe('applications: reading', () => {
  it('the seeker and the job owner can read it; others cannot', () =>
    tx(async (db) => {
      const s = await scene(db);
      for (const actor of [s.seeker, s.employer]) {
        await db.asUser(actor);
        expect(await db.count('select 1 from applications where id = $1', [s.application])).toBe(1);
      }
      for (const actor of [s.otherSeeker, s.otherEmployer]) {
        await db.asUser(actor);
        expect(await db.count('select 1 from applications where id = $1', [s.application])).toBe(0);
      }
      await db.asAnon();
      expect(await db.count('select 1 from applications where id = $1', [s.application])).toBe(0);
    }));

  it('an admin can read applications', () =>
    tx(async (db) => {
      const s = await scene(db);
      const admin = await createAdmin(db);
      await db.asUser(admin);
      expect(await db.count('select 1 from applications where id = $1', [s.application])).toBe(1);
    }));
});

describe('applications: creating (API only)', () => {
  it('a seeker cannot insert an application directly; it goes through the API', () =>
    tx(async (db) => {
      const s = await scene(db);
      const job2 = await createJob(db, s.employer, { status: 'published' });
      await db.asUser(s.seeker);
      await db.expectError('insert into applications (job_id, seeker_id) values ($1, $2)', [job2, s.seeker], /permission denied/);
    }));

  it('there is one application per seeker per job', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asService();
      await db.expectError('insert into applications (job_id, seeker_id) values ($1, $2)', [s.job, s.seeker], /duplicate key/);
    }));
});

describe('applications: what an employer may change', () => {
  it.each(['viewed', 'shortlisted', 'interview', 'hired', 'rejected'])('may set the status to %s', (status) =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.employer);
      await db.q('update applications set status = $2 where id = $1', [s.application, status]);
      expect((await appRow(db, s.application)).status).toBe(status);
    }));

  it.each(['submitted', 'withdrawn'])('may not set the status to %s', (status) =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.employer);
      await db.expectError('update applications set status = $2 where id = $1', [s.application, status], /invalid status for employer/);
    }));

  it('may not change the cover note, resume, job or seeker', () =>
    tx(async (db) => {
      const s = await scene(db);
      const job2 = await createJob(db, s.employer, { status: 'published' });
      await db.asUser(s.employer);
      for (const [column, value] of [
        ['cover_note', 'Rewritten'],
        ['resume_url', 'resumes/other.pdf'],
        ['job_id', job2],
        ['seeker_id', s.otherSeeker],
      ] as const) {
        await db.expectError(`update applications set ${column} = $2 where id = $1`, [s.application, value], /permission denied|only status can change/);
      }
      const row = await appRow(db, s.application);
      expect(row.cover_note).toBe('Hello, I would like to apply.');
      expect(row.job_id).toBe(s.job);
    }));

  it('another employer cannot change it at all (no rows affected)', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.otherEmployer);
      expect(await db.count(`update applications set status = 'hired' where id = $1`, [s.application])).toBe(0);
      await db.asSuperuser();
      expect((await appRow(db, s.application)).status).toBe('submitted');
    }));

  it('cannot change a withdrawn application', () =>
    tx(async (db) => {
      const s = await scene(db, { status: 'withdrawn' });
      await db.asUser(s.employer);
      await db.expectError(`update applications set status = 'shortlisted' where id = $1`, [s.application], /invalid status for employer|row-level security/);
    }));
});

describe('applications: what a seeker may change', () => {
  it('may withdraw', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.seeker);
      await db.q(`update applications set status = 'withdrawn' where id = $1`, [s.application]);
      expect((await appRow(db, s.application)).status).toBe('withdrawn');
    }));

  it('may not set any other status', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.seeker);
      for (const status of ['submitted', 'viewed', 'shortlisted', 'interview', 'hired', 'rejected']) {
        await db.expectError('update applications set status = $2 where id = $1', [s.application, status], /seekers may only withdraw/);
      }
    }));

  it('may not edit the cover note, resume or job', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.seeker);
      await db.expectError(`update applications set cover_note = 'Changed' where id = $1`, [s.application], /permission denied|only status can change/);
      await db.expectError(`update applications set resume_url = 'x' where id = $1`, [s.application], /permission denied|only status can change/);
    }));

  it('may not withdraw twice, or touch someone else’s application', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.seeker);
      await db.q(`update applications set status = 'withdrawn' where id = $1`, [s.application]);
      await db.expectError(`update applications set status = 'withdrawn' where id = $1`, [s.application], /seekers may only withdraw/);
      await db.asUser(s.otherSeeker);
      expect(await db.count(`update applications set status = 'withdrawn' where id = $1`, [s.application])).toBe(0);
    }));

  it('cannot delete applications', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.seeker);
      await db.expectError('delete from applications where id = $1', [s.application], /permission denied/);
    }));
});

describe('withdrawal clears private content', () => {
  it('a seeker withdrawing clears the cover note and resume', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.seeker);
      await db.q(`update applications set status = 'withdrawn' where id = $1`, [s.application]);
      const row = await appRow(db, s.application);
      expect(row.cover_note).toBeNull();
      expect(row.resume_url).toBeNull();
    }));

  it('the employer then sees only the status, with nothing left to read', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.seeker);
      await db.q(`update applications set status = 'withdrawn' where id = $1`, [s.application]);
      await db.asUser(s.employer);
      expect(await appRow(db, s.application)).toMatchObject({ status: 'withdrawn', cover_note: null, resume_url: null });
    }));

  it('clears them for every caller, including the service role', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asService();
      await db.q(`update applications set status = 'withdrawn' where id = $1`, [s.application]);
      expect(await appRow(db, s.application)).toMatchObject({ cover_note: null, resume_url: null });
    }));

  it('the database refuses a withdrawn row that still holds a resume or cover note', () =>
    tx(async (db) => {
      const s = await scene(db);
      const job2 = await createJob(db, s.employer, { status: 'published' });
      await db.asService();
      await db.expectError(
        `insert into applications (job_id, seeker_id, status, resume_url) values ($1, $2, 'withdrawn', 'resumes/x.pdf')`,
        [job2, s.seeker],
        /applications_withdrawn_clean/,
      );
    }));
});

describe('messages: who may send', () => {
  const send = (db: Db, from: string, to: string, body = 'Hello there') =>
    db.attempt('insert into messages (sender_id, recipient_id, body) values ($1, $2, $3) returning id', [from, to, body]);

  it('an employer may message a seeker who applied to them', async () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.employer);
      expect((await send(db, s.employer, s.seeker)).ok).toBe(true);
    }));

  it('an employer may not message a seeker with no relationship', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.employer);
      const result = await send(db, s.employer, s.otherSeeker);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/row-level security/);
    }));

  it("an employer may not message another employer's applicant", () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.otherEmployer);
      expect((await send(db, s.otherEmployer, s.seeker)).ok).toBe(false);
    }));

  it('an employer without Hiring Pro may not message an opted-in seeker; with Hiring Pro they may', () =>
    tx(async (db) => {
      const s = await scene(db);
      await optIn(db, s.otherSeeker);
      await db.asUser(s.employer);
      expect((await send(db, s.employer, s.otherSeeker)).ok).toBe(false);
      await grantPro(db, s.employer);
      await db.asUser(s.employer);
      expect((await send(db, s.employer, s.otherSeeker)).ok).toBe(true);
    }));

  it('Hiring Pro does not allow messaging a seeker who has not opted in', () =>
    tx(async (db) => {
      const s = await scene(db);
      await grantPro(db, s.employer);
      await db.asUser(s.employer);
      expect((await send(db, s.employer, s.otherSeeker)).ok).toBe(false);
    }));

  it('a seeker may not start a conversation with a stranger employer, but may reach one they applied to', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.seeker);
      expect((await send(db, s.seeker, s.otherEmployer)).ok).toBe(false);
      expect((await send(db, s.seeker, s.employer)).ok).toBe(true);
    }));

  it('a seeker may reply to an employer who messaged them first', () =>
    tx(async (db) => {
      const s = await scene(db);
      await optIn(db, s.otherSeeker);
      await grantPro(db, s.employer);
      await db.asUser(s.employer);
      await send(db, s.employer, s.otherSeeker, 'We would like to talk');
      await db.asUser(s.otherSeeker);
      expect((await send(db, s.otherSeeker, s.employer, 'Thanks, I am interested')).ok).toBe(true);
    }));

  it('a withdrawn application ends both directions of messaging', () =>
    tx(async (db) => {
      const s = await scene(db, { status: 'withdrawn' });
      await db.asUser(s.employer);
      expect((await send(db, s.employer, s.seeker)).ok).toBe(false);
      await db.asUser(s.seeker);
      expect((await send(db, s.seeker, s.employer)).ok).toBe(false);
    }));

  it('no one can send as someone else', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.otherSeeker);
      expect((await send(db, s.seeker, s.employer)).ok).toBe(false);
    }));

  it('enforces the 4000 character limit and rejects empty bodies', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asUser(s.employer);
      expect((await send(db, s.employer, s.seeker, 'x'.repeat(4001))).ok).toBe(false);
      expect((await send(db, s.employer, s.seeker, '')).ok).toBe(false);
      expect((await send(db, s.employer, s.seeker, 'x'.repeat(4000))).ok).toBe(true);
    }));

  it('anon cannot send', () =>
    tx(async (db) => {
      const s = await scene(db);
      await db.asAnon();
      expect((await send(db, s.employer, s.seeker)).ok).toBe(false);
    }));
});

describe('messages: who may read and change', () => {
  async function conversation(db: Db) {
    const s = await scene(db);
    await db.asUser(s.employer);
    const id = (await db.one('insert into messages (sender_id, recipient_id, body) values ($1, $2, $3) returning id', [s.employer, s.seeker, 'Hello'])).id as string;
    return { ...s, message: id };
  }

  it('only the sender and the recipient (and admins) can read it', () =>
    tx(async (db) => {
      const s = await conversation(db);
      const admin = await createAdmin(db);
      for (const actor of [s.employer, s.seeker, admin]) {
        await db.asUser(actor);
        expect(await db.count('select 1 from messages where id = $1', [s.message])).toBe(1);
      }
      for (const actor of [s.otherSeeker, s.otherEmployer]) {
        await db.asUser(actor);
        expect(await db.count('select 1 from messages where id = $1', [s.message])).toBe(0);
      }
      await db.asAnon();
      expect(await db.count('select 1 from messages where id = $1', [s.message])).toBe(0);
    }));

  it('the recipient can mark it read, once', () =>
    tx(async (db) => {
      const s = await conversation(db);
      await db.asUser(s.seeker);
      await db.q('update messages set read_at = now() where id = $1', [s.message]);
      expect((await db.one('select read_at is not null as read from messages where id = $1', [s.message])).read).toBe(true);
      await db.expectError('update messages set read_at = now() where id = $1', [s.message], /only mark an unread message as read/);
      await db.expectError('update messages set read_at = null where id = $1', [s.message], /only mark an unread message as read/);
    }));

  it('the recipient cannot edit the body, sender or recipient', () =>
    tx(async (db) => {
      const s = await conversation(db);
      await db.asUser(s.seeker);
      for (const sql of [
        `update messages set body = 'Edited' where id = $1`,
        `update messages set sender_id = '${s.otherSeeker}' where id = $1`,
        `update messages set recipient_id = '${s.otherSeeker}' where id = $1`,
      ]) {
        await db.expectError(sql, [s.message], /permission denied/);
      }
    }));

  it('the sender cannot edit or mark their own message as read', () =>
    tx(async (db) => {
      const s = await conversation(db);
      await db.asUser(s.employer);
      await db.expectError(`update messages set body = 'Edited' where id = $1`, [s.message], /permission denied/);
      expect(await db.count('update messages set read_at = now() where id = $1', [s.message])).toBe(0);
    }));

  it('a stranger cannot mark it read (no rows affected)', () =>
    tx(async (db) => {
      const s = await conversation(db);
      await db.asUser(s.otherSeeker);
      expect(await db.count('update messages set read_at = now() where id = $1', [s.message])).toBe(0);
    }));

  it('nobody can delete messages', () =>
    tx(async (db) => {
      const s = await conversation(db);
      for (const actor of [s.employer, s.seeker]) {
        await db.asUser(actor);
        await db.expectError('delete from messages where id = $1', [s.message], /permission denied/);
      }
    }));
});
