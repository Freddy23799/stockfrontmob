import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  api,
  NetworkError,
  refreshSession,
  setAccessToken,
  setCurrentShop,
  setSessionLostHandler,
  storeTokens,
  type TokenPair,
} from './api';
import { cacheClear } from './cache';
import { getGoogleIdToken, googleSignOut } from './google';
import { disablePush } from './push';
import { tokenStore, type Profile } from './token-store';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: Status;
  profile: Profile | null;
  /** Vrai si la session a ete restauree sans pouvoir joindre le serveur. */
  offline: boolean;
  loginWithPassword: (identifier: string, password: string, captchaToken?: string | null) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginAsEmployee: (shopCode: string, username: string, password: string, captchaToken?: string | null) => Promise<void>;
  register: (input: { fullName: string; identifier: string; password: string }, captchaToken?: string | null) => Promise<void>;
  logout: () => Promise<void>;
  /** Recharge le profil depuis le serveur (ex. apres l'etape profil). */
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offline, setOffline] = useState(false);

  const clear = useCallback(async () => {
    setAccessToken(null);
    setCurrentShop(null);
    await tokenStore.clearSession();
    await cacheClear({ keep: ['outbox'] }); // les donnees d'une boutique ne restent pas apres la deconnexion, SAUF les ventes pas encore envoyees
    setProfile(null);
    setOffline(false);
    setStatus('signedOut');
  }, []);

  const loadProfile = useCallback(async () => {
    const me = await api<Profile>('/api/auth/me');
    await tokenStore.setProfile(me);
    setProfile(me);
    setOffline(false);
    setStatus('signedIn');
  }, []);

  const acceptTokens = useCallback(
    async (pair: TokenPair) => {
      await storeTokens(pair);
      await loadProfile();
    },
    [loadProfile],
  );

  // Au demarrage : restaure la session. Pas de reseau => on reste connecte avec le profil local.
  useEffect(() => {
    setSessionLostHandler(() => void clear());
    (async () => {
      if (!(await tokenStore.getRefreshToken())) {
        setStatus('signedOut');
        return;
      }
      const outcome = await refreshSession();
      if (outcome === 'ok') {
        try {
          await loadProfile();
        } catch (e) {
          if (e instanceof NetworkError) {
            setProfile(await tokenStore.getProfile());
            setOffline(true);
            setStatus('signedIn');
          } else {
            await clear();
          }
        }
      } else if (outcome === 'network') {
        const cached = await tokenStore.getProfile();
        if (cached) {
          setProfile(cached);
          setOffline(true);
          setStatus('signedIn');
        } else {
          setStatus('signedOut');
        }
      } else {
        await clear();
      }
    })();
    return () => setSessionLostHandler(null);
  }, [clear, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      offline,
      loginWithPassword: async (identifier, password, captchaToken) =>
        acceptTokens(await api<TokenPair>('/api/auth/merchant/login', { method: 'POST', auth: false, body: { identifier, password, captchaToken } })),
      loginAsEmployee: async (shopCode, username, password, captchaToken) =>
        acceptTokens(await api<TokenPair>('/api/auth/employee/login', { method: 'POST', auth: false, body: { shopCode: shopCode.trim().toUpperCase(), username: username.trim(), password, captchaToken } })),
      loginWithGoogle: async () => {
        const idToken = await getGoogleIdToken();
        await acceptTokens(await api<TokenPair>('/api/auth/google', { method: 'POST', auth: false, body: { idToken } }));
      },
      register: async ({ fullName, identifier, password }, captchaToken) => {
        const trimmed = identifier.trim();
        const body = {
          fullName,
          password,
          captchaToken,
          email: trimmed.includes('@') ? trimmed : undefined,
          phone: !trimmed.includes('@') && /^[+\d][\d\s]+$/.test(trimmed) ? trimmed : undefined,
          username: !trimmed.includes('@') && !/^[+\d][\d\s]+$/.test(trimmed) ? trimmed : undefined,
        };
        await acceptTokens(await api<TokenPair>('/api/auth/merchant/register', { method: 'POST', auth: false, body }));
      },
      refreshProfile: loadProfile,
      logout: async () => {
        await disablePush(); // cet appareil ne doit plus recevoir les alertes de ce compte
        const refreshToken = await tokenStore.getRefreshToken();
        if (refreshToken) {
          // meme sans reseau on se deconnecte localement ; le jeton expirera cote serveur
          await api('/api/auth/logout', { method: 'POST', auth: false, body: { refreshToken } }).catch(() => undefined);
        }
        await googleSignOut();
        await clear();
      },
    }),
    [status, profile, offline, acceptTokens, clear, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit etre utilise dans <AuthProvider>');
  return ctx;
}
