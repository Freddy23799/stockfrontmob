import { useEffect, useSyncExternalStore } from 'react';

import { cacheGet, cacheSet } from './cache';

/**
 * Atelier hors ligne (voir le site : offline/tailor.js). Nouvelle commande, etape suivante et remise au client partent dans la file d'operations,
 * dans l'ordre, avec des identifiants choisis ici (le serveur ignore un doublon). En attendant, leur effet est garde sur le telephone
 * (superposition locale) ; elle disparait quand plus rien en file ne concerne la commande. Annuler, planifier un essayage et reassigner
 * exigent le serveur.
 */
export type Overlay = { orders: Record<string, Record<string, unknown>> };

const key = (shopId: string) => `tl.local.${shopId}`;
const stores = new Map<string, Overlay>();
const hydrated = new Set<string>();
const listeners = new Set<() => void>();
const EMPTY: Overlay = { orders: {} };
const emit = () => listeners.forEach((l) => l());
const get = (shopId: string) => stores.get(shopId) ?? EMPTY;
function set(shopId: string, next: Overlay) {
  stores.set(shopId, next);
  void cacheSet(key(shopId), next);
  emit();
}

export function patchOrder(shopId: string, id: string, patch: Record<string, unknown>) {
  const cur = get(shopId);
  set(shopId, { orders: { ...cur.orders, [id]: { ...(cur.orders[id] ?? {}), ...patch } } });
}

/** `liveIds` = groupes encore cites par la file ; les autres sont repris par le serveur. */
export function useTailorOverlay(shopId: string, liveIds: Set<string>): Overlay {
  const data = useSyncExternalStore((fn) => { listeners.add(fn); return () => void listeners.delete(fn); }, () => get(shopId), () => EMPTY);
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (hydrated.has(shopId)) return;
      hydrated.add(shopId);
      const saved = await cacheGet<Overlay>(key(shopId));
      if (saved && alive) { const cur = get(shopId); stores.set(shopId, { orders: { ...saved.orders, ...cur.orders } }); emit(); }
    })();
    return () => { alive = false; };
  }, [shopId]);
  useEffect(() => {
    if (!hydrated.has(shopId)) return;
    const cur = get(shopId);
    const orders = Object.fromEntries(Object.entries(cur.orders).filter(([id]) => liveIds.has(id)));
    if (Object.keys(orders).length !== Object.keys(cur.orders).length) set(shopId, { orders });
  }, [shopId, liveIds]);
  return data;
}

type Mergeable = { id: string };
export function applyOrders<T extends Mergeable>(list: T[] | null, overlay: Overlay): T[] {
  const known = new Set((list ?? []).map((o) => o.id));
  const merged = (list ?? []).map((o) => (overlay.orders[o.id] ? { ...o, ...overlay.orders[o.id] } : o));
  const local = Object.entries(overlay.orders).filter(([id, o]) => !known.has(id) && o.local).map(([id, o]) => ({ id, ...o }) as unknown as T);
  return [...local, ...merged];
}
