import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAccessTokenChange, refreshAccessToken } from '@/services/api';
import { authService } from '@/services/auth';
import type { LoginRequest, Me, RegisterRequest } from '@/types';

export interface AuthContextValue {
  user: Me | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginRequest) => Promise<Me>;
  register: (payload: RegisterRequest) => Promise<Me>;
  logout: () => Promise<void>;
  reload: () => Promise<Me | null>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async (): Promise<Me | null> => {
    try {
      const me = await authService.me();
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  // On boot, try to restore a session from the httpOnly refresh cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await refreshAccessToken();
      if (token && !cancelled) await reload();
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // If a refresh ever fails, the token is cleared: drop the user too.
  useEffect(
    () =>
      onAccessTokenChange((token) => {
        if (!token) setUser(null);
      }),
    [],
  );

  const login = useCallback(
    async (payload: LoginRequest): Promise<Me> => {
      await authService.login(payload);
      const me = await authService.me();
      setUser(me);
      return me;
    },
    [],
  );

  const register = useCallback(
    async (payload: RegisterRequest): Promise<Me> => {
      await authService.register(payload);
      return login({ email: payload.email, password: payload.password });
    },
    [login],
  );

  const logout = useCallback(async (): Promise<void> => {
    await authService.logout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, isAuthenticated: user !== null, login, register, logout, reload }),
    [user, isLoading, login, register, logout, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
