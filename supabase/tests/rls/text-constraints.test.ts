// Migration 0002: CHECK constraints on every user-editable text column, tested at the database.
//
// Each case writes as the signed-in person, the way a direct Data API call would, and expects the
// database to refuse it with a check violation (SQLSTATE 23514). A matching real-HTTP version, with
// real tokens, is in apps/api/tests/integration/data-api-constraints.test.ts.
import { describe, expect, it } from 'vitest';
import { createEmployer, createJob, createSeeker, createUser } from './fixtures';
import { tx, type Db } from './helpers';

const x = (n: number) => 'x'.repeat(n);
const CHECK_VIOLATION = '23514';

/** Addresses the database must refuse, and why. */
const BAD_URLS: Array<[string, string]> = [
  ['a javascript: address', 'javascript:alert(1)'],
  ['a mixed-case javascript: address', 'JaVaScRiPt:alert(1)'],
  ['a data: address', 'data:text/html,<script>alert(1)</script>'],
  ['a vbscript: address', 'vbscript:msgbox(1)'],
  ['an ftp address', 'ftp://example.org/file'],
  ['a protocol-relative address', '//example.org'],
  ['no scheme', 'example.org'],
  ['no host', 'https://'],
  ['a host that starts with a space', 'https:// example.org'],
  ['a space inside', 'https://example.org/a b'],
  ['a leading space', ' https://example.org'],
  ['a new line at the end', 'https://example.org\n'],
  ['a control character', 'https://example.org/\u0001'],
  ['more than 2048 characters', `https://example.org/${x(2040)}`],
];

const GOOD_URLS = ['https://example.org', 'http://example.org/a?b=1#c', 'HTTPS://EXAMPLE.ORG/PATH', 'https://sub.example.org:8443/x', `https://example.org/${x(2000)}`];

/** Control characters that no single-line field may contain. */
const CONTROL = ['\u0001', '\u0007', '\u001b', '\u007f', 'a\nb', 'a\tb', 'a\rb'];
/** Control characters that multi-line text may not contain (new lines and tabs are fine there). */
const CONTROL_MULTILINE = ['\u0001', '\u0007', '\u000b', '\u000c', '\u001b', '\u007f'];

async function refused(db: Db, sql: string, params: unknown[], constraint: string) {
  const result = await db.expectError(sql, params, new RegExp(`violates check constraint "${constraint}"`));
  expect(result.code).toBe(CHECK_VIOLATION);
}

