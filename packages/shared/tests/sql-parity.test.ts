// Keeps TypeScript enums and constants in sync with the SQL schema.
// Reads supabase/migrations/0001_schema.sql once it exists; until then, the SQL block in docs/PLAN.md.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTACT_LIMITS, DEFAULT_COMPANY_NAME, JOB_LIMITS, MESSAGE_LIMITS, PAY_PER_POST } from '../src/constants';
import * as enums from '../src/enums';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration = resolve(repoRoot, 'supabase/migrations/0001_schema.sql');
const sql = readFileSync(existsSync(migration) ? migration : resolve(repoRoot, 'docs/PLAN.md'), 'utf8');

function sqlEnum(name: string): string[] {
  const match = new RegExp(`create type ${name}\\s+as enum\\s*\\(([^)]*)\\)`).exec(sql);
  if (!match) throw new Error(`enum ${name} not found in SQL`);
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

function sqlNumber(pattern: RegExp): number {
  const match = pattern.exec(sql);
  if (!match) throw new Error(`pattern not found in SQL: ${pattern}`);
  return Number(match[1]);
}

describe('enums match the SQL schema', () => {
  const pairs: Array<[string, readonly string[]]> = [
    ['user_role', enums.USER_ROLES],
    ['care_role', enums.CARE_ROLES],
    ['employment_type', enums.EMPLOYMENT_TYPES],
    ['pay_period', enums.PAY_PERIODS],
    ['shift_pref', enums.SHIFT_PREFS],
    ['job_status', enums.JOB_STATUSES],
    ['application_status', enums.APPLICATION_STATUSES],
    ['payment_status', enums.PAYMENT_STATUSES],
    ['subscription_status', enums.SUBSCRIPTION_STATUSES],
    ['language_level', enums.LANGUAGE_LEVELS],
    ['contact_status', enums.CONTACT_STATUSES],
  ];
  for (const [name, values] of pairs) {
    it(name, () => expect([...values]).toEqual(sqlEnum(name)));
  }

  it('contact topics match the CHECK constraint', () => {
    const match = /topic\s+text not null check \(topic in \(([^)]*)\)\)/.exec(sql);
    const topics = [...match![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect([...enums.CONTACT_TOPICS]).toEqual(topics);
  });

  it('employer-settable application statuses are a subset, and never submitted or withdrawn', () => {
    const all: readonly string[] = enums.APPLICATION_STATUSES;
    for (const status of enums.EMPLOYER_APPLICATION_STATUSES) expect(all).toContain(status);
    expect(enums.EMPLOYER_APPLICATION_STATUSES).not.toContain('submitted');
    expect(enums.EMPLOYER_APPLICATION_STATUSES).not.toContain('withdrawn');
    const guard = /new\.status not in \(([^)]*)\)/.exec(sql);
    const inSql = [...guard![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect([...enums.EMPLOYER_APPLICATION_STATUSES]).toEqual(inSql);
  });
});

describe('constants match the SQL schema', () => {
  it('default company name', () => {
    const match = /company_name\s+text not null default '([^']*)'/.exec(sql);
    expect(match?.[1]).toBe(DEFAULT_COMPANY_NAME);
  });

  it('job completeness thresholds', () => {
    expect(sqlNumber(/length\(trim\(coalesce\(j\.title,''\)\)\)\s*<\s*(\d+)/)).toBe(JOB_LIMITS.titleMin);
    expect(sqlNumber(/length\(trim\(coalesce\(j\.description,''\)\)\)\s*<\s*(\d+)/)).toBe(JOB_LIMITS.descriptionMin);
  });

  it('Pay Per Post duration', () => {
    expect(sqlNumber(/expires_at = now\(\) \+ interval '(\d+) days'/)).toBe(PAY_PER_POST.durationDays);
  });

  it('message and contact limits', () => {
    expect(sqlNumber(/length\(body\) between 1 and (\d+)/)).toBe(MESSAGE_LIMITS.bodyMax);
    expect(sqlNumber(/length\(name\) between 1 and (\d+)/)).toBe(CONTACT_LIMITS.nameMax);
    expect(sqlNumber(/length\(message\) between (\d+) and \d+/)).toBe(CONTACT_LIMITS.messageMin);
    expect(sqlNumber(/length\(message\) between \d+ and (\d+)/)).toBe(CONTACT_LIMITS.messageMax);
    expect(sqlNumber(/length\(email\) <= (\d+)/)).toBe(CONTACT_LIMITS.emailMax);
  });
});
