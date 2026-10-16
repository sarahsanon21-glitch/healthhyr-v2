import { describe, expect, it } from 'vitest';
import { areLegalDocsFinal, parseLegalDoc, readLegalDoc } from '../src/legal';

describe('legal documents', () => {
  it('Terms and Privacy ship as drafts until the owner supplies the text', () => {
    expect(readLegalDoc('terms').status).toBe('draft');
    expect(readLegalDoc('privacy').status).toBe('draft');
    expect(areLegalDocsFinal()).toBe(false);
  });

  it('parses frontmatter and body', () => {
    expect(parseLegalDoc('---\nstatus: final\n---\n# Title\n\nText')).toEqual({
      status: 'final',
      body: '# Title\n\nText',
    });
  });

  it('rejects a missing or invalid status', () => {
    expect(() => parseLegalDoc('# No frontmatter')).toThrow();
    expect(() => parseLegalDoc('---\nstatus: maybe\n---\nbody')).toThrow();
    expect(() => parseLegalDoc('---\ntitle: x\n---\nbody')).toThrow();
  });
});
