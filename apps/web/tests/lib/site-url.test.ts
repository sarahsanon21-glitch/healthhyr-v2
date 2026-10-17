import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_URL, PublicEnvError, parseSiteUrl } from '../../src/lib/public-env';

describe('parseSiteUrl', () => {
  it('uses the local address when nothing is set, so the site still starts', () => {
    expect(parseSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(parseSiteUrl('')).toBe(DEFAULT_SITE_URL);
    expect(parseSiteUrl('   ')).toBe(DEFAULT_SITE_URL);
  });

  it('keeps only the origin, dropping any path, query or trailing slash', () => {
    expect(parseSiteUrl('https://healthhyr.com/')).toBe('https://healthhyr.com');
    expect(parseSiteUrl('https://healthhyr.com/jobs?x=1#top')).toBe('https://healthhyr.com');
    expect(parseSiteUrl(' http://localhost:3000 ')).toBe('http://localhost:3000');
  });

  it.each(['healthhyr.com', 'javascript:alert(1)', 'ftp://healthhyr.com', '//healthhyr.com', 'not a url'])('refuses %j', (value) => {
    expect(() => parseSiteUrl(value)).toThrow(PublicEnvError);
  });

  it('never includes the value in the error message', () => {
    try {
      parseSiteUrl('javascript:secret-looking-value');
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-looking-value');
    }
  });
});
