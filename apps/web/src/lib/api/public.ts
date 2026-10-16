// Server-side access to the public API routes (pages anyone can open). No sign-in, no token.
import type { PublicCompany } from '@healthhyr/shared';
import { readPublicEnv } from '../public-env';
import { createPublicApiClient } from './client';

/** A listed company's public page data, or null when there is no such page. */
export async function fetchPublicCompany(slug: string): Promise<PublicCompany | null> {
  const { apiBaseUrl } = readPublicEnv();
  return createPublicApiClient({ baseUrl: apiBaseUrl }).getCompany(slug);
}
