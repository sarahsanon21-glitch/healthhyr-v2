import { describe, expect, it } from 'vitest';
import { createAdmin, createEmployer, createSeeker, setCompanyName } from './fixtures';
import { tx } from './helpers';

describe('employer page is public only after the company is renamed', () => {
  it('a default-named employer is not visible to anon or other users', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      const seeker = await createSeeker(db);
      await db.asAnon();
      expect(await db.count('select 1 from employer_profiles where id = $1', [employer])).toBe(0);
      await db.asUser(seeker);
      expect(await db.count('select 1 from employer_profiles where id = $1', [employer])).toBe(0);
    }));

  it('the owner and an admin can still see it', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      const admin = await createAdmin(db);
      await db.asUser(employer);
      expect(await db.count('select 1 from employer_profiles where id = $1', [employer])).toBe(1);
      await db.asUser(admin);
      expect(await db.count('select 1 from employer_profiles where id = $1', [employer])).toBe(1);
    }));

  it('renaming makes it public and creates a slug', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      await db.asUser(employer);
      await db.q(`update employer_profiles set company_name = 'Sunrise Home Care' where id = $1`, [employer]);
      await db.asAnon();
      const row = await db.one('select company_name, is_listed, slug from employer_profiles where id = $1', [employer]);
      expect(row.is_listed).toBe(true);
      expect(row.slug).toMatch(/^sunrise-home-care-[0-9a-f]{6}$/);
    }));

  it('the slug stays the same when the company is renamed again', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Home Care');
      await db.asAnon();
      const before = (await db.one('select slug from employer_profiles where id = $1', [employer])).slug;
      await db.asUser(employer);
      await db.q(`update employer_profiles set company_name = 'Sunrise Care Group' where id = $1`, [employer]);
      const after = (await db.one('select slug from employer_profiles where id = $1', [employer])).slug;
      expect(after).toBe(before);
    }));

  it('changing the name back to the default (or blank) hides the page again', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Home Care');
      await db.asUser(employer);
      await db.q(`update employer_profiles set company_name = 'My company' where id = $1`, [employer]);
      await db.asAnon();
      expect(await db.count('select 1 from employer_profiles where id = $1', [employer])).toBe(0);

      await db.asUser(employer);
      await db.q(`update employer_profiles set company_name = 'Back Again' where id = $1`, [employer]);
      await db.q(`update employer_profiles set company_name = '   ' where id = $1`, [employer]);
      await db.asAnon();
      expect(await db.count('select 1 from employer_profiles where id = $1', [employer])).toBe(0);
    }));

  it('an employer cannot set is_listed or the slug themselves', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      await db.asUser(employer);
      await db.expectError('update employer_profiles set is_listed = true where id = $1', [employer], /permission denied/);
      await db.expectError(`update employer_profiles set slug = 'my-own-slug' where id = $1`, [employer], /permission denied/);
    }));

  it('an employer cannot edit another employer', () =>
    tx(async (db) => {
      const a = await createEmployer(db, 'Alpha Care');
      const b = await createEmployer(db, 'Beta Care');
      await db.asUser(a);
      expect(await db.count(`update employer_profiles set description = 'Hacked' where id = $1`, [b])).toBe(0);
    }));

  it('a seeker cannot edit any employer, and no one can insert or delete employer rows', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Alpha Care');
      const seeker = await createSeeker(db);
      await db.asUser(seeker);
      expect(await db.count(`update employer_profiles set description = 'Hacked' where id = $1`, [employer])).toBe(0);
      await db.asUser(employer);
      await db.expectError('delete from employer_profiles where id = $1', [employer], /permission denied/);
      await db.expectError(
        `insert into employer_profiles (id, company_name) values (gen_random_uuid(), 'Fake')`,
        [],
        /permission denied/,
      );
    }));

  it('setCompanyName fixture goes through the same listing trigger', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      await setCompanyName(db, employer, 'Fixture Care');
      await db.asAnon();
      expect(await db.count('select 1 from employer_profiles where id = $1', [employer])).toBe(1);
    }));
});
