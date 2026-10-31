import { useCallback, useEffect, useMemo, useState } from 'react';

import { cacheGet, cacheSet } from './cache';
import type { Product, Unit } from './format';
import { useOffline } from './offline';
import { useShop } from './shop';

/**
 * Regle de prix des lignes de vente — COPIE FIDELE de la regle serveur (PriceEngine.java, docs/PACKS.md section "Prix") et du site
 * (stockfrontweb/src/lib/pricing.js). Le serveur recalcule toujours ; ceci sert a l'apercu et a la caisse hors ligne.
 *
 * Candidats : liste (BASE), liste - remise du type de client (CUSTOMER_TYPE), palier de quantite atteint (TIER_QTY), promotion
 * active (PROMO). Le plus bas gagne ; a prix egal : PROMO > TIER_QTY > CUSTOMER_TYPE > BASE. Un prix saisi a la main (MANUAL) passe avant tout.
 * Exception : le PRIX NEGOCIE (NEGOTIATED) d'un client precis remplace tous les candidats, meme plus bas.
 */
export type PriceSource = 'BASE' | 'CUSTOMER_TYPE' | 'TIER_QTY' | 'PROMO' | 'NEGOTIATED' | 'MANUAL';
export type CustomerType = { id: string; code: string; name: string; discountPercent: number | string; active: boolean };
export type SnapBreak = { productId: string; unitId?: string | null; customerType?: string | null; minQty: number | string; price: number | string };
export type SnapPromo = { id: string; name: string; scope: 'PRODUCT' | 'CATEGORY' | 'ALL'; productId?: string | null; categoryId?: string | null; kind: 'PERCENT' | 'FIXED'; value: number | string; customerType?: string | null; startsOn?: string | null; endsOn?: string | null };
export type SnapNegotiated = { partyId: string; productId: string; unitId?: string | null; kind: 'FIXED' | 'PERCENT'; value: number | string; startsOn?: string | null; endsOn?: string | null; note?: string | null };
export type Snapshot = { today: string; customerTypes: CustomerType[]; breaks: SnapBreak[]; promotions: SnapPromo[]; categories: { id: string; parentId: string }[]; negotiated?: SnapNegotiated[] };
export type PriceResult = { price: number; source: PriceSource; label: string | null; listPrice: number };

export const EMPTY_PRICING: Snapshot = { today: '', customerTypes: [], breaks: [], promotions: [], categories: [], negotiated: [] };
const RANK: Record<string, number> = { NEGOTIATED: 5, PROMO: 4, TIER_QTY: 3, CUSTOMER_TYPE: 2, BASE: 1 };
const round2 = (v: number) => Math.round(Number(v.toFixed(6)) * 100 + 1e-9) / 100;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function chainOf(snap: Snapshot, categoryId?: string | null): string[] {
  const parent = new Map(snap.categories.map((c) => [c.id, c.parentId]));
  const out: string[] = [];
  let c = categoryId ?? undefined;
  while (c && !out.includes(c)) { out.push(c); c = parent.get(c); }
  return out;
}
const specificity = (p: SnapPromo | null) => (p ? ({ PRODUCT: 3, CATEGORY: 2, ALL: 1 }[p.scope]) : 0);

