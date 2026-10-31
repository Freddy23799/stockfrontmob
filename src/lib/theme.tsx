import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme as useDeviceScheme } from 'react-native';

import { api } from './api';
import { useAuth } from './auth';
import { storage } from './storage';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'vylaxo.theme';
const valid = (v: unknown): v is ThemePref => v === 'system' || v === 'light' || v === 'dark';

type Value = { pref: ThemePref; setPref: (next: ThemePref) => void };
const ThemePrefContext = createContext<Value | null>(null);

function apply(pref: ThemePref) {
  try {
    // null = suivre l'appareil ; sinon le choix de l'utilisateur s'impose a toute l'application
    Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
  } catch {
    // plateforme sans cette API : on reste sur le theme de l'appareil
  }
}

/**
 * Theme de l'application : suit l'appareil par defaut ; l'utilisateur peut le forcer dans son compte.
 * Une fois connecte, le choix est enregistre sur le compte et retrouve sur ses autres appareils.
 */
export function ThemePrefProvider({ children }: { children: ReactNode }) {
  const { status, profile } = useAuth();
  const [pref, setPrefState] = useState<ThemePref>('system');

  useEffect(() => {
    void storage.getItem(KEY).then((saved) => {
      if (valid(saved)) {
        setPrefState(saved);
        apply(saved);
      }
    });
  }, []);

  // le choix enregistre sur le compte l'emporte a la connexion
  const accountTheme = status === 'signedIn' && typeof profile?.theme === 'string' ? profile.theme : null;
  useEffect(() => {
    if (valid(accountTheme)) {
      // synchronisation avec une source externe (le compte sur le serveur) : un effet est bien l'outil adapte ici
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrefState(accountTheme);
      apply(accountTheme);
      void storage.setItem(KEY, accountTheme);
    }
  }, [accountTheme]);

  const setPref = useCallback(
    (next: ThemePref) => {
      setPrefState(next);
      apply(next);
      void storage.setItem(KEY, next);
      if (status === 'signedIn' && profile?.accountType === 'MERCHANT') {
        void api('/api/merchant/profile', { method: 'PATCH', body: { theme: next } }).catch(() => {});
      }
    },
    [status, profile?.accountType],
  );

  const value = useMemo(() => ({ pref, setPref }), [pref, setPref]);
  return <ThemePrefContext.Provider value={value}>{children}</ThemePrefContext.Provider>;
}

export function useThemePref(): Value {
  const ctx = useContext(ThemePrefContext);
  if (!ctx) throw new Error('useThemePref doit etre utilise dans <ThemePrefProvider>');
  return ctx;
}

/** Theme effectivement affiche : le choix de l'utilisateur, sinon celui de l'appareil. */
export function useResolvedScheme(): 'light' | 'dark' {
  const device = useDeviceScheme();
  const pref = useContext(ThemePrefContext)?.pref ?? 'system';
  if (pref === 'light' || pref === 'dark') return pref;
  return device === 'dark' ? 'dark' : 'light';
}
