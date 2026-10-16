// Node-only: reads the legal documents from disk. Import from '@healthhyr/shared/legal'.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type LegalStatus = 'draft' | 'final';
export type LegalDocName = 'terms' | 'privacy';

export interface LegalDoc {
  status: LegalStatus;
  body: string;
}

/** Documents are Markdown with a small frontmatter block: `status: draft` or `status: final`. */
export function parseLegalDoc(raw: string): LegalDoc {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) throw new Error('Legal document is missing its frontmatter block');
  const status = /^status:\s*(draft|final)\s*$/m.exec(match[1] ?? '')?.[1];
  if (status !== 'draft' && status !== 'final') {
    throw new Error('Legal document frontmatter must contain "status: draft" or "status: final"');
  }
  return { status, body: (match[2] ?? '').trim() };
}

export function readLegalDoc(name: LegalDocName): LegalDoc {
  return parseLegalDoc(readFileSync(fileURLToPath(new URL(`./${name}.md`, import.meta.url)), 'utf8'));
}

/** True only when the owner has supplied the final text for every document. */
export function areLegalDocsFinal(): boolean {
  return (['terms', 'privacy'] as const).every((name) => readLegalDoc(name).status === 'final');
}
