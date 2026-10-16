// Starts the real HealthHyr API app on a local port, wired to the REAL local Supabase: real token
// verification, real per-request and anon clients (so row-level security applies through the real
// Data API), and the real server-only job transitions with the local service-role key.
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/app';
import { createTokenVerifier, remoteKeys } from '../../src/auth/verifyToken';
import { createAnonClient } from '../../src/lib/anonClient';
import { createServiceClient } from '../../src/lib/serviceClient';
import { createUserClientFactory } from '../../src/lib/userClient';
import { silentLogger } from '../../src/logger';
import { createJobTransitions } from '../../src/services/jobTransitions';
import { serviceRoleKey, supabaseEnv } from './env';

export interface RunningApi {
  url: string;
  close: () => Promise<void>;
}

export async function startApi(): Promise<RunningApi> {
  const { url, anonKey } = supabaseEnv();
  const issuer = `${url}/auth/v1`;
  const app = createApp({
    corsOrigins: ['http://localhost:3000'],
    trustProxy: 0,
    rateLimit: { windowMs: 60_000, max: 10_000 },
    userRateLimit: { windowMs: 60_000, max: 10_000 },
    verifyToken: createTokenVerifier({ keys: remoteKeys(`${issuer}/.well-known/jwks.json`), issuer, audience: 'authenticated' }),
    createUserClient: createUserClientFactory({ url, anonKey }),
    anonClient: createAnonClient({ url, anonKey }),
    jobTransitions: createJobTransitions(createServiceClient({ url, serviceRoleKey: serviceRoleKey() })),
    logger: silentLogger,
  });
  let server!: Server;
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