describe('employer_profiles: every writable text column', () => {
  const update = (column: string) => `update employer_profiles set ${column} = $2 where id = $1`;

  it.each([
    ['company_name', 121, 'employer_profiles_company_name_ok'],
    ['description', 5001, 'employer_profiles_description_ok'],
    ['industry', 101, 'employer_profiles_industry_ok'],
    ['city', 101, 'employer_profiles_city_ok'],
    ['state', 51, 'employer_profiles_state_ok'],
  ])('%s over its limit (%d characters) is refused', (column, length, constraint) =>
    tx(async (db) => {
      const id = await createEmployer(db);
      await db.asUser(id);
      await refused(db, update(column as string), [id, x(length as number)], constraint as string);
    }));

  it.each([
    ['company_name', 120],
    ['description', 5000],
    ['industry', 100],
    ['city', 100],
    ['state', 50],
  ])('%s at exactly its limit (%d) is accepted', (column, length) =>
    tx(async (db) => {
      const id = await createEmployer(db);
      await db.asUser(id);
      expect(await db.count(update(column as string), [id, x(length as number)])).toBe(1);
    }));

  it.each([
    ['company_name', 'employer_profiles_company_name_ok'],
    ['industry', 'employer_profiles_industry_ok'],
    ['city', 'employer_profiles_city_ok'],
    ['state', 'employer_profiles_state_ok'],
  ])('%s refuses control characters and line breaks', (column, constraint) =>
    tx(async (db) => {
      const id = await createEmployer(db);
      await db.asUser(id);
      for (const bad of CONTROL) await refused(db, update(column as string), [id, `ok${bad}ok`], constraint as string);
    }));

  it('description refuses control characters but allows new lines and tabs', () =>
    tx(async (db) => {
      const id = await createEmployer(db);
      await db.asUser(id);
      for (const bad of CONTROL_MULTILINE) await refused(db, update('description'), [id, `ok${bad}ok`], 'employer_profiles_description_ok');
      expect(await db.count(update('description'), [id, 'Line one\nLine two\r\n\tIndented'])).toBe(1);
    }));

  it.each(['website', 'logo_url'])('%s refuses every dangerous or malformed address', (column) =>
    tx(async (db) => {
      const id = await createEmployer(db);
      await db.asUser(id);
      for (const [, bad] of BAD_URLS) await refused(db, update(column), [id, bad], `employer_profiles_${column}_ok`);
    }));

  it.each(['website', 'logo_url'])('%s accepts real http and https addresses, and null', (column) =>
    tx(async (db) => {
      const id = await createEmployer(db);
      await db.asUser(id);
      for (const good of GOOD_URLS) expect(await db.count(update(column), [id, good]), good).toBe(1);
      expect(await db.count(update(column), [id, null])).toBe(1);
    }));

  it('company_size accepts only the listed sizes', () =>
    tx(async (db) => {
      const id = await createEmployer(db);
      await db.asUser(id);
      for (const size of ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']) {
        expect(await db.count(update('company_size'), [id, size]), size).toBe(1);
      }
      for (const bad of ['12', 'small', '1-5', '10000', '', ' 1-10', '1-10 people']) {
        await refused(db, update('company_size'), [id, bad], 'employer_profiles_company_size_ok');
      }
    }));

  it('the service role is held to the same rules (a check constraint applies to everyone)', () =>
    tx(async (db) => {
      const id = await createEmployer(db);
      await db.asService();
      await refused(db, update('website'), [id, 'javascript:alert(1)'], 'employer_profiles_website_ok');
      await refused(db, update('description'), [id, x(5001)], 'employer_profiles_description_ok');
    }));
});

describe('profiles.full_name', () => {
  it('is limited to 100 characters, one line', () =>
    tx(async (db) => {
      const id = await createSeeker(db);
      await db.asUser(id);
      const update = 'update profiles set full_name = $2 where id = $1';
      await refused(db, update, [id, x(101)], 'profiles_full_name_ok');
      await refused(db, update, [id, 'a\nb'], 'profiles_full_name_ok');
      expect(await db.count(update, [id, x(100)])).toBe(1);
    }));
});

describe('seeker_profiles: every writable text column', () => {
  const update = (column: string) => `update seeker_profiles set ${column} = $2 where id = $1`;

  it.each([
    ['display_name', 101, 'seeker_profiles_display_name_ok'],
    ['headline', 151, 'seeker_profiles_headline_ok'],
    ['summary', 3001, 'seeker_profiles_summary_ok'],
    ['city', 101, 'seeker_profiles_city_ok'],
    ['state', 51, 'seeker_profiles_state_ok'],
  ])('%s over its limit is refused, and exactly at the limit is accepted', (column, over, constraint) =>
    tx(async (db) => {
      const id = await createSeeker(db);
      await db.asUser(id);
      await refused(db, update(column as string), [id, x(over as number)], constraint as string);
      expect(await db.count(update(column as string), [id, x((over as number) - 1)])).toBe(1);
    }));

  it.each([
    ['display_name', 'seeker_profiles_display_name_ok'],
    ['headline', 'seeker_profiles_headline_ok'],
    ['city', 'seeker_profiles_city_ok'],
    ['state', 'seeker_profiles_state_ok'],
  ])('%s refuses control characters', (column, constraint) =>
    tx(async (db) => {
      const id = await createSeeker(db);
      await db.asUser(id);
      for (const bad of CONTROL) await refused(db, update(column as string), [id, `ok${bad}ok`], constraint as string);
    }));

  it('summary refuses control characters but allows line breaks', () =>
    tx(async (db) => {
      const id = await createSeeker(db);
      await db.asUser(id);
      for (const bad of CONTROL_MULTILINE) await refused(db, update('summary'), [id, `ok${bad}ok`], 'seeker_profiles_summary_ok');
      expect(await db.count(update('summary'), [id, 'One.\nTwo.'])).toBe(1);
    }));

  it('avatar_url refuses every dangerous or malformed address, and accepts real ones', () =>
    tx(async (db) => {
      const id = await createSeeker(db);
      await db.asUser(id);
      for (const [, bad] of BAD_URLS) await refused(db, update('avatar_url'), [id, bad], 'seeker_profiles_avatar_url_ok');
      for (const good of GOOD_URLS) expect(await db.count(update('avatar_url'), [id, good]), good).toBe(1);
    }));
});

