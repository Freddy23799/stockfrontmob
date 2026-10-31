import { useCallback, useEffect, useMemo, useState } from 'react';

import { NetworkError } from '@/lib/api';
import { cacheGet, cacheSet } from '@/lib/cache';
import { useOffline } from '@/lib/offline';
import { useShop } from '@/lib/shop';

export type CashSession = { id: string; openedAt: string; openingFloat: number | string; [k: string]: any };

/**
 * Caisse ouverte de l'utilisateur (ou null). Gardee sur l'appareil : sans reseau, la derniere situation connue sert.
 * Hors ligne elle est deduite de la file d'envoi : une caisse ouverte sans reseau est utilisable tout de suite, une caisse fermee
 * sans reseau est fermee pour le telephone, et les ventes en attente comptent deja dans les especes attendues.
 */
export function useCashSession() {
  const shop = useShop();
  const offline = useOffline();
  const enabled = shop.can('CASH_SESSIONS', 'view');
  const [loaded, setSession] = useState<CashSession | null | undefined>(undefined);
  const key = `cash.${shop.shopId}`;
  const load = useCallback(async () => {
    try {
      const s = (await shop.call<CashSession | ''>('/api/shop/cash/current')) || null;
      void cacheSet(key, s);
      return s;
    } catch (e) {
      return e instanceof NetworkError ? (await cacheGet<CashSession | null>(key)) ?? null : null;
    }
  }, [shop, key]);
  const reload = useCallback(async () => { if (enabled) setSession(await load()); }, [enabled, load]);
  useEffect(() => {
    let alive = true;
    if (enabled) void load().then((s) => { if (alive) setSession(s); });
    return () => { alive = false; };
  }, [enabled, load]);

  const session = useMemo<CashSession | null | undefined>(() => {
    if (!enabled) return null;
    if (loaded === undefined) return undefined;
    const mine = offline.items.filter((i) => i.shopId === shop.shopId && i.state === 'pending');
    const open = [...mine].reverse().find((i) => i.kind === 'cash-open') as any;
    let base: any = loaded;
    if (!base && open) base = { id: open.body.id, openedAt: open.body.at, openingFloat: open.body.openingFloat ?? 0, salesCount: 0, salesTotal: 0, expectedCash: open.body.openingFloat ?? 0, byMethod: {}, local: true };
    if (!base) return null;
    if (mine.some((i) => i.kind === 'cash-close' && i.path.includes(base.id))) return null;
    const since = new Date(base.openedAt).getTime();
    const byMethod: Record<string, number> = { ...(base.byMethod ?? {}) };
    let count = 0, total = 0, cash = 0;
    for (const i of mine) {
      if (i.kind !== 'sale' || i.createdAt < since) continue;
      count += 1;
      total += Number(i.preview?.total ?? 0);
      for (const p of ((i.body as any)?.payments ?? []) as { method: string; amount: number }[]) {
        byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
        if (p.method === 'CASH') cash += Number(p.amount);
      }
    }
    if (count === 0) return base;
    return { ...base, salesCount: Number(base.salesCount) + count, salesTotal: Number(base.salesTotal) + total, expectedCash: Number(base.expectedCash) + cash, byMethod };
  }, [enabled, loaded, offline.items, shop.shopId]);
  return { session, reload, enabled };
}
