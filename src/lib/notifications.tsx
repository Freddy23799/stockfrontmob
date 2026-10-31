import * as Notifications from 'expo-notifications';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { api } from './api';
import { pushSupported } from './push';

type Counts = { shop: number; system: number; total: number };
type Value = { counts: Counts; refresh: () => Promise<void> };

const ZERO: Counts = { shop: 0, system: 0, total: 0 };
const NotificationsContext = createContext<Value | null>(null);
const POLL_MS = 60_000;

/**
 * Compteur de non lues de la boutique ouverte. Mis a jour toutes les minutes tant que l'application est au premier plan, a chaque
 * retour dans l'application, et des qu'une notification arrive.
 */
export function NotificationsProvider({ shopId, children }: { shopId?: string; children: ReactNode }) {
  const [counts, setCounts] = useState<Counts>(ZERO);

  const refresh = useCallback(async () => {
    try {
      setCounts(await api<Counts>('/api/notifications/unread', { shop: shopId }));
    } catch {
      // hors ligne ou session expiree : on garde le dernier compteur connu
    }
  }, [shopId]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);   // hors du corps de l'effet : pas de setState synchrone
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, POLL_MS);
    const state = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    const received = pushSupported() ? Notifications.addNotificationReceivedListener(() => void refresh()) : null;
    return () => { clearTimeout(first); clearInterval(timer); state.remove(); received?.remove(); };
  }, [refresh]);

  const value = useMemo(() => ({ counts, refresh }), [counts, refresh]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/** Hors d'une boutique (liste des boutiques, compte), il n'y a pas de compteur : tout est a zero. */
export function useNotifications(): Value {
  return useContext(NotificationsContext) ?? { counts: ZERO, refresh: async () => undefined };
}

/** Texte d'un dictionnaire {fr, en, es} dans la langue de l'utilisateur, sinon francais. */
export const pick = (dict: Record<string, string> | undefined, lang: string): string => dict?.[lang] || dict?.fr || Object.values(dict ?? {})[0] || '';

/** « il y a 5 minutes », « hier », puis la date au-dela d'un mois. */
export function ago(iso: string, lang: string): string {
  const date = new Date(iso);
  const diff = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  try {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    if (abs < 60) return rtf.format(0, 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  } catch {
    // Intl indisponible : on affiche la date
  }
  return date.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
}