describe('seeker_private: phone, ZIP and the resume path', () => {
  const update = (column: string) => `update seeker_private set ${column} = $2 where id = $1`;

  it('phone accepts phone-number shapes only', () =>
    tx(async (db) => {
      const id = await createSeeker(db);
      await db.asUser(id);
      for (const good of ['555-123-4567', '(555) 123-4567', '+1 555 123 4567', '555.123.4567']) {
        expect(await db.count(update('phone'), [id, good]), good).toBe(1);
      }
      for (const bad of ['123', 'call me', '555-123-4567; drop table', x(21), '555\n123 4567', '<script>1</script>', '555-123-4567x']) {
        await refused(db, update('phone'), [id, bad], 'seeker_private_phone_ok');
      }
    }));

  it('zip accepts 12345 and 12345-6789 only', () =>
    tx(async (db) => {
      const id = await createSeeker(db);
      await db.asUser(id);
      for (const good of ['12345', '12345-6789']) expect(await db.count(update('zip'), [id, good]), good).toBe(1);
      for (const bad of ['1234', '123456', 'ABCDE', '12345-67', '12345 6789', '12345\n', '<b>1</b>']) {
        await refused(db, update('zip'), [id, bad], 'seeker_private_zip_ok');
      }
    }));

  it('resume_url is a storage path, never an address or a script', () =>
    tx(async (db) => {
      const id = await createSeeker(db);
      await db.asUser(id);
      for (const good of ['resumes/abc/def.pdf', `${id}/resume.docx`, x(512)]) {
        expect(await db.count(update('resume_url'), [id, good]), good.slice(0, 30)).toBe(1);
      }
      for (const bad of ['javascript:alert(1)', 'https://evil.example/x.pdf', 'http://x', 'data:text/html,x', 'file:///etc/passwd', x(513), 'a\u0001b', 'C:\\x']) {
        await refused(db, update('resume_url'), [id, bad], 'seeker_private_resume_url_ok');
      }
    }));
});

