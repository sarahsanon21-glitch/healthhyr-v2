// The web app must never see the repository's root .env (it holds the local database URL and the
// service-role key for tests) and must never mention the service-role key. It gets only the three or
// four public values in apps/web/.env.local. These rules scan every file git tracks under apps/web,
// and the local .env.local if one exists on this machine.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { looksLikeSecretKey } from '../src/lib/public-env';

const repoRoot = resolve(import.meta.dirname, '../../..');
const webRoot = resolve(import.meta.dirname, '..');

// The two files that are themselves rules about these names, and so have to write the names down.
const RULE_FILES = ['apps/web/tests/env-isolation.test.ts', 'apps/web/tests/auth-source-rules.test.ts'];

// Names that carry the service-role key, in every spelling the code or a config file could use.
// (Plain prose such as "a service-role key must never ...", in a comment or message, is fine.)
const SERVICE_ROLE_NAME = /SERVICE_ROLE|serviceRole|service_role_key|SUPABASE_SECRET|SECRET_KEY/;

// Ways code or config could read a .env file, or step out of apps/web to find the root one.
const ENV_FILE_READERS: Array<[string, RegExp]> = [
  ['process.loadEnvFile', /loadEnvFile/],
  ['the dotenv package', /dotenv/i],
  ['Next.js loadEnvConfig', /loadEnvConfig/],
  ['node --env-file', /--env-file/],
  ['a path that climbs out of apps/web to a .env file', /\.\.[\\/](\.\.[\\/])*\.env/],
  ['reading a .env file', /(readFile|readFileSync|createReadStream|resolve|join)\([^)]*['"`][^'"`]*\.env\b/],
  ['import.meta.dirname joined with .env', /dirname[^;\n]*\.env\b/],
];

export interface SourceFile {
  path: string;
  text: string;
}

export function findServiceRoleMentions(files: SourceFile[]): string[] {
  return files.filter((file) => SERVICE_ROLE_NAME.test(file.text)).map((file) => file.path);
}

export function findEnvFileReads(files: SourceFile[]): string[] {
  return files.flatMap((file) => ENV_FILE_READERS.filter(([, pattern]) => pattern.test(file.text)).map(([name]) => `${file.path}: ${name}`));
}

/** Every text file git tracks under apps/web. */
function trackedWebFiles(): SourceFile[] {
  const listed = execFileSync('git', ['ls-files', '-z', '--', 'apps/web'], { cwd: repoRoot, encoding: 'utf8' });
  return listed
    .split('\0')
    .filter(Boolean)
    .filter((path) => !/\.(png|ico|jpg|jpeg|gif|webp|woff2?|ttf|otf|map|tsbuildinfo)$/i.test(path))
    .map((path) => ({ path, text: readFileSync(resolve(repoRoot, path), 'utf8') }));
}

// The sample names are assembled at runtime so this file never contains a server-only variable name
// itself (the repository-wide hygiene test fails on any file under apps/web that does).
const name = (...parts: string[]) => parts.join('_');

describe('what the scanners catch (so the rules below cannot go quiet)', () => {
  const scan = (text: string) => ({ roles: findServiceRoleMentions([{ path: 'x.ts', text }]), reads: findEnvFileReads([{ path: 'x.ts', text }]) });

  it.each([
    `const key = process.env.${name('SUPABASE', 'SERVICE', 'ROLE', 'KEY')};`,
    `const { ${['service', 'Role', 'Key'].join('')} } = config;`,
    `${name('SERVICE', 'ROLE', 'KEY')}=abc`,
    `const ${name('service', 'role', 'key')} = x`,
    name('SUPABASE', 'SECRET', 'KEY'),
    `${name('NEXT', 'PUBLIC', 'SERVICE', 'ROLE', 'KEY')}=x`,
  ])('flags the service-role key by name: %s', (text) => {
    expect(scan(text).roles).toEqual(['x.ts']);
  });

  it('does not flag plain words about it', () => {
    expect(scan('// the browser never holds a service-role key').roles).toEqual([]);
    expect(scan("'must be the publishable key, not a secret or service-role key'").roles).toEqual([]);
  });

  it.each([
    "process.loadEnvFile('.env')",
    "import 'dotenv/config'",
    "loadEnvConfig('../..')",
    '"dev": "next dev --env-file=../../.env"',
    "readFileSync('../../.env', 'utf8')",
    "readFileSync(resolve(import.meta.dirname, '../../../.env'))",
    "const path = join(__dirname, '..', '..', '.env')",
    "resolve(import.meta.dirname, '..', '.env')",
  ])('flags a read of the root .env: %s', (text) => {
    expect(scan(text).reads.length).toBeGreaterThan(0);
  });

  it('does not flag ordinary code', () => {
    expect(scan("import { readFileSync } from 'node:fs'; readFileSync('package.json')").reads).toEqual([]);
    expect(scan('NEXT_PUBLIC_API_BASE_URL=http://localhost:4000').reads).toEqual([]);
  });
});

describe('apps/web', () => {
  const all = trackedWebFiles();
  const files = all.filter((file) => !RULE_FILES.includes(file.path));

  it('has tracked files to scan (the rule is not checking nothing)', () => {
    const paths = all.map((file) => file.path);
    expect(paths).toContain('apps/web/next.config.ts');
    expect(paths).toContain('apps/web/package.json');
    expect(paths).toContain('apps/web/src/lib/public-env.ts');
    expect(paths).toContain('apps/web/.env.example');
    expect(paths.length).toBeGreaterThan(80);
  });

  it('never mentions the service-role key by name, in code, config, scripts, examples or tests', () => {
    expect(findServiceRoleMentions(files)).toEqual([]);
  });

  it('never reads the root .env, or any .env file, or climbs out of apps/web to one', () => {
    expect(findEnvFileReads(files)).toEqual([]);
  });

  it('the older source-rule test never reads an env file either', () => {
    expect(findEnvFileReads(all.filter((file) => file.path === 'apps/web/tests/auth-source-rules.test.ts'))).toEqual([]);
  });

  it('its example env file holds only the public NEXT_PUBLIC_ variables', () => {
    const example = files.find((file) => file.path === 'apps/web/.env.example')!;
    const names = [...example.text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]!);
    expect(names.length).toBeGreaterThan(0);
    for (const variable of names) expect(variable, variable).toMatch(/^NEXT_PUBLIC_/);
  });

  it('its package.json scripts do not load an env file from anywhere', () => {
    const scripts = JSON.parse(files.find((file) => file.path === 'apps/web/package.json')!.text).scripts as Record<string, string>;
    for (const [script, command] of Object.entries(scripts)) expect(command, script).not.toMatch(/--env-file|dotenv|\.env/);
  });

  it('next.config.ts sets no environment of its own', () => {
    const config = files.find((file) => file.path === 'apps/web/next.config.ts')!.text;
    expect(config).not.toMatch(/\benv\s*:|process\.env/);
  });
});

describe('the local apps/web/.env.local on this machine (skipped when it does not exist)', () => {
  const local = resolve(webRoot, '.env.local');
  const exists = existsSync(local);

  it.skipIf(!exists)('holds only NEXT_PUBLIC_ variables, and none of their values is a secret or service-role key', () => {
    const lines = readFileSync(local, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('#'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const [variable, ...rest] = line.split('=');
      const value = rest.join('=').trim().replace(/^["']|["']$/g, '');
      expect(variable, `${relative(repoRoot, local)}: ${variable}`).toMatch(/^NEXT_PUBLIC_[A-Z_]+$/);
      expect(SERVICE_ROLE_NAME.test(variable!), `${variable} names a secret`).toBe(false);
      expect(looksLikeSecretKey(value), `${variable} holds a secret or service-role key`).toBe(false);
    }
  });
});
