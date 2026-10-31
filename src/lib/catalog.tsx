import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { NetworkError } from './api';
import { bigGet, bigSetMany } from './bigcache';
import { CatalogIndex, type BarcodeHit } from './catalog-index';
import { cacheGet, cacheRemove } from './cache';
import { type Product } from './format';
import { onSynced } from './offline';
import { useShop } from './shop';

type CatalogValue = {
  items: Product[];
  ready: boolean;
  syncing: boolean;
  /** Date de la derniere synchronisation du catalogue (affichee : "Catalogue du 12 mai"). */
  syncedAt: number | null;
  search: (query: string, limit?: number) => Product[];
  byBarcode: (code: string) => BarcodeHit | undefined;
  refresh: (opts?: { full?: boolean }) => Promise<void>;
  /** Apres une vente enregistree hors ligne : retire la quantite vendue du stock affiche. */
  consume: (lines: { productId: string; quantity: number }[]) => void;
  /** Produit cree ou modifie hors ligne : visible et vendable tout de suite ; la synchro le remplacera par la version du serveur. */
  upsertLocal: (p: Product) => void;
};

type Meta = { at: number | null; since: string | null; fullAt: number | null; chunks: number; count?: number };
type Delta = { items: Product[]; removedIds: string[]; next: string | null; more: boolean; serverTime: string; activeCount?: number | null };

const CatalogContext = createContext<CatalogValue | null>(null);
const CHUNK = 1000;
const FULL_EVERY = 7 * 24 * 3600 * 1000;   // copie complete chaque semaine ; entre-temps deltas + controle du nombre d'articles
const chunkKey = (key: string, n: number) => `${key}.c${String(n).padStart(4, '0')}`;

