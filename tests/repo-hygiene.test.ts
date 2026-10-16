import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

// Every file that is tracked, or untracked but not ignored (i.e. about to be committed).
function candidateFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

function isIgnored(path: string): boolean {
  return spawnSync('git', ['check-ignore', '-q', path], { cwd: root }).status === 0;
}

function readText(file: string): string | null {
  const full = join(root, file);
  if (!existsSync(full) || statSync(full).size > 2 * 1024 * 1024) return null;
  const text = readFileSync(full, 'utf8');
  return text.includes('\0') ? null : text;
}

const files = candidateFiles();

describe('workspace', () => {
  it('declares npm workspaces for apps and packages', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      private?: boolean;
      workspaces?: string[];
    };
    expect(pkg.private).toBe(true);
    expect(pkg.workspaces).toEqual(['apps/*', 'packages/*']);
  });
});

describe('secrets hygiene', () => {
  it('commits only .env.example files, never a real .env file', () => {
    const envFiles = files.filter((f) => /^\.env(\..+)?$/.test(basename(f)));
    const real = envFiles.filter((f) => basename(f) !== '.env.example');
    expect(real).toEqual([]);
  });

  it('git-ignores real env files but not .env.example', () => {
    for (const path of ['.env', '.env.local', 'apps/api/.env', 'apps/web/.env.local', 'apps/api/.env.production']) {
      expect(isIgnored(path), `${path} must be ignored`).toBe(true);
    }
    for (const path of ['.env.example', 'apps/api/.env.example', 'apps/web/.env.example']) {
      expect(isIgnored(path), `${path} must not be ignored`).toBe(false);
    }
  });

  it('contains no secret-looking strings in committed text files', () => {
    const patterns: Array<[string, RegExp]> = [
      ['Stripe secret key', /\b[sr]k_(live|test)_[A-Za-z0-9]{16,}/],
      ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{16,}/],
      ['JWT (Supabase key)', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
      ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ];
    const hits: string[] = [];
    for (const file of files) {
      if (basename(file) === 'package-lock.json') continue;
      const text = readText(file);
      if (text === null) continue;
      for (const [name, re] of patterns) {
        if (re.test(text)) hits.push(`${file}: ${name}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('never references server-only secret names from web or shared code', () => {
    const serverOnly = /SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY|STRIPE_SECRET|STRIPE_WEBHOOK|SMTP_PASS/;
    const hits: string[] = [];
    for (const file of files) {
      if (!file.startsWith('apps/web/') && !file.startsWith('packages/shared/')) continue;
      const text = readText(file);
      if (text !== null && serverOnly.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
