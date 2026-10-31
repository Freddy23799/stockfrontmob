import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { api } from './api';

const POLL_MS = 60_000;

/** Nombre de demandes dont la derniere reponse du service client n'a pas ete lue (pastille de la ligne « Service client »). */
export function useSupportUnread(shopId?: string): { count: number; refresh: () => Promise<void> } {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    try { setCount((await api<{ threads: number }>('/api/support/unread', { shop: shopId })).threads); } catch { /* hors ligne : on garde le dernier compte */ }
  }, [shopId]);
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);   // hors du corps de l'effet : pas de setState synchrone
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, POLL_MS);
    const state = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => { clearTimeout(first); clearInterval(timer); state.remove(); };
  }, [refresh]);
  return { count, refresh };
}

export const CATEGORIES = ['PROBLEM', 'SUGGESTION', 'QUESTION', 'BILLING', 'OTHER'] as const;
export const CAT_ICON: Record<string, string> = { PROBLEM: 'triangle-exclamation', SUGGESTION: 'lightbulb', QUESTION: 'circle-question', BILLING: 'credit-card', OTHER: 'comments' };

export type SupportThread = {
  id: string; number: number; category: string; subject: string; status: 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'CLOSED'; assignedName: string | null;
  messageCount: number; lastMessageAt: string; preview: string | null; lastSender: string | null; unread: boolean; shopName: string | null; createdAt: string;
};
export type SupportMessage = { seq: number; id: string; kind: string; senderType: 'USER' | 'ADMIN' | 'SYSTEM'; senderName: string | null; body: string; createdAt: string };
export type SupportMessages = { items: SupportMessage[]; hasMore: boolean; lastSeq: number; status: SupportThread['status']; assignedName: string | null };