/**
 * Copie du catalogue sur l'appareil : la caisse cherche et vend meme sans reseau, et la recherche est instantanee.
 * Premier lancement : telechargement par paquets de 1 000 (la caisse sert des le premier paquet). Ensuite : seulement ce qui a change
 * depuis la derniere synchro (delta), copie complete chaque semaine (ou des que le nombre d'articles differe de celui du serveur). Stockage en blocs (une vente ne reecrit qu'un bloc).
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const shop = useShop();
  const key = `catalog.${shop.shopId}`;
  const [items, setItems] = useState<Product[]>([]);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const busy = useRef(false);
  const fullRef = useRef<(() => Promise<void>) | null>(null);
  const index = useRef(new CatalogIndex());
  const meta = useRef<Meta>({ at: null, since: null, fullAt: null, chunks: 0 });
  const dirty = useRef(new Set<number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabled = shop.has('PRODUCTS') && shop.can('PRODUCTS', 'view');

  const publish = useCallback(() => setItems(index.current.items()), []);

  const saveAll = useCallback(async (k: string) => {
    const list = index.current.items();
    const n = Math.ceil(list.length / CHUNK);
    const entries: [string, unknown][] = [];
    for (let i = 0; i < n; i++) entries.push([chunkKey(k, i), list.slice(i * CHUNK, (i + 1) * CHUNK)]);
    const extra: string[] = [];
    for (let i = n; i < meta.current.chunks; i++) extra.push(chunkKey(k, i));
    meta.current = { ...meta.current, chunks: n, count: list.length };
    entries.push([k, meta.current]);
    await bigSetMany(entries, extra);
    dirty.current = new Set();
  }, []);

  const saveDirty = useCallback(async (k: string, positions: number[]) => {
    const list = index.current.items();
    const blocks = new Set(positions.map((p) => Math.floor(p / CHUNK)));
    const entries: [string, unknown][] = [...blocks].map((b) => [chunkKey(k, b), list.slice(b * CHUNK, (b + 1) * CHUNK)]);
    meta.current = { ...meta.current, chunks: Math.ceil(list.length / CHUNK), count: list.length };
    entries.push([k, meta.current]);
    await bigSetMany(entries);
  }, []);

  const refresh = useCallback(async ({ full = false }: { full?: boolean } = {}) => {
    if (!enabled || busy.current) return;
    busy.current = true;
    setSyncing(true);
    const mine = key;
    try {
      const idx = index.current;
      const doFull = full || !meta.current.since || idx.size === 0 || Date.now() - (meta.current.fullAt ?? 0) > FULL_EVERY;
      const since = doFull ? null : meta.current.since;
      const fresh: Product[] = [];
      const touched: string[] = [];
      let removed: string[] = [];
      let after: string | null = null;
      let serverTime: string | null = null;
      let changed = 0;
      let serverCount: number | null = null;
      for (let page = 0; page < 500; page++) {
        const qs = `size=${CHUNK}${since ? `&since=${encodeURIComponent(since)}` : ''}${after ? `&after=${after}` : ''}`;
        const res: Delta = await shop.call<Delta>(`/api/shop/catalog/delta?${qs}`);
        if (page === 0) serverTime = res.serverTime;
        removed = removed.concat(res.removedIds ?? []);
        if (doFull) {
          fresh.push(...res.items.filter((p) => p.isActive));
          if (page === 0 && idx.size === 0) { await idx.build(fresh); publish(); setReady(true); }
        } else {
          for (const p of res.items) { if (p.isActive) idx.upsert(p); else removed.push(p.id); touched.push(p.id); changed++; }
        }
        if (res.activeCount != null) serverCount = res.activeCount;
        after = res.next;
        if (!res.more) break;
      }
      if (doFull) {
        await idx.build(fresh);
        meta.current = { at: Date.now(), since: serverTime, fullAt: Date.now(), chunks: meta.current.chunks };
        publish();
        setSyncedAt(meta.current.at);
        await saveAll(mine);
      } else {
        const gone = idx.remove(removed);
        meta.current = { ...meta.current, at: Date.now(), since: serverTime };
        setSyncedAt(meta.current.at);
        if (changed > 0 || gone) publish();
        if (gone) await saveAll(mine);
        else await saveDirty(mine, touched.map((id) => idx.pos.get(id)).filter((x): x is number => x !== undefined));
        // derive detectee (suppression manquee...) : une copie complete repare tout
        if (serverCount != null && serverCount !== idx.size) { busy.current = false; queueMicrotask(() => void fullRef.current?.()); }
      }
    } catch (e) {
      if (!(e instanceof NetworkError)) { /* droit manquant ou erreur serveur : on garde la copie locale */ }
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [enabled, shop, key, publish, saveAll, saveDirty]);

  useEffect(() => {
    let alive = true;
    index.current = new CatalogIndex();
    meta.current = { at: null, since: null, fullAt: null, chunks: 0 };
    dirty.current = new Set();
    (async () => {
      let m = await bigGet<Meta & { items?: Product[] }>(key);
      let list: Product[] = [];
      if (m && Array.isArray(m.items)) {                                    // ancien format : un seul gros fichier / une seule valeur
        list = m.items; m = { at: m.at, since: null, fullAt: null, chunks: 0 };
      } else if (m) {
        const blocks = await Promise.all(Array.from({ length: m.chunks }, (_, i) => bigGet<Product[]>(chunkKey(key, i))));
        list = blocks.flatMap((b) => b ?? []);
      } else {
        const legacy = await cacheGet<{ at: number; items: Product[] }>(key);   // tout premier format (cache.ts)
        if (legacy?.items) { list = legacy.items; m = { at: legacy.at, since: null, fullAt: null, chunks: 0 }; void cacheRemove(key); }
      }
      if (!alive) return;
      if (m && list.length > 0) {
        await index.current.build(list);
        if (!alive) return;
        meta.current = { at: m.at, since: m.since ?? null, fullAt: m.fullAt ?? null, chunks: m.chunks ?? 0 };
        publish(); setSyncedAt(m.at);
      }
      setReady(true);
      void refresh();
    })();
    return () => { alive = false; if (timer.current) clearTimeout(timer.current); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fullRef.current = () => refresh({ full: true }); }, [refresh]);
  useEffect(() => onSynced(() => void refresh()), [refresh]);

  const value = useMemo<CatalogValue>(() => ({
    items, ready, syncing, syncedAt, refresh,
    search: (query, limit = 40) => index.current.search(query, limit),
    byBarcode: (code) => index.current.byBarcode(code),
    upsertLocal: (p) => {
      const idx = index.current;
      idx.upsert(p);
      dirty.current.add(idx.pos.get(p.id)!);
      publish();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { const pos = [...dirty.current]; dirty.current = new Set(); void saveDirty(key, pos); }, 1500);
    },
    consume: (lines) => {
      const idx = index.current;
      let any = false;
      for (const l of lines) {
        const p = idx.get(l.productId);
        if (!p || !p.trackStock) continue;
        idx.upsert({ ...p, stock: Number(p.stock) - l.quantity });
        dirty.current.add(idx.pos.get(p.id)!);
        any = true;
      }
      if (!any) return;
      publish();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { const pos = [...dirty.current]; dirty.current = new Set(); void saveDirty(key, pos); }, 1500);
    },
  }), [items, ready, syncing, syncedAt, refresh, publish, saveDirty, key]);

  // sonde de mesure (web, ?perf=1 ou reglage local) : lit l'etat du catalogue sans passer par l'interface
  useEffect(() => { try { if (typeof localStorage !== 'undefined' && localStorage.getItem('vylaxo.perf') === '1') (globalThis as any).__catalog = value; } catch { /* ignore */ } }, [value]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog doit etre utilise dans <CatalogProvider>');
  return ctx;
}
