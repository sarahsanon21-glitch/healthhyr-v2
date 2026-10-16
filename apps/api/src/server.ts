// Process entry point: load config (fail fast), wire the app, listen.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';
import { createTokenVerifier, remoteKeys } from './auth/verifyToken';
import { EnvError, parseEnv } from './env';
import { createUserClientFactory } from './lib/userClient';
import { consoleLogger } from './logger';

// Local development reads apps/api/.env (git-ignored). Real environment variables win over it.
// API_ENV_FILE points somewhere else, for example to a file that does not exist in boot tests.
const envFile = process.env.API_ENV_FILE ?? resolve(import.meta.dirname, '../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

let config;
try {
  config = parseEnv(process.env);
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const app = createApp({
  corsOrigins: config.corsOrigins,
  trustProxy: config.trustProxy,
  rateLimit: config.rateLimit,
  verifyToken: createTokenVerifier({
    keys: remoteKeys(config.supabase.jwksUrl),
    issuer: config.supabase.issuer,
    audience: config.supabase.audience,
  }),
  createUserClient: createUserClientFactory(config.supabase),
  logger: consoleLogger,
});

const server = app.listen(config.port, () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  consoleLogger.info({ port, env: config.nodeEnv }, 'listening');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    consoleLogger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