describe('seeker_experience, seeker_certifications and seeker_languages: every text column', () => {
  it.each([
    ['title', 121, 'seeker_experience_title_ok'],
    ['employer', 121, 'seeker_experience_employer_ok'],
    ['city', 101, 'seeker_experience_city_ok'],
    ['state', 51, 'seeker_experience_state_ok'],
    ['description', 2001, 'seeker_experience_description_ok'],
  ])('experience %s over its limit is refused on insert and on update', (column, over, constraint) =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await db.asUser(seeker);
      const insert = (values: Record<string, string>) =>
        db.attempt(
          `insert into seeker_experience (seeker_id, title, employer, city, state, description, start_date)
           values ($1, $2, $3, $4, $5, $6, '2020-01-01')`,
          [seeker, values.title, values.employer, values.city, values.state, values.description],
        );
      const ok = { title: 'Aide', employer: 'Sunrise', city: 'Fresno', state: 'CA', description: 'Did things.' };

      const bad = await insert({ ...ok, [column as string]: x(over as number) });
      expect(bad.ok).toBe(false);
      expect(!bad.ok && bad.code).toBe(CHECK_VIOLATION);
      expect(!bad.ok && bad.error).toContain(constraint as string);

      const good = await insert({ ...ok, [column as string]: x((over as number) - 1) });
      expect(good.ok).toBe(true);
      await refused(db, `update seeker_experience set ${column} = $2 where seeker_id = $1`, [seeker, x(over as number)], constraint as string);
    }));

  it('experience refuses control characters (and allows line breaks only in the description)', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await db.asUser(seeker);
      await db.q(`insert into seeker_experience (seeker_id, title, employer, start_date) values ($1, 'Aide', 'Sunrise', '2020-01-01')`, [seeker]);
      await refused(db, 'update seeker_experience set title = $2 where seeker_id = $1', [seeker, 'a\u0001b'], 'seeker_experience_title_ok');
      await refused(db, 'update seeker_experience set employer = $2 where seeker_id = $1', [seeker, 'a\nb'], 'seeker_experience_employer_ok');
      await refused(db, 'update seeker_experience set description = $2 where seeker_id = $1', [seeker, 'a\u0007b'], 'seeker_experience_description_ok');
      expect(await db.count('update seeker_experience set description = $2 where seeker_id = $1', [seeker, 'Line one\nLine two'])).toBe(1);
    }));

  it('certifications: name and issuer are limited to 120 characters, one line', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await db.asUser(seeker);
      const insert = 'insert into seeker_certifications (seeker_id, name, issuer) values ($1, $2, $3)';
      await refused(db, insert, [seeker, x(121), 'Red Cross'], 'seeker_certifications_name_ok');
      await refused(db, insert, [seeker, 'CPR', x(121)], 'seeker_certifications_issuer_ok');
      await refused(db, insert, [seeker, 'CPR\nTwo', 'Red Cross'], 'seeker_certifications_name_ok');
      expect(await db.count(insert, [seeker, x(120), x(120)])).toBe(1);
    }));

  it('languages: the language is limited to 60 characters, one line', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await db.asUser(seeker);
      const insert = 'insert into seeker_languages (seeker_id, language) values ($1, $2)';
      await refused(db, insert, [seeker, x(61)], 'seeker_languages_language_ok');
      await refused(db, insert, [seeker, 'Span\u0001ish'], 'seeker_languages_language_ok');
      expect(await db.count(insert, [seeker, x(60)])).toBe(1);
    }));
});

describe('jobs: every text column an employer can write', () => {
  const draft = (db: Db, employer: string, overrides: Record<string, unknown> = {}) => {
    const v = { title: 'Home health aide', description: 'x', city: 'Austin', state: 'TX', zip: null, pay_min: null, pay_max: null, ...overrides };
    return db.attempt(
      `insert into jobs (employer_id, title, description, care_role, employment_type, city, state, zip, pay_min, pay_max, pay_period)
       values ($1, $2, $3, 'hha', 'part_time', $4, $5, $6, $7, $8, 'hour')`,
      [employer, v.title, v.description, v.city, v.state, v.zip, v.pay_min, v.pay_max],
    );
  };

  it.each([
    ['title', 121, 'jobs_title_ok'],
    ['description', 10001, 'jobs_description_ok'],
    ['city', 101, 'jobs_city_ok'],
    ['state', 51, 'jobs_state_ok'],
  ])('%s over its limit is refused when creating and when editing, and the limit itself is accepted', (column, over, constraint) =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      await db.asUser(employer);
      const bad = await draft(db, employer, { [column as string]: x(over as number) });
      expect(bad.ok).toBe(false);
      expect(!bad.ok && bad.error).toContain(constraint as string);
      expect((await draft(db, employer, { [column as string]: x((over as number) - 1) })).ok).toBe(true);

      await db.asService();
      const job = await createJob(db, employer);
      await db.asUser(employer);
      await refused(db, `update jobs set ${column} = $2 where id = $1`, [job, x(over as number)], constraint as string);
    }));

  it('single-line job fields refuse control characters; the description allows line breaks', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      const job = await createJob(db, employer);
      await db.asUser(employer);
      await refused(db, 'update jobs set title = $2 where id = $1', [job, 'a\u0001b'], 'jobs_title_ok');
      await refused(db, 'update jobs set title = $2 where id = $1', [job, 'a\nb'], 'jobs_title_ok');
      await refused(db, 'update jobs set city = $2 where id = $1', [job, 'Au\u0007stin'], 'jobs_city_ok');
      await refused(db, 'update jobs set description = $2 where id = $1', [job, 'a\u001bb'], 'jobs_description_ok');
      expect(await db.count('update jobs set description = $2 where id = $1', [job, 'Duties:\n- one\n- two'])).toBe(1);
    }));

  it('zip is a ZIP code or null', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      const job = await createJob(db, employer);
      await db.asUser(employer);
      for (const good of ['78701', '78701-1234', null]) expect(await db.count('update jobs set zip = $2 where id = $1', [job, good])).toBe(1);
      for (const bad of ['787', 'ABCDE', '78701 1234', '<script>']) await refused(db, 'update jobs set zip = $2 where id = $1', [job, bad], 'jobs_zip_ok');
    }));

  it('pay cannot be negative', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      const job = await createJob(db, employer);
      await db.asUser(employer);
      await refused(db, 'update jobs set pay_min = -1 where id = $1', [job], 'jobs_pay_ok');
      await refused(db, 'update jobs set pay_max = -0.01 where id = $1', [job], 'jobs_pay_ok');
      expect(await db.count('update jobs set pay_min = 0, pay_max = 25.5, pay_period = $2 where id = $1', [job, 'hour'])).toBe(1);
    }));
});

