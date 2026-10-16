import { describe, expect, it } from 'vitest';
import {
  addSeekerDetails,
  createAdmin,
  createApplication,
  createEmployer,
  createJob,
  createSeeker,
  grantPro,
  optIn,
} from './fixtures';
import { tx, type Db } from './helpers';

const PUBLIC_TABLES = ['seeker_profiles', 'seeker_experience', 'seeker_certifications', 'seeker_languages'] as const;

const readable = async (db: Db, table: string, seekerId: string) =>
  db.count(`select 1 from ${table} where ${table === 'seeker_profiles' || table === 'seeker_private' ? 'id' : 'seeker_id'} = $1`, [seekerId]);

async function applicantSetup(db: Db, status: 'submitted' | 'withdrawn' = 'submitted') {
  const employer = await createEmployer(db, 'Sunrise Care');
  const seeker = await createSeeker(db);
  await addSeekerDetails(db, seeker);
  const job = await createJob(db, employer, { status: 'published' });
  await createApplication(db, job, seeker, { status });
  return { employer, seeker, job };
}

describe('seeker_private (phone, zip, resume): the owner and employers with an application only', () => {
  it('the owner can read and update their own details', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await addSeekerDetails(db, seeker);
      await db.asUser(seeker);
      expect((await db.one('select phone, zip from seeker_private where id = $1', [seeker]))).toEqual({
        phone: '(512) 555-0100',
        zip: '78701',
      });
      await db.q(`update seeker_private set phone = '(512) 555-0199' where id = $1`, [seeker]);
      expect((await db.one('select phone from seeker_private where id = $1', [seeker])).phone).toBe('(512) 555-0199');
    }));

  it('another seeker, anon and unrelated employers see nothing', () =>
    tx(async (db) => {
      const { seeker } = await applicantSetup(db);
      const otherSeeker = await createSeeker(db);
      const stranger = await createEmployer(db, 'Other Care');
      for (const actor of [otherSeeker, stranger]) {
        await db.asUser(actor);
        expect(await readable(db, 'seeker_private', seeker)).toBe(0);
      }
      await db.asAnon();
      expect(await readable(db, 'seeker_private', seeker)).toBe(0);
    }));

  it('an employer who holds an application from the seeker can read the details', () =>
    tx(async (db) => {
      const { employer, seeker } = await applicantSetup(db);
      await db.asUser(employer);
      expect((await db.one('select phone, zip, resume_url from seeker_private where id = $1', [seeker]))).toEqual({
        phone: '(512) 555-0100',
        zip: '78701',
        resume_url: 'resumes/me.pdf',
      });
    }));

  it('an employer holding an application cannot change the details (no rows affected)', () =>
    tx(async (db) => {
      const { employer, seeker } = await applicantSetup(db);
      await db.asUser(employer);
      expect(await db.count(`update seeker_private set phone = '000' where id = $1`, [seeker])).toBe(0);
      await db.asSuperuser();
      expect((await db.one('select phone from seeker_private where id = $1', [seeker])).phone).toBe('(512) 555-0100');
    }));

  it('another employer (no application) sees nothing, even if they have jobs of their own', () =>
    tx(async (db) => {
      const { seeker } = await applicantSetup(db);
      const other = await createEmployer(db, 'Beta Care');
      await createJob(db, other, { status: 'published' });
      await db.asUser(other);
      expect(await readable(db, 'seeker_private', seeker)).toBe(0);
    }));

  it('after the seeker withdraws, the employer can no longer read the details', () =>
    tx(async (db) => {
      const { employer, seeker } = await applicantSetup(db, 'withdrawn');
      await db.asUser(employer);
      expect(await readable(db, 'seeker_private', seeker)).toBe(0);
    }));

  it('opting in to the directory never exposes the details, not even to an employer with Hiring Pro', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await addSeekerDetails(db, seeker);
      await optIn(db, seeker);
      const pro = await createEmployer(db, 'Pro Care');
      await grantPro(db, pro);
      await db.asUser(pro);
      expect(await readable(db, 'seeker_profiles', seeker)).toBe(1);
      expect(await readable(db, 'seeker_private', seeker)).toBe(0);
    }));

  it('not even an admin can read them through the database (admin access goes through the audited API)', () =>
    tx(async (db) => {
      const { seeker } = await applicantSetup(db);
      const admin = await createAdmin(db);
      await db.asUser(admin);
      expect(await readable(db, 'seeker_private', seeker)).toBe(0);
    }));

  it('nobody can create private rows or delete them: the row is made at signup', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      const other = await createSeeker(db);
      await db.asUser(seeker);
      await db.expectError('insert into seeker_private (id) values ($1)', [other], /permission denied/);
      await db.expectError('delete from seeker_private where id = $1', [seeker], /permission denied/);
    }));
});

