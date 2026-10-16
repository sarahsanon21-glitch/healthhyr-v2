'use client';

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createApiClient, type ApiClient } from '../api/client';
import { PublicEnvError, readPublicEnv } from '../public-env';
import { createBrowserSupabase, createSupabaseBackend } from './backend';
import { createAuthService } from './service';
import { LOADING_STATE, type AuthService, type AuthState } from './types';

interface AuthContextValue {
  state: AuthState;
  /** Null only while the browser client is being created, or when configuration is missing. */
  service: AuthService | null;
  /** The HealthHyr API client for the signed-in person. It sends their access token. */
  api: ApiClient | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const noop = () => () => {};

function createBrowserAuth(): { service: AuthService; api: ApiClient } {
  const env = readPublicEnv();
  const supabase = createBrowserSupabase(env);
  const backend = createSupabaseBackend(supabase);
  const api = createApiClient({ baseUrl: env.apiBaseUrl, getAccessToken: () => backend.accessToken() });
  return { service: createAuthService({ backend, api }), api };
}

export interface AuthProviderProps {
  /** Tests pass a ready-made service. In the browser it is built from the public environment. */
  service?: AuthService;
  /** Tests pass a fake API client alongside the service. */
  api?: ApiClient;
  children: ReactNode;
}

/**
 * Holds the signed-in state for the whole site. Nothing protected is ever rendered from the server:
 * until the browser has loaded the session and asked the API for the role, the state is "loading".
 */
export function AuthProvider({ service: provided, api: providedApi, children }: AuthProviderProps) {
  const [service, setService] = useState<AuthService | null>(provided ?? null);
  const [api, setApi] = useState<ApiClient | null>(providedApi ?? null);
  const [configProblem, setConfigProblem] = useState<string | null>(null);

  useEffect(() => {
    if (service) return;
    try {
      const built = createBrowserAuth();
      setService(built.service);
      setApi(built.api);
    } catch (error) {
      // Only variable names are shown, never values.
      setConfigProblem(error instanceof PublicEnvError ? error.problems.join('. ') : 'The website could not start.');
    }
  }, [service]);

  useEffect(() => {
    if (service) void service.start();
  }, [service]);

  const state = useSyncExternalStore(
    service ? (listener) => service.subscribe(listener) : noop,
    service ? () => service.getState() : () => LOADING_STATE,
    () => LOADING_STATE,
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      service,
      api,
      state: configProblem ? { status: 'error', user: null, message: configProblem } : state,
    }),
    [service, api, state, configProblem],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