describe('messages.body', () => {
  it('refuses control characters, and still enforces its length limit', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const seeker = await createSeeker(db);
      await db.asService();
      const jobId = await createJob(db, employer, { status: 'published' });
      await db.q(`insert into applications (job_id, seeker_id) values ($1, $2)`, [jobId, seeker]);
      await db.asUser(seeker);
      const send = 'insert into messages (sender_id, recipient_id, body) values ($1, $2, $3)';
      await refused(db, send, [seeker, employer, 'hi\u0001there'], 'messages_body_ok');
      const long = await db.attempt(send, [seeker, employer, x(4001)]);
      expect(long.ok).toBe(false);
      expect(await db.count(send, [seeker, employer, 'Hello,\nI would like to apply.\tThanks'])).toBe(1);
    }));
});

describe('signup keeps working with any name a client sends', () => {
  it('a very long, odd or empty name is cut, cleaned or defaulted instead of failing signup', () =>
    tx(async (db) => {
      const long = await createUser(db, 'seeker', { full_name: x(500) });
      const odd = await createUser(db, 'seeker', { full_name: '  Sam\u0001 \nRivera  ' });
      const empty = await createUser(db, 'seeker', { full_name: '   ' });
      const employer = await createUser(db, 'employer', { full_name: x(500) });
      await db.asSuperuser();
      expect((await db.one('select full_name, length(full_name) n from profiles where id = $1', [long])).n).toBe(100);
      expect((await db.one('select display_name from seeker_profiles where id = $1', [long])).display_name).toHaveLength(100);
      expect((await db.one('select full_name from profiles where id = $1', [odd])).full_name).toBe('Sam Rivera');
      expect((await db.one('select display_name from seeker_profiles where id = $1', [empty])).display_name).toBe('New seeker');
      expect((await db.one('select full_name from profiles where id = $1', [empty])).full_name).toBeNull();
      expect((await db.one('select full_name, length(full_name) n from profiles where id = $1', [employer])).n).toBe(100);
    }));

  it('still never creates an admin from client input', () =>
    tx(async (db) => {
      const id = await createUser(db, 'seeker', { role: 'admin' });
      await db.asSuperuser();
      expect((await db.one('select role from profiles where id = $1', [id])).role).toBe('seeker');
    }));
});

describe('the helper functions behind the constraints are not callable through the API', () => {
  it('they live in the private schema, which the Data API does not expose', () =>
    tx(async (db) => {
      await db.asSuperuser();
      const rows = await db.rows(
        `select n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where p.proname in ('clean_text','clean_line','http_url','us_zip','phone','storage_path')`,
      );
      expect(rows.length).toBe(6);
      expect(rows.every((row) => row.nspname === 'private')).toBe(true);
    }));
});
