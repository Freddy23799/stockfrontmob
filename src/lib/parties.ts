import { useCallback, useEffect, useRef, useState } from 'react';

import type { Party } from '@/components/party-picker';
import { cacheGet, cacheSet } from './cache';
import { onSynced } from './offline';
import { qs, type Page } from './query';
import { useShop } from './shop';

/**
 * Repertoire des tiers (clients, fournisseurs, assureurs) COMPLET sur le telephone : on choisit un client, on vend a credit ou avec
 * assurance sans reseau, meme avec des milliers de clients (avant : les 100 premiers seulement). La copie locale s'affiche tout de
 * suite, puis se rafraichit page par page en arriere-plan, au retour du reseau et apres l'envoi de la file.
 */
const PAGE = 100;
const MAX_PAGES = 200;   // 20 000 contacts au plus
const byName = (a: Party, b: Party) => a.name.localeCompare(b.name);

export function useParties(role: string, enabled = true): { parties: Party[]; reload: () => Promise<void> } {
  const shop = useShop();
  const key = `parties.${shop.shopId}.${role}`;
  // la liste est rangee avec sa cle : celle d'une autre boutique n'est jamais montree
  const [store, setStore] = useState<{ key: string; list: Party[] }>({ key: '', list: [] });
  const parties = store.key === key ? store.list : [];
  const setParties = useCallback((next: Party[] | ((cur: Party[]) => Party[])) => setStore((s) => ({ key, list: typeof next === 'function' ? next(s.key === key ? s.list : []) : next })), [key]);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const all: Party[] = [];
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await shop.call<Page<Party>>(`/api/shop/parties${qs({ role, size: PAGE, page, sort: 'name' })}`);
        all.push(...res.items);
        if (!alive.current) return;
        if (page === 0) setParties((cur) => (cur.length === 0 ? [...all].sort(byName) : cur));   // premiere page : utilisable tout de suite
        if (all.length >= res.total || res.items.length === 0) break;
      }
      if (!alive.current) return;
      all.sort(byName);
      setParties(all);
      void cacheSet(key, all);
    } catch {
      // hors ligne ou droit manquant : on garde la copie locale
    }
  }, [enabled, key, role, shop, setParties]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return undefined;
    // copie locale d'abord, puis le serveur : tout se passe dans des taches asynchrones
    const timer = setTimeout(() => {
      void cacheGet<Party[]>(key).then((c) => { if (alive.current && c) setParties((cur) => (cur.length === 0 ? c : cur)); });
      void reload();
    }, 0);
    return () => { alive.current = false; clearTimeout(timer); };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onSynced(() => void reload()), [reload]);
  return { parties, reload };
}
