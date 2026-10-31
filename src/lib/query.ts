import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, NetworkError } from './api';
import { cacheGet, cachePeek, cacheSet } from './cache';
import { onSynced } from './offline';
import { useShop } from './shop';

export type Query<T> = {
  data: T | null;
  /** Premiere charge sans aucune donnee en cache. */
  loading: boolean;
  /** Rechargement en cours (tirer pour rafraichir). */
  refreshing: boolean;
  /** Les donnees affichees viennent de l'appareil, le serveur n'a pas repondu. */
  stale: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * Lecture "d'abord l'appareil, puis le serveur" : la derniere reponse connue s'affiche tout de suite (meme sans reseau),
 * puis elle est remplacee des que le serveur repond. Se recharge au retour sur l'ecran et apres l'envoi de la file hors ligne.
 * `path` = null : pas de requete (ex. tant qu'une recherche est vide).
 */
export function useQuery<T>(path: string | null, { debounce = 0 }: { debounce?: number } = {}): Query<T> {
  const shop = useShop();
  const key = path ? `q.${shop.shopId}.${path}` : null;
  // ecran deja vu : sa derniere reponse s'affiche des le premier rendu (pas de squelette), le serveur corrige ensuite
  const [state, setState] = useState<{ data: T | null; loading: boolean; refreshing: boolean; stale: boolean; error: string | null }>(() => {
    const hot = key ? cachePeek<T>(key) : null;
    return { data: hot, loading: path != null && hot == null, refreshing: false, stale: hot != null, error: null };
  });
  const ticket = useRef(0);

  const load = useCallback(async (manual = false) => {
    if (!path || !key) return;
    const mine = ++ticket.current;
    if (manual) setState((s) => ({ ...s, refreshing: true }));
    try {
      const data = await shop.call<T>(path);
      if (mine !== ticket.current) return;
      setState({ data, loading: false, refreshing: false, stale: false, error: null });
      void cacheSet(key, data);
    } catch (e) {
      if (mine !== ticket.current) return;
      const offline = e instanceof NetworkError;
      setState((s) => ({ ...s, loading: false, refreshing: false, stale: offline && s.data != null, error: offline && s.data != null ? null : e instanceof ApiError ? e.message : offline ? 'network' : 'error' }));
    }
  }, [path, key, shop]);

  // change de requete : on montre tout de suite ce que l'appareil a deja, puis on interroge le serveur
  useEffect(() => {
    if (!path || !key) {
      setState({ data: null, loading: false, refreshing: false, stale: false, error: null });
      return undefined;
    }
    let alive = true;
    const hot = cachePeek<T>(key);
    setState((s) => (hot != null ? { ...s, data: hot, loading: false, stale: true, error: null } : { ...s, loading: s.data == null, error: null }));
    cacheGet<T>(key).then((cached) => {
      if (alive && cached != null) setState((s) => (s.data == null ? { ...s, data: cached, loading: false, stale: true } : s));
    });
    const timer = setTimeout(() => void load(), debounce);
    return () => { alive = false; clearTimeout(timer); };
  }, [path, key, debounce]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { if (path && state.data != null) void load(); }, [path])); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onSynced(() => void load()), [load]);

  return { ...state, reload: () => load(true) };
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

export type Page<T> = { items: T[]; total: number; page: number; size: number };

export type Infinite<T> = {
  items: T[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  stale: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => Promise<void>;
};

/**
 * Liste a defilement infini : la premiere page vient d'abord de l'appareil (rapide, utilisable hors ligne), puis du serveur ;
 * les suivantes se chargent quand on arrive en bas. Les filtres (recherche, categorie...) font repartir de la page 1.
 */
export function useInfinite<T>(base: string, params: Record<string, string | number | boolean | undefined | null>, { size = 30, debounce = 250, enabled = true }: { size?: number; debounce?: number; enabled?: boolean } = {}): Infinite<T> {
  const shop = useShop();
  const [state, setState] = useState<{ items: T[]; total: number; page: number; loading: boolean; loadingMore: boolean; refreshing: boolean; stale: boolean; error: string | null }>({ items: [], total: 0, page: 0, loading: enabled, loadingMore: false, refreshing: false, stale: false, error: null });
  const ticket = useRef(0);
  const query = JSON.stringify(params);
  const path = (page: number) => `${base}${qs({ ...JSON.parse(query), size, page })}`;
  const key = `l.${shop.shopId}.${path(0)}`;

  const fetchPage = useCallback(async (page: number, mode: 'first' | 'more' | 'refresh') => {
    const mine = ++ticket.current;
    if (mode === 'more') setState((s) => ({ ...s, loadingMore: true }));
    if (mode === 'refresh') setState((s) => ({ ...s, refreshing: true }));
    try {
      const res = await shop.call<Page<T>>(path(page));
      if (mine !== ticket.current) return;
      setState((s) => ({ ...s, items: page === 0 ? res.items : [...s.items, ...res.items], total: res.total, page, loading: false, loadingMore: false, refreshing: false, stale: false, error: null }));
      if (page === 0) void cacheSet(key, res);
    } catch (e) {
      if (mine !== ticket.current) return;
      const off = e instanceof NetworkError;
      setState((s) => ({ ...s, loading: false, loadingMore: false, refreshing: false, stale: off && s.items.length > 0, error: off && s.items.length > 0 ? null : e instanceof ApiError ? e.message : off ? 'network' : 'error' }));
    }
  }, [key, shop]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: s.items.length === 0, error: null }));
    cacheGet<Page<T>>(key).then((c) => { if (alive && c) setState((s) => (s.items.length === 0 ? { ...s, items: c.items, total: c.total, loading: false, stale: true } : s)); });
    const timer = setTimeout(() => void fetchPage(0, 'first'), debounce);
    return () => { alive = false; clearTimeout(timer); };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { if (enabled && state.items.length > 0) void fetchPage(0, 'first'); }, [key, enabled])); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onSynced(() => void fetchPage(0, 'first')), [fetchPage]);

  return {
    ...state,
    hasMore: state.items.length < state.total,
    loadMore: () => { if (!state.loading && !state.loadingMore && state.items.length < state.total) void fetchPage(state.page + 1, 'more'); },
    reload: () => fetchPage(0, 'refresh'),
  };
}