describe('seeker profile and its experience, certifications and languages', () => {
  it('the owner reads and edits their own', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await addSeekerDetails(db, seeker);
      await db.asUser(seeker);
      for (const table of PUBLIC_TABLES) expect(await readable(db, table, seeker), table).toBe(1);
      await db.q(`update seeker_profiles set headline = 'Caring aide' where id = $1`, [seeker]);
      await db.q(`update seeker_experience set title = 'Senior PCA' where seeker_id = $1`, [seeker]);
    }));

  it('other seekers and anon cannot read them', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await addSeekerDetails(db, seeker);
      const other = await createSeeker(db);
      for (const actor of [other, null]) {
        if (actor) await db.asUser(actor);
        else await db.asAnon();
        for (const table of PUBLIC_TABLES) expect(await readable(db, table, seeker), table).toBe(0);
      }
    }));

  it('a seeker cannot add rows to, edit, or delete from, another seeker', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await addSeekerDetails(db, seeker);
      const other = await createSeeker(db);
      await db.asUser(other);
      await db.expectError(
        `insert into seeker_certifications (seeker_id, name) values ($1, 'Fake cert')`,
        [seeker],
        /row-level security/,
      );
      expect(await db.count(`update seeker_experience set title = 'Hacked' where seeker_id = $1`, [seeker])).toBe(0);
      expect(await db.count('delete from seeker_languages where seeker_id = $1', [seeker])).toBe(0);
    }));

  it('a seeker profile cannot be created or deleted directly', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await db.asUser(seeker);
      await db.expectError(`insert into seeker_profiles (id, display_name) values (gen_random_uuid(), 'x')`, [], /permission denied/);
      await db.expectError('delete from seeker_profiles where id = $1', [seeker], /permission denied/);
    }));

  it('an employer holding an application can read the profile and its children', () =>
    tx(async (db) => {
      const { employer, seeker } = await applicantSetup(db);
      await db.asUser(employer);
      for (const table of PUBLIC_TABLES) expect(await readable(db, table, seeker), table).toBe(1);
    }));

  it('an employer holding an application cannot edit any of it (no rows affected)', () =>
    tx(async (db) => {
      const { employer, seeker } = await applicantSetup(db);
      await db.asUser(employer);
      expect(await db.count(`update seeker_profiles set headline = 'x' where id = $1`, [seeker])).toBe(0);
      expect(await db.count(`update seeker_experience set title = 'x' where seeker_id = $1`, [seeker])).toBe(0);
      expect(await db.count(`update seeker_certifications set name = 'x' where seeker_id = $1`, [seeker])).toBe(0);
      expect(await db.count('delete from seeker_languages where seeker_id = $1', [seeker])).toBe(0);
      await db.asSuperuser();
      expect((await db.one('select headline from seeker_profiles where id = $1', [seeker])).headline).toBeNull();
    }));

  it('after withdrawal the employer loses the profile and its children', () =>
    tx(async (db) => {
      const { employer, seeker } = await applicantSetup(db, 'withdrawn');
      await db.asUser(employer);
      for (const table of PUBLIC_TABLES) expect(await readable(db, table, seeker), table).toBe(0);
    }));

  it('a stranger employer sees none of it', () =>
    tx(async (db) => {
      const { seeker } = await applicantSetup(db);
      const stranger = await createEmployer(db, 'Other Care');
      await db.asUser(stranger);
      for (const table of PUBLIC_TABLES) expect(await readable(db, table, seeker), table).toBe(0);
    }));
});

