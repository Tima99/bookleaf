'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { AuthSessionDto, LoginRequest, SessionUser } from '@bookleaf/contracts';
import { ApiClientError, setCsrfToken, setUnauthenticatedHandler } from '@/lib/api-client';
import { endpoints, queryKeys } from '@/lib/endpoints';

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  login: (input: LoginRequest) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function homeFor(user: SessionUser): string {
  return user.role === 'ADMIN' ? '/admin' : '/author';
}

/**
 * Session state comes from the API (`/auth/me`). The session cookie is HTTP-only, so
 * the browser never sees the token; only the CSRF token is held in memory.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const session = useQuery({
    queryKey: queryKeys.session,
    queryFn: async (): Promise<AuthSessionDto | null> => {
      try {
        return await endpoints.auth.me();
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    setCsrfToken(session.data?.csrfToken ?? null);
  }, [session.data]);

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      queryClient.setQueryData(queryKeys.session, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
      router.replace('/login?expired=1');
    });
    return () => setUnauthenticatedHandler(null);
  }, [queryClient, router]);

  const login = useCallback(
    async (input: LoginRequest) => {
      const result = await endpoints.auth.login(input);
      setCsrfToken(result.csrfToken);
      queryClient.setQueryData(queryKeys.session, result);
      return result.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await endpoints.auth.logout();
    } finally {
      setCsrfToken(null);
      queryClient.clear();
      queryClient.setQueryData(queryKeys.session, null);
      router.replace('/login');
    }
  }, [queryClient, router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: session.data?.user ?? null, isLoading: session.isPending, login, logout }),
    [session.data, session.isPending, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
