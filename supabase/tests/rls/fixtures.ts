// Test data builders. They act as superuser or service_role, so a test must switch to the actor
// it wants to test (db.asUser, db.asAnon...) after calling them.
import { randomUUID } from 'node:crypto';
import type { Db, Row } from './helpers';

export const LONG_DESCRIPTION =
  'Support clients with daily living activities in their homes across the county, including meals and mobility.';

type Role = 'seeker' | 'employer' | 'admin';

/** Creates an auth user. The signup trigger creates the profile rows, as in production. */
export async function createUser(db: Db, role: Role = 'seeker', meta: Record<string, unknown> = {}): Promise<string> {
  await db.asSuperuser();
  const id = randomUUID();
  const metadata = {
    full_name: `Test ${id.slice(0, 6)}`,
    ...(role === 'employer' ? { role: 'employer' } : {}),
    ...meta,
  };
  await db.q('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
    id,
    `${id}@example.test`,
    JSON.stringify(metadata),
  ]);
  if (role === 'admin') await db.q("update profiles set role = 'admin' where id = $1", [id]);
  return id;
}

export async function setCompanyName(db: Db, employerId: string, name: string): Promise<void> {
  await db.asService();
  await db.q('update employer_profiles set company_name = $2 where id = $1', [employerId, name]);
}

/** An employer. With a name, the company is renamed from the default, so its page is listed. */
export async function createEmployer(db: Db, name?: string): Promise<string> {
  const id = await createUser(db, 'employer');
  if (name) await setCompanyName(db, id, name);
  return id;
}

export async function createSeeker(db: Db): Promise<string> {
  return createUser(db, 'seeker');
}

export async function createAdmin(db: Db): Promise<string> {
  return createUser(db, 'admin');
}

export interface JobOptions {
  title?: string;
  description?: string;
  status?: 'draft' | 'pending_payment' | 'published' | 'expired' | 'closed';
  /** Days from now until expires_at (negative = in the past). Default 30 for published and closed. */
  expiresInDays?: number;
  city?: string;
}

export async function createJob(db: Db, employerId: string, o: JobOptions = {}): Promise<string> {
  await db.asService();
  const status = o.status ?? 'draft';
  const hasDates = status === 'published' || status === 'closed' || status === 'expired';
  const days = o.expiresInDays ?? 30;
  const row = await db.one(
    `insert into jobs (employer_id, title, description, care_role, employment_type, city, state, status,
                       published_at, expires_at)
     values ($1, $2, $3, 'hha', 'part_time', $4, 'TX', $5,
             case when $6 then now() - interval '1 day' end,
             case when $6 then now() + make_interval(days => $7) end)
     returning id`,
    [employerId, o.title ?? 'Home health aide', o.description ?? LONG_DESCRIPTION, o.city ?? 'Austin', status, hasDates, days],
  );
  return row.id as string;
}

export interface PaymentOptions {
  status?: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'needs_review' | 'refunded';
  consumed?: boolean;
}

export async function createPayment(db: Db, employerId: string, jobId: string, o: PaymentOptions = {}): Promise<string> {
  await db.asService();
  const row = await db.one(
    `insert into payments (employer_id, job_id, amount_cents, status, consumed_at)
     values ($1, $2, 250, $3, case when $4 then now() end) returning id`,
    [employerId, jobId, o.status ?? 'succeeded', o.consumed ?? false],
  );
  return row.id as string;
}

export interface ApplicationOptions {
  status?: 'submitted' | 'viewed' | 'shortlisted' | 'interview' | 'hired' | 'rejected' | 'withdrawn';
  coverNote?: string | null;
  resumeUrl?: string | null;
}

export async function createApplication(db: Db, jobId: string, seekerId: string, o: ApplicationOptions = {}): Promise<string> {
  await db.asService();
  const withdrawn = o.status === 'withdrawn';
  const row = await db.one(
    `insert into applications (job_id, seeker_id, status, cover_note, resume_url)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      jobId,
      seekerId,
      o.status ?? 'submitted',
      withdrawn ? null : (o.coverNote === undefined ? 'Hello, I would like to apply.' : o.coverNote),
      withdrawn ? null : (o.resumeUrl === undefined ? 'resumes/example.pdf' : o.resumeUrl),
    ],
  );
  return row.id as string;
}

export interface ProOptions {
  status?: 'incomplete' | 'active' | 'past_due' | 'canceled';
  /** Days from now until the current period ends (negative = already ended). */
  periodDays?: number;
  plan?: string;
}

export async function grantPro(db: Db, employerId: string, o: ProOptions = {}): Promise<void> {
  await db.asService();
  await db.q(
    `insert into subscriptions (employer_id, plan, status, current_period_end)
     values ($1, $2, $3, now() + make_interval(days => $4))`,
    [employerId, o.plan ?? 'hiring_pro', o.status ?? 'active', o.periodDays ?? 30],
  );
}

/** A seeker opts in to the directory, as the seeker would. */
export async function optIn(db: Db, seekerId: string): Promise<void> {
  await db.asUser(seekerId);
  await db.q('update seeker_profiles set is_visible = true where id = $1', [seekerId]);
}

export async function addSeekerDetails(db: Db, seekerId: string): Promise<void> {
  await db.asUser(seekerId);
  await db.q(`update seeker_private set phone = '(512) 555-0100', zip = '78701', resume_url = 'resumes/me.pdf' where id = $1`, [seekerId]);
  await db.q(`insert into seeker_experience (seeker_id, title, employer, start_date) values ($1, 'PCA', 'Acme Care', '2022-01-01')`, [seekerId]);
  await db.q(`insert into seeker_certifications (seeker_id, name) values ($1, 'CNA')`, [seekerId]);
  await db.q(`insert into seeker_languages (seeker_id, language) values ($1, 'Spanish')`, [seekerId]);
}

export const ids = (rows: Row[], key = 'id'): unknown[] => rows.map((row) => row[key]);
