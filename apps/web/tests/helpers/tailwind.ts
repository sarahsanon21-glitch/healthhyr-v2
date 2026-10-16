// Checks that every class a rendered component uses is a real, generated utility.
// Catches typos and theme gaps (for example a font weight the theme does not define),
// which otherwise fail silently because an unknown Tailwind class just does nothing.
import { compile } from '@tailwindcss/node';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect } from 'vitest';

const appDir = resolve(import.meta.dirname, '../../src/app');
const css = readFileSync(resolve(appDir, 'globals.css'), 'utf8');

// Marker classes that Tailwind variants key on. They intentionally produce no CSS of their own.
const MARKERS = new Set(['group', 'peer']);

let compiler: ReturnType<typeof compile> | undefined;

const backslash = String.fromCharCode(92);
const escapeClass = (name: string) => name.replace(/[^A-Za-z0-9_-]/g, (char) => backslash + char);

export function classesIn(root: ParentNode): string[] {
  const classes = new Set<string>();
  root.querySelectorAll('[class]').forEach((element) => element.classList.forEach((name) => classes.add(name)));
  return [...classes];
}

export async function expectClassesGenerated(root: ParentNode = document.body): Promise<void> {
  const classes = classesIn(root).filter((name) => !MARKERS.has(name));
  compiler ??= compile(css, { base: appDir, onDependency() {} });
  const output = (await compiler).build(classes);
  const missing = classes.filter((name) => !output.includes('.' + escapeClass(name)));
  expect(missing, 'classes that generate no CSS').toEqual([]);
}
