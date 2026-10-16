// If the database ever refuses a company value despite the shared schema's checks (its CHECK
// constraints are the backstop), the person gets a friendly 400, never the database's words or a 500.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { expectNoLeak, makeApp, v1 } from './helpers/harness';

describe('a database refusal on the company profile', () => {
  it('is a friendly 400 that names no constraint, table or column', async () => {
    const t = await makeApp({
      db: { companyError: { message: 'new row for relation "employer_profiles" violates check constraint "employer_profiles_website_ok"', code: '23514' } },
    });
    const { authorization } = await t.login('employer');
    const res = await request(t.app).put(v1('/employer/company')).set('Authorization', authorization).send({ companyName: 'Sunrise' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'validation_error', message: 'One of the values is not allowed.' });
    expectNoLeak(res.body, ['employer_profiles', 'website_ok', 'check constraint']);
  });

  it('any other database error is still a generic 500', async () => {
    const t = await makeApp({ db: { companyError: { message: 'permission denied for table employer_profiles', code: '42501' } } });
    const { authorization } = await t.login('employer');
    const res = await request(t.app).put(v1('/employer/company')).set('Authorization', authorization).send({ companyName: 'Sunrise' });
    expect(res.status).toBe(500);
    expectNoLeak(res.body, ['employer_profiles']);
  });
});