/** unit : conditionnement vendu (ou null = unite de base) ; qty : quantite dans l'unite vendue. Prix renvoye par unite VENDUE. */
export function resolvePrice(snap: Snapshot, product: Product, unit: Unit | null, qty: number, customerType: string | null | undefined, today = iso(new Date()), partyId: string | null = null): PriceResult {
  const factor = unit ? Number(unit.factor) : 1;
  const sale = Number(product.salePrice);
  const list = !unit ? round2(sale) : unit.fixedPrice ? round2(Number(unit.price)) : round2(sale * factor);
  let best: PriceResult = { price: list, source: 'BASE', label: null, listPrice: list };
  const better = (c: PriceResult) => { if (c.price < best.price || (c.price === best.price && RANK[c.source] > RANK[best.source])) best = c; };
  const ct = customerType || null;
  const type = ct ? snap.customerTypes.find((x) => x.code === ct && x.active !== false) : undefined;
  if (type && Number(type.discountPercent) > 0) better({ price: round2((list * (100 - Number(type.discountPercent))) / 100), source: 'CUSTOMER_TYPE', label: type.name, listPrice: list });

  const unitId = unit?.id ?? null;
  let tier: SnapBreak | null = null;
  for (const b of snap.breaks) {
    if (b.productId !== product.id || (b.unitId ?? null) !== unitId) continue;
    if (b.customerType && b.customerType !== ct) continue;
    if (Number(b.minQty) > qty) continue;
    if (!tier || Number(b.price) < Number(tier.price) || (Number(b.price) === Number(tier.price) && Number(b.minQty) > Number(tier.minQty))) tier = b;
  }
  if (tier) better({ price: round2(Number(tier.price)), source: 'TIER_QTY', label: String(Number(tier.minQty)), listPrice: list });

  const chain = chainOf(snap, product.categoryId);
  let win: SnapPromo | null = null;
  let winPrice: number | null = null;
  for (const p of snap.promotions) {
    if (p.startsOn && today < p.startsOn) continue;
    if (p.endsOn && today > p.endsOn) continue;
    if (p.customerType && p.customerType !== ct) continue;
    if (p.scope === 'PRODUCT' && p.productId !== product.id) continue;
    if (p.scope === 'CATEGORY' && !(p.categoryId && chain.includes(p.categoryId))) continue;
    const price = p.kind === 'PERCENT' ? round2((list * (100 - Number(p.value))) / 100) : round2(Number(p.value) * factor);
    if (winPrice === null || price < winPrice || (price === winPrice && specificity(p) > specificity(win))) { win = p; winPrice = price; }
  }
  if (win && winPrice !== null) better({ price: winPrice, source: 'PROMO', label: win.name, listPrice: list });

  if (partyId) {
    // la ligne du conditionnement exact passe avant celle de l'unite de base
    let deal: SnapNegotiated | null = null;
    for (const n of snap.negotiated ?? []) {
      if (n.partyId !== partyId || n.productId !== product.id) continue;
      if (n.startsOn && today < n.startsOn) continue;
      if (n.endsOn && today > n.endsOn) continue;
      if (n.unitId && n.unitId === unitId) { deal = n; break; }
      if (!n.unitId) deal = n;
    }
    if (deal) {
      const price = deal.kind === 'PERCENT' ? round2((list * (100 - Number(deal.value))) / 100) : round2(deal.unitId ? Number(deal.value) : Number(deal.value) * factor);
      return { price, source: 'NEGOTIATED', label: deal.note ?? null, listPrice: list };
    }
  }
  return best;
}

/**
 * Regles de prix gardees sur l'appareil : la caisse applique la meme regle que le serveur meme sans reseau.
 * Rechargees a l'ouverture et au retour du reseau. Aucun appel si la fonctionnalite PRICING_RULES est off.
 */
export function usePricing() {
  const shop = useShop();
  const offline = useOffline();
  const enabled = shop.has('PRICING_RULES');
  const key = `pricing.${shop.shopId}`;
  // la copie est rangee avec sa cle : celle d'une autre boutique n'est jamais utilisee
  const [store, setStore] = useState<{ key: string; snap: Snapshot }>({ key: '', snap: EMPTY_PRICING });
  const snap = enabled && store.key === key ? store.snap : EMPTY_PRICING;

  const fetchSnap = useCallback(() => shop.call<Snapshot>('/api/shop/pricing/snapshot').then((s) => { void cacheSet(key, s); return s; }).catch(() => null), [shop, key]);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const s = await fetchSnap();
    if (s) setStore({ key, snap: s });
  }, [enabled, fetchSnap, key]);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    void cacheGet<Snapshot>(key).then((c) => { if (alive && c) setStore({ key, snap: c }); });
    return () => { alive = false; };
  }, [key, enabled]);
  // ouverture et retour du reseau : copie fraiche ; hors ligne ou droit manquant, on garde la copie locale
  useEffect(() => {
    if (!enabled || !offline.online) return undefined;
    let alive = true;
    void fetchSnap().then((s) => { if (alive && s) setStore({ key, snap: s }); });
    return () => { alive = false; };
  }, [enabled, offline.online, key, fetchSnap]);

  return useMemo(() => ({
    active: enabled,
    snapshot: snap,
    types: snap.customerTypes,
    refresh,
    resolve: (product: Product, unit: Unit | null, qty: number, customerType?: string | null, partyId?: string | null) => resolvePrice(snap, product, unit, qty, customerType, undefined, partyId ?? null),
  }), [enabled, snap, refresh]);
}
