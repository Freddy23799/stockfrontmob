import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiError, NetworkError } from './api';
import { cacheGet, cacheSet } from './cache';

export type OrgQuery<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  /** Les donnees affichees viennent de l'appareil : le serveur n'a pas repondu. */
  stale: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * Comme useQuery, mais pour les ecrans de l'enseigne, qui vivent hors d'une boutique (pas de ShopProvider) :
 * la derniere reponse connue s'affiche tout de suite, puis le serveur la remplace. Se recharge au retour sur l'ecran.
 */
export function useOrgQuery<T>(path: string | null): OrgQuery<T> {
  const key = path ? `org.${path}` : null;
  const [state, setState] = useState<{ data: T | null; loading: boolean; refreshing: boolean; stale: boolean; error: string | null }>({ data: null, loading: path != null, refreshing: false, stale: false, error: null });
  const ticket = useRef(0);

  const load = useCallback(async (manual = false) => {
    if (!path || !key) return;
    const mine = ++ticket.current;
    if (manual) setState((s) => ({ ...s, refreshing: true }));
    try {
      const data = await api<T>(path);
      if (mine !== ticket.current) return;
      setState({ data, loading: false, refreshing: false, stale: false, error: null });
      void cacheSet(key, data);
    } catch (e) {
      if (mine !== ticket.current) return;
      const offline = e instanceof NetworkError;
      setState((s) => ({ ...s, loading: false, refreshing: false, stale: offline && s.data != null, error: offline && s.data != null ? null : e instanceof ApiError ? e.message : offline ? 'network' : 'error' }));
    }
  }, [path, key]);

  useEffect(() => {
    if (!path || !key) return undefined;
    let alive = true;
    cacheGet<T>(key).then((cached) => {
      if (alive && cached != null) setState((s) => (s.data == null ? { ...s, data: cached, loading: false, stale: true } : s));
    });
    void load();
    return () => { alive = false; };
  }, [path, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { if (path && state.data != null) void load(); }, [path])); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, reload: () => load(true) };
}

export type Organization = { id: string; name: string; siteCount: number };

export type OrgSite = {
  id: string; name: string; city?: string; country?: string; status: string; billingStatus: string;
  salesToday: number; sales30Days: number; margin30Days: number; salesCount30Days: number;
  lowStock: number; outOfStock: number; negativeStock: number; activeAdmins: number; lastSaleAt?: string | null;
};

export type FeatureRequest = {
  id: string; shopId: string; shopName: string; featureCode: string; featureName: string; note?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; requesterName: string; createdAt: string; decidedAt?: string | null; decisionNote?: string | null;
};

export type OrgDashboard = {
  organizationId: string; organizationName: string; currency: string;
  totals: { salesToday: number; sales30Days: number; margin30Days: number; salesCount30Days: number; sites: number; activeSites: number; lowStock: number; outOfStock: number; negativeStock: number; pendingRequests: number };
  sites: OrgSite[];
  pendingRequests: FeatureRequest[];
  activity: { shopId: string; shopName: string; action: string; actorName: string; at?: string | null }[];
};

export type CatalogProduct = {
  id: string; name: string; kind: 'PRODUCT' | 'SERVICE'; sku?: string | null; barcode?: string | null; description?: string | null; unit: string;
  costPrice: number; salePrice: number; trackStock: boolean; minStockAlert?: number | null; active: boolean;
  sites: { shopId: string; shopName: string; localProductId: string }[];
};

export type OrgInfinite<T> = {
  items: T[]; total: number; loading: boolean; loadingMore: boolean; stale: boolean; error: string | null; moreError: boolean;
  hasMore: boolean; loadMore: () => void; reload: () => Promise<void>;
};

/**
 * Liste de l'enseigne chargee par pages (comme useInfinite, mais hors d'une boutique) : la premiere page vient d'abord de l'appareil,
 * les suivantes se chargent quand on approche du bas. Un changement de recherche repart de la premiere page ; une reponse perimee
 * (frappe rapide, defilement tres vite) est ignoree.
 */
export function useOrgInfinite<T>(base: string | null, params: Record<string, string | number | undefined>, { size = 24 }: { size?: number } = {}): OrgInfinite<T> {
  const [state, setState] = useState<{ items: T[]; total: number; page: number; loading: boolean; loadingMore: boolean; stale: boolean; error: string | null; moreError: boolean }>({ items: [], total: 0, page: 0, loading: base != null, loadingMore: false, stale: false, error: null, moreError: false });
  const ticket = useRef(0);
  const busy = useRef(false);
  const query = JSON.stringify(params);
  const url = (page: number) => {
    const q = new URLSearchParams();
    Object.entries({ ...JSON.parse(query), size, page }).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, String(v)); });
    return `${base}?${q.toString()}`;
  };
  const key = base ? `orgl.${url(0)}` : null;

  const first = useCallback(async (manual = false) => {
    if (!base || !key) return;
    const mine = ++ticket.current;
    busy.current = true;
    if (manual) setState((s) => ({ ...s, loading: s.items.length === 0 }));
    try {
      const res = await api<{ items: T[]; total: number }>(url(0));
      if (mine !== ticket.current) return;
      setState({ items: res.items, total: res.total, page: 0, loading: false, loadingMore: false, stale: false, error: null, moreError: false });
      void cacheSet(key, res);
    } catch (e) {
      if (mine !== ticket.current) return;
      const offline = e instanceof NetworkError;
      setState((s) => ({ ...s, loading: false, loadingMore: false, stale: offline && s.items.length > 0, error: offline && s.items.length > 0 ? null : e instanceof ApiError ? e.message : offline ? 'network' : 'error' }));
    } finally {
      if (mine === ticket.current) busy.current = false;
    }
  }, [base, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!base || !key) return undefined;
    let alive = true;
    setState((s) => ({ ...s, items: [], total: 0, page: 0, loading: true, error: null, moreError: false }));
    cacheGet<{ items: T[]; total: number }>(key).then((c) => { if (alive && c) setState((s) => (s.items.length === 0 ? { ...s, items: c.items, total: c.total, loading: false, stale: true } : s)); });
    const timer = setTimeout(() => void first(), 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { if (base && state.items.length > 0) void first(); }, [key])); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (!base || busy.current || state.items.length >= state.total) return;
    const mine = ++ticket.current;
    busy.current = true;
    setState((s) => ({ ...s, loadingMore: true, moreError: false }));
    try {
      const next = state.page + 1;
      const res = await api<{ items: T[]; total: number }>(url(next));
      if (mine === ticket.current) setState((s) => ({ ...s, items: [...s.items, ...res.items], total: res.total, page: next, loadingMore: false }));
    } catch {
      if (mine === ticket.current) setState((s) => ({ ...s, loadingMore: false, moreError: true }));
    } finally {
      if (mine === ticket.current) busy.current = false;
    }
  }, [base, key, state.page, state.items.length, state.total]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, hasMore: state.items.length < state.total, loadMore: () => void loadMore(), reload: () => first(true) };
}
