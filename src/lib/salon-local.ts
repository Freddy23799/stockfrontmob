import { useEffect, useSyncExternalStore } from 'react';

import { cacheGet, cacheSet } from './cache';

/**
 * Salon hors ligne (voir le site : offline/salon.js). Arrivee, demarrage, encaissement, nouveau ticket et appel partent dans la file
 * d'operations, dans l'ordre, avec des identifiants choisis ici (le serveur ignore un doublon). En attendant, leur effet est garde sur
 * le telephone (superposition locale) pour que l'ecran montre le bon etat ; elle disparait quand plus rien en file ne la concerne.
 * Reserver, deplacer et annuler exigent le serveur (controle des conflits).
 */
export type Overlay = { appts: Record<string, Record<string, unknown>>; tickets: Record<string, Record<string, unknown>> };

const key = (shopId: string) => `sl.local.${shopId}`;
const stores = new Map<string, Overlay>();
const hydrated = new Set<string>();
const listeners = new Set<() => void>();
const EMPTY: Overlay = { appts: {}, tickets: {} };
const emit = () => listeners.forEach((l) => l());
const get = (shopId: string) => stores.get(shopId) ?? EMPTY;
function set(shopId: string, next: Overlay) {
  stores.set(shopId, next);
  void cacheSet(key(shopId), next);
  emit();
}

export function patchAppt(shopId: string, id: string, patch: Record<string, unknown>) {
  const cur = get(shopId);
  set(shopId, { ...cur, appts: { ...cur.appts, [id]: { ...(cur.appts[id] ?? {}), ...patch } } });
}
export function patchTicket(shopId: string, id: string, patch: Record<string, unknown>) {
  const cur = get(shopId);
  set(shopId, { ...cur, tickets: { ...cur.tickets, [id]: { ...(cur.tickets[id] ?? {}), ...patch } } });
}

/** `liveIds` = groupes encore cites par la file ; les autres sont repris par le serveur. */
export function useSalonOverlay(shopId: string, liveIds: Set<string>): Overlay {
  const data = useSyncExternalStore((fn) => { listeners.add(fn); return () => void listeners.delete(fn); }, () => get(shopId), () => EMPTY);
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (hydrated.has(shopId)) return;
      hydrated.add(shopId);
      const saved = await cacheGet<Overlay>(key(shopId));
      if (saved && alive) { const cur = get(shopId); stores.set(shopId, { appts: { ...saved.appts, ...cur.appts }, tickets: { ...saved.tickets, ...cur.tickets } }); emit(); }
    })();
    return () => { alive = false; };
  }, [shopId]);
  useEffect(() => {
    if (!hydrated.has(shopId)) return;
    const cur = get(shopId);
    const appts = Object.fromEntries(Object.entries(cur.appts).filter(([id]) => liveIds.has(id)));
    const tickets = Object.fromEntries(Object.entries(cur.tickets).filter(([id]) => liveIds.has(id)));
    if (Object.keys(appts).length !== Object.keys(cur.appts).length || Object.keys(tickets).length !== Object.keys(cur.tickets).length) set(shopId, { appts, tickets });
  }, [shopId, liveIds]);
  return data;
}

export function applyAppts<T extends { id: string }>(list: T[] | null, overlay: Overlay): T[] {
  return (list ?? []).map((a) => (overlay.appts[a.id] ? { ...a, ...overlay.appts[a.id] } : a));
}

export function applyTickets<T extends { id: string; status: string }>(list: T[] | null, overlay: Overlay): T[] {
  const known = new Set((list ?? []).map((x) => x.id));
  const merged = (list ?? []).map((x) => (overlay.tickets[x.id] ? { ...x, ...overlay.tickets[x.id] } : x));
  const local = Object.entries(overlay.tickets).filter(([id, x]) => !known.has(id) && x.local).map(([id, x]) => ({ id, ...x }) as unknown as T);
  return [...merged, ...local].filter((x) => ['WAITING', 'CALLED', 'IN_SERVICE'].includes(x.status));
}

export const NEXT_STATUS: Record<string, string> = { confirm: 'CONFIRMED', arrive: 'ARRIVED', start: 'IN_SERVICE', 'no-show': 'NO_SHOW' };
