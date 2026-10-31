import { useEffect, useSyncExternalStore } from 'react';

import { cacheGet, cacheSet } from './cache';
import type { Product } from './format';

/**
 * Commandes de salle prises SANS reseau (voir le site : offline/restaurant.js). Les operations partent dans la file hors ligne, dans
 * l'ordre, avec des identifiants choisis ici (le serveur ignore un doublon) ; en attendant, la commande vit sur le telephone.
 * La copie locale disparait quand plus aucune operation en file ne la concerne.
 */
export type LocalLine = { id: string; productId: string; name: string; quantity: number; unitPrice: number; lineTotal: number; note?: string | null; course: number; station: string; status: string; paid: boolean; voidReason?: string | null };
export type LocalOrder = {
  id: string; number: string; channel: string; status: string; tableId?: string | null; tableName?: string | null; zone?: string | null; covers: number; partyId?: string | null; customerName?: string | null;
  phone?: string | null; address?: string | null; serverName?: string | null; openedAt: string; closedAt?: string | null; total: number; paidTotal: number; due: number; lineCount: number; readyCount: number;
  saleIds: string[]; lines: LocalLine[]; local?: boolean;
};

const key = (shopId: string) => `rs.local.${shopId}`;
const stores = new Map<string, Record<string, LocalOrder>>();
const hydrated = new Set<string>();
const listeners = new Set<() => void>();
const EMPTY: Record<string, LocalOrder> = {};
const emit = () => listeners.forEach((l) => l());
const get = (shopId: string) => stores.get(shopId) ?? EMPTY;
function set(shopId: string, next: Record<string, LocalOrder>) {
  stores.set(shopId, next);
  void cacheSet(key(shopId), next);
  emit();
}

export function saveLocalOrder(shopId: string, order: LocalOrder) { set(shopId, { ...get(shopId), [order.id]: { ...order, local: true } }); }
export function getLocalOrder(shopId: string, id: string): LocalOrder | null { return get(shopId)[id] ?? null; }

/** Copies locales de la boutique ; `liveIds` = commandes encore citees par la file (les autres sont reprises par le serveur). */
export function useLocalOrders(shopId: string, liveIds: Set<string>): Record<string, LocalOrder> {
  const map = useSyncExternalStore((fn) => { listeners.add(fn); return () => void listeners.delete(fn); }, () => get(shopId), () => EMPTY);
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!hydrated.has(shopId)) {
        hydrated.add(shopId);
        const saved = await cacheGet<Record<string, LocalOrder>>(key(shopId));
        if (saved && alive) { stores.set(shopId, { ...saved, ...get(shopId) }); emit(); }
      }
    };
    void run();
    return () => { alive = false; };
  }, [shopId]);
  useEffect(() => {
    const cur = get(shopId);
    const keep = Object.fromEntries(Object.entries(cur).filter(([id]) => liveIds.has(id)));
    if (Object.keys(keep).length !== Object.keys(cur).length && hydrated.has(shopId)) set(shopId, keep);
  }, [shopId, liveIds]);
  return map;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export function recompute(o: LocalOrder): LocalOrder {
  const live = o.lines.filter((l) => l.status !== 'VOID');
  const total = r2(live.reduce((s, l) => s + Number(l.lineTotal), 0));
  const paid = r2(live.filter((l) => l.paid).reduce((s, l) => s + Number(l.lineTotal), 0));
  return { ...o, total, paidTotal: paid, due: r2(total - paid), lineCount: live.length, readyCount: o.lines.filter((l) => l.status === 'READY').length };
}

export function newLocalOrder(p: { id: string; channel: string; table?: { id: string; name?: string; zone?: string } | null; covers?: number; guest?: { customerName?: string; phone?: string; address?: string } }): LocalOrder {
  return recompute({ id: p.id, number: '…', channel: p.channel, status: 'OPEN', tableId: p.table?.id ?? null, tableName: p.table?.name ?? null, zone: p.table?.zone ?? null, covers: p.covers ?? 1,
    customerName: p.guest?.customerName || null, phone: p.guest?.phone || null, address: p.guest?.address || null, openedAt: new Date().toISOString(), saleIds: [], lines: [], total: 0, paidTotal: 0, due: 0, lineCount: 0, readyCount: 0, local: true });
}

export function withLines(order: LocalOrder, items: { id: string; product: Product; quantity?: number; note?: string | null; course?: number }[]): LocalOrder {
  const lines: LocalLine[] = items.map((it) => {
    const qty = Number(it.quantity ?? 1), price = Number(it.product.salePrice);
    return { id: it.id, productId: it.product.id, name: it.product.name, quantity: qty, unitPrice: price, lineTotal: r2(qty * price), note: it.note ?? null,
      course: Number(it.course ?? it.product.attributes?.course ?? 1) || 1, station: String(it.product.attributes?.station || 'KITCHEN').toUpperCase(), status: 'NEW', paid: false };
  });
  return recompute({ ...order, lines: [...order.lines, ...lines] });
}

export const withSent = (order: LocalOrder): LocalOrder => recompute({ ...order, lines: order.lines.map((l) => (l.status === 'NEW' ? { ...l, status: 'SENT' } : l)) });

export function withPaid(order: LocalOrder, lineIds: string[] | null): LocalOrder {
  const ids = lineIds ? new Set(lineIds) : null;
  const lines = order.lines.map((l) => (!l.paid && l.status !== 'VOID' && (!ids || ids.has(l.id)) ? { ...l, paid: true, status: l.status === 'NEW' ? 'SENT' : l.status } : l));
  const next = recompute({ ...order, lines });
  return next.lines.some((l) => !l.paid && l.status !== 'VOID') ? next : { ...next, status: 'CLOSED', closedAt: new Date().toISOString() };
}