describe('directory visibility: opt-in AND an active Hiring Pro subscription', () => {
  async function optedInSeeker(db: Db) {
    const seeker = await createSeeker(db);
    await addSeekerDetails(db, seeker);
    await optIn(db, seeker);
    return seeker;
  }

  it('an opted-in seeker is invisible to employers without Hiring Pro', () =>
    tx(async (db) => {
      const seeker = await optedInSeeker(db);
      const employer = await createEmployer(db, 'Sunrise Care');
      await db.asUser(employer);
      for (const table of PUBLIC_TABLES) expect(await readable(db, table, seeker), table).toBe(0);
    }));

  it('an employer with an active Hiring Pro subscription sees the opted-in seeker and their profile data', () =>
    tx(async (db) => {
      const seeker = await optedInSeeker(db);
      const employer = await createEmployer(db, 'Sunrise Care');
      await grantPro(db, employer);
      await db.asUser(employer);
      for (const table of PUBLIC_TABLES) expect(await readable(db, table, seeker), table).toBe(1);
    }));

  it('a seeker who has not opted in stays invisible, even to Hiring Pro', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await addSeekerDetails(db, seeker);
      const employer = await createEmployer(db, 'Sunrise Care');
      await grantPro(db, employer);
      await db.asUser(employer);
      for (const table of PUBLIC_TABLES) expect(await readable(db, table, seeker), table).toBe(0);
    }));

  it('turning the switch off hides the seeker again', () =>
    tx(async (db) => {
      const seeker = await optedInSeeker(db);
      const employer = await createEmployer(db, 'Sunrise Care');
      await grantPro(db, employer);
      await db.asUser(seeker);
      await db.q('update seeker_profiles set is_visible = false where id = $1', [seeker]);
      await db.asUser(employer);
      expect(await readable(db, 'seeker_profiles', seeker)).toBe(0);
    }));

  it('an expired, past-due, cancelled, incomplete or other-plan subscription does not count', () =>
    tx(async (db) => {
      const seeker = await optedInSeeker(db);
      const cases = [
        { status: 'active', periodDays: -1 },
        { status: 'past_due', periodDays: 30 },
        { status: 'canceled', periodDays: 30 },
        { status: 'incomplete', periodDays: 30 },
        { status: 'active', periodDays: 30, plan: 'something_else' },
      ] as const;
      for (const [index, subscription] of cases.entries()) {
        const employer = await createEmployer(db, `Case ${index} Care`);
        await grantPro(db, employer, subscription);
        await db.asUser(employer);
        expect(await readable(db, 'seeker_profiles', seeker), JSON.stringify(subscription)).toBe(0);
      }
    }));

  it("one employer's subscription does not help another employer", () =>
    tx(async (db) => {
      const seeker = await optedInSeeker(db);
      const pro = await createEmployer(db, 'Pro Care');
      const free = await createEmployer(db, 'Free Care');
      await grantPro(db, pro);
      await db.asUser(free);
      expect(await readable(db, 'seeker_profiles', seeker)).toBe(0);
    }));

  it('other seekers and anon never see opted-in seekers', () =>
    tx(async (db) => {
      const seeker = await optedInSeeker(db);
      const other = await createSeeker(db);
      await db.asUser(other);
      expect(await readable(db, 'seeker_profiles', seeker)).toBe(0);
      await db.asAnon();
      expect(await readable(db, 'seeker_profiles', seeker)).toBe(0);
    }));
});

describe('visibility switch', () => {
  it('is off by default and records when it was turned on and off', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await db.asUser(seeker);
      expect((await db.one('select is_visible, visibility_opted_in_at from seeker_profiles where id = $1', [seeker]))).toEqual({
        is_visible: false,
        visibility_opted_in_at: null,
      });
      await db.q('update seeker_profiles set is_visible = true where id = $1', [seeker]);
      const on = await db.one('select is_visible, visibility_opted_in_at from seeker_profiles where id = $1', [seeker]);
      expect(on.is_visible).toBe(true);
      expect(on.visibility_opted_in_at).toBeInstanceOf(Date);

      await db.q(`update seeker_profiles set headline = 'Hello' where id = $1`, [seeker]);
      expect((await db.one('select visibility_opted_in_at from seeker_profiles where id = $1', [seeker])).visibility_opted_in_at).toEqual(
        on.visibility_opted_in_at,
      );

      await db.q('update seeker_profiles set is_visible = false where id = $1', [seeker]);
      expect((await db.one('select visibility_opted_in_at from seeker_profiles where id = $1', [seeker])).visibility_opted_in_at).toBeNull();
    }));

  it('a client cannot write the consent timestamp themselves', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await db.asUser(seeker);
      await db.expectError(
        'update seeker_profiles set visibility_opted_in_at = now() where id = $1',
        [seeker],
        /permission denied/,
      );
    }));
});
