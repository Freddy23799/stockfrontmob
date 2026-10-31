import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ShopLoading } from '@/components/shop-loading';
import { useT } from '@/i18n';

import { api, ApiError, NetworkError, type Meta } from './api';
import { cacheGet, cacheSet } from './cache';
import { setOfflineAllowed } from './offline';

export type MenuItem = { key: string; page: string; icon?: string; label: Tr; feature?: string; section?: string; primary?: boolean; params?: Record<string, unknown> };
export type Tr = string | { fr?: string; en?: string; es?: string };
export type FieldDef = { key: string; type: string; label: Tr; required?: boolean; options?: { value: string; label: Tr }[]; [k: string]: unknown };

export type Workspace = {
  shop: { id: string; name?: string; settings: { name: string; currency: string; [k: string]: unknown }; logo?: unknown };
  pack: { code: string; version: number };
  role: string;
  /** Sous-admin d'un site : droits delegues par le proprietaire (ex. CREATE_EMPLOYEES), tout est refuse par defaut. */
  siteAdmin?: boolean;
  delegation?: string[];
  /** Mode hors ligne de la boutique (actif par defaut ; le proprietaire peut le couper). */
  offlineMode?: boolean;
  features: string[];
  permissions?: Record<string, Record<string, boolean>>;
  config?: Record<string, unknown>;
  manifest: {
    vocab?: Record<string, Record<string, string>>;
    menu: MenuItem[];
    paymentMethods?: string[];
    productFields?: FieldDef[];
    partyFields?: Record<string, FieldDef[]>;
    documentFields?: Record<string, FieldDef[]>;
    units?: { value: string; label: Tr }[];
    staffFields?: FieldDef[];
    productIcon?: string;
    unitPresets?: Record<string, { label: Tr; factor: number }[]>;
    roles?: any[];
    groups?: Record<string, Tr>;
    sections?: Record<string, Tr>;
    [k: string]: unknown;
  };
};

export type ShopValue = {
  shopId: string;
  ws: Workspace;
  config: Record<string, any>;
  currency: string;
  owner: boolean;
  siteAdmin: boolean;
  /** Vrai si le proprietaire a delegue ce droit a ce sous-admin (toujours faux pour les autres comptes). */
  delegated: (code: string) => boolean;
  offline: boolean;
  v: (key: string) => string;
  tr: (value: Tr | undefined | null) => string;
  has: (feature?: string) => boolean;
  can: (feature?: string, action?: 'view' | 'create' | 'update' | 'delete') => boolean;
  money: (n: number | string | null | undefined) => string;
  call: <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
  refresh: () => Promise<void>;
};

const ShopContext = createContext<ShopValue | null>(null);
/** Dernier ETag connu par boutique (hors rendu : on ne lit jamais une ref pendant l'affichage). */
const etags = new Map<string, string | null>();

/**
 * Espace de travail d'une boutique, identique a celui du site : pack metier, fonctionnalites actives, droits de l'utilisateur.
 * Garde sur l'appareil avec son ETag : s'ouvre sans reseau, et se met a jour tout seul quand le pack ou les droits changent.
 */
export function ShopProvider({ shopId, children }: { shopId: string; children: ReactNode }) {
  const { lang, formatMoney, t } = useT();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `ws.${shopId}`;
  // le reglage du proprietaire s'applique des que l'espace est connu (et reste celui de la derniere connexion hors ligne)
  useEffect(() => { if (ws) setOfflineAllowed(ws.offlineMode); }, [ws]);

  const refresh = useCallback(async () => {
    try {
      const res = await api<Meta<Workspace>>('/api/shop/workspace', { shop: shopId, meta: true, headers: etags.get(shopId) ? { 'If-None-Match': etags.get(shopId) as string } : undefined });
      setOffline(false);
      setError(null);
      if (res.status === 304 || !res.data) return;
      etags.set(shopId, res.etag);
      setWs(res.data);
      await cacheSet(key, { etag: res.etag, data: res.data });
    } catch (e) {
      if (e instanceof NetworkError) setOffline(true);
      else setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  }, [shopId, key, t]);

  useEffect(() => {
    let alive = true;
    cacheGet<{ etag: string | null; data: Workspace }>(key).then((cached) => {
      if (!alive) return;
      if (cached) {
        etags.set(shopId, cached.etag);
        setWs(cached.data);
      }
      void refresh();
    });
    return () => { alive = false; };
  }, [key, shopId, refresh]);

  const value = useMemo<ShopValue | null>(() => {
    if (!ws) return null;
    const vocab = ws.manifest.vocab?.[lang] ?? {};
    const fallback = ws.manifest.vocab?.fr ?? {};
    const features = new Set(ws.features);
    const owner = ws.role === 'OWNER';
    const siteAdmin = ws.siteAdmin === true;
    const delegation = new Set(ws.delegation ?? []);
    const currency = ws.shop.settings.currency;
    return {
      shopId, ws, config: ws.config ?? {}, currency, owner, siteAdmin, delegated: (code) => siteAdmin && delegation.has(code), offline,
      v: (k) => vocab[k] ?? fallback[k] ?? k,
      tr: (o) => (o == null ? '' : typeof o === 'string' ? o : o[lang] ?? o.fr ?? ''),
      has: (f) => f == null || features.has(f),
      can: (f, action = 'view') => f == null || (features.has(f) && (owner || ws.permissions?.[f]?.[action] === true)),
      money: (n) => formatMoney(n ?? 0, currency),
      call: (path, options = {}) => api(path, { ...options, shop: shopId }),
      refresh,
    };
  }, [ws, lang, formatMoney, shopId, offline, refresh]);

  if (!value) return <ShopLoading error={error} retry={refresh} />;
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}



/** Comme useShop, mais renvoie null hors d'une boutique (composants partages). */
export const useShopOptional = (): ShopValue | null => useContext(ShopContext);

export function useShop(): ShopValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop doit etre utilise dans <ShopProvider>');
  return ctx;
}
