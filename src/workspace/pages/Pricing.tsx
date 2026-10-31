import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { SelectField } from '@/components/dynamic-fields';
import { ProductPicker } from '@/components/product-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Chips, Empty, ErrorNote, Hint, NumberBox, Screen, Sheet, Skeleton, Switch, TextBox, useToast, type Tone } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDate, num, uuid, type Product } from '@/lib/format';
import { ListFooter } from '@/components/list-footer';
import { useProgressive } from '@/lib/list';
import { useQuery } from '@/lib/query';
import { baseUnitName } from '@/lib/units';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const BASE = '/api/shop/pricing';
type CType = { id: string; code: string; name: string; discountPercent: number | string; active: boolean };
type Promo = { id: string; name: string; scope: string; productId?: string | null; productName?: string | null; categoryId?: string | null; categoryName?: string | null; kind: string; value: number | string; customerType?: string | null; startsOn?: string | null; endsOn?: string | null; active: boolean; status: string };
type Brk = { id: string; productId: string; productName: string; unitId?: string | null; unitLabel?: string | null; customerType?: string | null; minQty: number | string; price: number | string; active: boolean };
const TONE: Record<string, Tone> = { RUNNING: 'success', SCHEDULED: 'info', ENDED: 'neutral', OFF: 'warning' };
const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Prix et promotions : promotions planifiees, paliers de quantite (gros/detail) et types de client. */
export default function Pricing({ tab }: PageProps) {
  const { t } = useT();
  const [view, setView] = useState('promos');
  const moreRef = useRef<(() => void) | null>(null);   // la vue affichee y inscrit sa fonction « charger la suite »
  const register = useCallback((fn: (() => void) | null) => { moreRef.current = fn; }, []);
  const types = useQuery<CType[]>(`${BASE}/customer-types`);
  const activeTypes = (types.data ?? []).filter((x) => x.active);
  return (
    <Screen tabs={tab} title={t('price.title')} onEndReached={() => moreRef.current?.()}>
      <Hint icon="circle-info">{t('price.intro')}</Hint>
      <Chips value={view} onChange={setView} options={[{ value: 'promos', label: t('price.tab.promos') }, { value: 'breaks', label: t('price.tab.breaks') }, { value: 'types', label: t('price.tab.types') }]} />
      {view === 'promos' ? <Promotions types={activeTypes} register={register} /> : null}
      {view === 'breaks' ? <Breaks types={activeTypes} register={register} /> : null}
      {view === 'types' ? <Types query={types} /> : null}
    
    </Screen>
  );
}

function Promotions({ types, register }: { types: CType[]; register: (fn: (() => void) | null) => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const list = useQuery<Promo[]>(`${BASE}/promotions`);
  const all = useMemo(() => list.data ?? [], [list.data]);
  const progressive = useProgressive(all, 15);   // 15 promotions a la fois, la suite au defilement
  useEffect(() => { register(progressive.loadMore); return () => register(null); });
  const [editing, setEditing] = useState<Promo | 'new' | null>(null);
  const dates = (p: Promo) => (p.startsOn && p.endsOn ? t('promo.fromTo', { from: formatDate(p.startsOn, lang), to: formatDate(p.endsOn, lang) })
    : p.startsOn ? t('promo.since', { from: formatDate(p.startsOn, lang) }) : p.endsOn ? t('promo.until', { to: formatDate(p.endsOn, lang) }) : t('promo.noDates'));
  return (
    <View style={{ gap: 8 }}>
      {shop.can('PRICING_RULES', 'create') ? <Btn icon="plus" title={t('promo.new')} onPress={() => setEditing('new')} /> : null}
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? <Skeleton rows={3} height={64} /> : all.length === 0 ? <Empty icon="gift" title={t('promo.empty')} text={t('promo.emptyText')} /> : progressive.visible.map((p) => (
        <Pressable key={p.id} onPress={() => setEditing(p)} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: th.backgroundElement, opacity: pressed ? 0.75 : p.active && p.status !== 'ENDED' ? 1 : 0.65 }]}>
          <View style={s.flex}>
            <ThemedText type="smallBold" numberOfLines={1}>{p.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }} numberOfLines={2}>
              {[p.scope === 'PRODUCT' ? p.productName : p.scope === 'CATEGORY' ? p.categoryName : t('promo.target.ALL'), dates(p), p.customerType].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <ThemedText type="smallBold">{p.kind === 'PERCENT' ? t('promo.summary.PERCENT', { value: Number(p.value) }) : t('promo.summary.FIXED', { value: shop.money(p.value) })}</ThemedText>
            <Badge tone={TONE[p.status]}>{t(`promo.status.${p.status}`)}</Badge>
          </View>
        </Pressable>
      ))}
      <ListFooter shown={progressive.visible.length} total={progressive.total} hasMore={progressive.hasMore} onMore={progressive.loadMore} />
      {editing ? <PromoSheet promo={editing === 'new' ? null : editing} types={types} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} /> : null}
    </View>
  );
}

function PromoSheet({ promo, types, onClose, onSaved }: { promo: Promo | null; types: CType[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const id = useRef(promo?.id ?? uuid());
  const categories = useQuery<{ id: string; name: string }[]>('/api/shop/categories');
  const [product, setProduct] = useState<Product | null>(null);
  const [f, setF] = useState({ name: promo?.name ?? '', scope: promo?.scope ?? 'PRODUCT', productId: promo?.productId ?? '', categoryId: promo?.categoryId ?? '', kind: promo?.kind ?? 'PERCENT', value: promo ? String(Number(promo.value)) : '', customerType: promo?.customerType ?? '', startsOn: promo?.startsOn ?? '', endsOn: promo?.endsOn ?? '', active: promo?.active ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const valid = f.name.trim() && f.value !== '' && num(f.value) >= 0 && (f.scope !== 'PRODUCT' || f.productId) && (f.scope !== 'CATEGORY' || f.categoryId) && !(f.startsOn && f.endsOn && f.endsOn < f.startsOn);
  async function submit() {
    setBusy(true); setError(null);
    const body = { id: id.current, name: f.name.trim(), scope: f.scope, productId: f.scope === 'PRODUCT' ? f.productId : null, categoryId: f.scope === 'CATEGORY' ? f.categoryId : null, kind: f.kind, value: num(f.value), customerType: f.customerType || null, startsOn: f.startsOn || null, endsOn: f.endsOn || null, active: f.active };
    try { await shop.call(promo ? `${BASE}/promotions/${promo.id}` : `${BASE}/promotions`, { method: promo ? 'PUT' : 'POST', body }); toast(t('ws.saved')); onSaved(); } catch (e) { setError(msg(e, t('common.network'))); setBusy(false); }
  }
  async function remove() {
    if (!(await confirmAction(t('promo.deleteTitle'), t('promo.deleteText'), t('ws.delete'), t('common.cancel')))) return;
    try { await shop.call(`${BASE}/promotions/${promo!.id}`, { method: 'DELETE' }); toast(t('ws.deleted')); onSaved(); } catch (e) { setError(msg(e, t('common.network'))); }
  }
  return (
    <Sheet visible tall title={promo ? t('promo.edit') : t('promo.new')} onClose={onClose}
      footer={<View style={{ gap: 8 }}><Btn icon="check" title={t('price.save')} loading={busy} disabled={busy || !valid} onPress={submit} />{promo && shop.can('PRICING_RULES', 'delete') ? <Btn variant="danger" icon="trash" title={t('ws.delete')} onPress={remove} /> : null}</View>}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <TextBox label={`${t('promo.name')} *`} value={f.name} onChangeText={set('name')} maxLength={120} autoCapitalize="sentences" />
      <ThemedText type="smallBold">{t('promo.target')}</ThemedText>
      <Chips scroll={false} value={f.scope} onChange={set('scope')} options={['PRODUCT', 'CATEGORY', 'ALL'].map((k) => ({ value: k, label: t(`promo.target.${k}`) }))} />
      {f.scope === 'PRODUCT' ? <ProductPicker label={`${t('promo.product')} *`} value={product ?? (promo?.productId ? ({ id: promo.productId, name: promo.productName ?? '' } as Product) : null)} onChange={(p) => { setProduct(p); setF((x) => ({ ...x, productId: p?.id ?? '' })); }} /> : null}
      {f.scope === 'CATEGORY' ? <SelectField required label={t('promo.category')} value={f.categoryId} onChange={set('categoryId')} options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /> : null}
      <ThemedText type="smallBold">{t('promo.kind')}</ThemedText>
      <Chips scroll={false} value={f.kind} onChange={set('kind')} options={['PERCENT', 'FIXED'].map((k) => ({ value: k, label: t(`promo.kind.${k}`) }))} />
      <NumberBox label={`${f.kind === 'PERCENT' ? t('promo.valuePercent') : `${t('promo.valueFixed')} (${shop.currency})`} *`} value={f.value} onChange={set('value')} suffix={f.kind === 'PERCENT' ? '%' : shop.currency} />
      <SelectField label={t('price.customerType')} value={f.customerType} onChange={set('customerType')} placeholder={t('price.anyone')} options={types.map((x) => ({ value: x.code, label: x.name }))} />
      <DateField label={t('promo.starts')} value={f.startsOn} onChange={set('startsOn')} max={f.endsOn || undefined} optional />
      <DateField label={t('promo.ends')} value={f.endsOn} onChange={set('endsOn')} min={f.startsOn || undefined} optional />
      <Switch value={f.active} onChange={(v) => setF((x) => ({ ...x, active: v }))} label={t('promo.active')} />
    </Sheet>
  );
}

function Breaks({ types, register }: { types: CType[]; register: (fn: (() => void) | null) => void }) {
  const { t } = useT();
  const shop = useShop();
  const th = useTheme();
  const list = useQuery<Brk[]>(`${BASE}/breaks`);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Brk | 'new' | null>(null);
  const rows = useMemo(() => (list.data ?? []).filter((b) => !q.trim() || b.productName.toLowerCase().includes(q.trim().toLowerCase())), [list.data, q]);
  const progressive = useProgressive(rows, 20);   // jusqu'a 2000 paliers possibles : 20 a la fois, la suite au defilement
  useEffect(() => { register(progressive.loadMore); return () => register(null); });
  return (
    <View style={{ gap: 8 }}>
      {shop.can('PRICING_RULES', 'create') ? <Btn icon="plus" title={t('price.break.new')} onPress={() => setEditing('new')} /> : null}
      <TextBox label={t('price.break.search')} value={q} onChangeText={setQ} autoCapitalize="none" />
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? <Skeleton rows={3} height={64} /> : rows.length === 0 ? <Empty icon="layer-group" title={t('price.break.empty')} text={t('price.break.emptyText')} /> : progressive.visible.map((b) => (
        <Pressable key={b.id} onPress={() => setEditing(b)} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: th.backgroundElement, opacity: pressed ? 0.75 : b.active ? 1 : 0.65 }]}>
          <View style={s.flex}>
            <ThemedText type="smallBold" numberOfLines={1}>{b.productName}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{[b.unitLabel ?? t('price.break.baseUnit'), t('price.break.from', { qty: Number(b.minQty) }), b.customerType].filter(Boolean).join(' · ')}</ThemedText>
          </View>
          <ThemedText type="smallBold">{shop.money(b.price)}</ThemedText>
        </Pressable>
      ))}
      <ListFooter shown={progressive.visible.length} total={progressive.total} hasMore={progressive.hasMore} onMore={progressive.loadMore} />
      {editing ? <BreakSheet brk={editing === 'new' ? null : editing} types={types} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} /> : null}
    </View>
  );
}

function BreakSheet({ brk, types, onClose, onSaved }: { brk: Brk | null; types: CType[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const id = useRef(brk?.id ?? uuid());
  const [product, setProduct] = useState<Product | null>(brk ? ({ id: brk.productId, name: brk.productName, unit: '', salePrice: 0 } as unknown as Product) : null);
  const detail = useQuery<Product>(product?.id ? `/api/shop/products/${product.id}` : null);
  const full = detail.data ?? product;
  const units = (full?.units ?? []).filter((u) => u.active);
  const [f, setF] = useState({ unitId: brk?.unitId ?? '', customerType: brk?.customerType ?? '', minQty: brk ? String(Number(brk.minQty)) : '', price: brk ? String(Number(brk.price)) : '', active: brk?.active ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const valid = product?.id && num(f.minQty) > 0 && f.price !== '' && num(f.price) >= 0;
  async function submit() {
    setBusy(true); setError(null);
    const body = { id: id.current, productId: product!.id, unitId: f.unitId || null, customerType: f.customerType || null, minQty: num(f.minQty), price: num(f.price), active: f.active };
    try { await shop.call(brk ? `${BASE}/breaks/${brk.id}` : `${BASE}/breaks`, { method: brk ? 'PUT' : 'POST', body }); toast(t('ws.saved')); onSaved(); } catch (e) { setError(msg(e, t('common.network'))); setBusy(false); }
  }
  async function remove() {
    if (!(await confirmAction(t('price.break.deleteTitle'), '', t('ws.delete'), t('common.cancel')))) return;
    try { await shop.call(`${BASE}/breaks/${brk!.id}`, { method: 'DELETE' }); toast(t('ws.deleted')); onSaved(); } catch (e) { setError(msg(e, t('common.network'))); }
  }
  return (
    <Sheet visible tall title={brk ? t('price.break.edit') : t('price.break.new')} onClose={onClose}
      footer={<View style={{ gap: 8 }}><Btn icon="check" title={t('price.save')} loading={busy} disabled={busy || !valid} onPress={submit} />{brk && shop.can('PRICING_RULES', 'delete') ? <Btn variant="danger" icon="trash" title={t('ws.delete')} onPress={remove} /> : null}</View>}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {brk ? <ThemedText type="smallBold">{brk.productName}</ThemedText> : <ProductPicker label={`${t('price.break.product')} *`} value={product} onChange={(p) => { setProduct(p); setF((x) => ({ ...x, unitId: '' })); }} />}
      <SelectField label={t('price.break.unit')} value={f.unitId} onChange={set('unitId')} placeholder={full?.unit ? baseUnitName(shop, full.unit) : t('price.break.baseUnit')} options={units.map((u) => ({ value: u.id, label: u.label }))} />
      <SelectField label={t('price.customerType')} value={f.customerType} onChange={set('customerType')} placeholder={t('price.anyone')} options={types.map((x) => ({ value: x.code, label: x.name }))} />
      <NumberBox label={`${t('price.break.minQty')} *`} value={f.minQty} onChange={set('minQty')} />
      <NumberBox label={`${t('price.break.price')} (${shop.currency}) *`} value={f.price} onChange={set('price')} suffix={shop.currency} />
      <Switch value={f.active} onChange={(v) => setF((x) => ({ ...x, active: v }))} label={t('price.break.active')} />
    </Sheet>
  );
}

function Types({ query }: { query: ReturnType<typeof useQuery<CType[]>> }) {
  const { t } = useT();
  const shop = useShop();
  const th = useTheme();
  const toast = useToast();
  const [editing, setEditing] = useState<CType | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function defaults() {
    setError(null);
    try { await shop.call(`${BASE}/customer-types/defaults`, { method: 'POST' }); toast(t('ws.saved')); void query.reload(); } catch (e) { setError(msg(e, t('common.network'))); }
  }
  return (
    <View style={{ gap: 8 }}>
      {shop.can('PRICING_RULES', 'create') ? <Btn icon="plus" title={t('price.type.new')} onPress={() => setEditing('new')} /> : null}
      {shop.can('PRICING_RULES', 'create') ? <Btn variant="secondary" icon="users" title={t('price.type.defaults')} onPress={defaults} /> : null}
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {query.error ? <ErrorNote message={query.error} onRetry={query.reload} /> : null}
      {query.loading && !query.data ? <Skeleton rows={3} height={64} /> : (query.data ?? []).length === 0 ? <Empty icon="users" title={t('price.type.empty')} text={t('price.type.emptyText')} /> : (query.data ?? []).map((x) => (
        <Pressable key={x.id} onPress={() => setEditing(x)} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: th.backgroundElement, opacity: pressed ? 0.75 : x.active ? 1 : 0.65 }]}>
          <View style={s.flex}><ThemedText type="smallBold">{x.name}</ThemedText><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{x.code}</ThemedText></View>
          <ThemedText type="smallBold">{Number(x.discountPercent) > 0 ? t('price.type.discountShort', { value: Number(x.discountPercent) }) : '—'}</ThemedText>
        </Pressable>
      ))}
      {editing ? <TypeSheet type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void query.reload(); }} /> : null}
    </View>
  );
}

function TypeSheet({ type, onClose, onSaved }: { type: CType | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const id = useRef(type?.id ?? uuid());
  const [f, setF] = useState({ name: type?.name ?? '', discountPercent: type ? String(Number(type.discountPercent)) : '0', active: type?.active ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setError(null);
    try { await shop.call(type ? `${BASE}/customer-types/${type.id}` : `${BASE}/customer-types`, { method: type ? 'PUT' : 'POST', body: { id: id.current, name: f.name.trim(), discountPercent: num(f.discountPercent), active: f.active } }); toast(t('ws.saved')); onSaved(); } catch (e) { setError(msg(e, t('common.network'))); setBusy(false); }
  }
  async function remove() {
    if (!(await confirmAction(t('price.type.deleteTitle'), t('price.type.deleteText'), t('ws.delete'), t('common.cancel')))) return;
    try { await shop.call(`${BASE}/customer-types/${type!.id}`, { method: 'DELETE' }); toast(t('ws.deleted')); onSaved(); } catch (e) { setError(msg(e, t('common.network'))); }
  }
  return (
    <Sheet visible title={type ? t('price.type.edit') : t('price.type.new')} onClose={onClose}
      footer={<View style={{ gap: 8 }}><Btn icon="check" title={t('price.save')} loading={busy} disabled={busy || !f.name.trim()} onPress={submit} />{type && shop.can('PRICING_RULES', 'delete') ? <Btn variant="danger" icon="trash" title={t('ws.delete')} onPress={remove} /> : null}</View>}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <TextBox label={`${t('price.type.name')} *`} value={f.name} onChangeText={(v) => setF((x) => ({ ...x, name: v }))} maxLength={60} autoCapitalize="words" />
      <NumberBox label={t('price.type.discount')} value={f.discountPercent} onChange={(v) => setF((x) => ({ ...x, discountPercent: v }))} suffix="%" />
      <Switch value={f.active} onChange={(v) => setF((x) => ({ ...x, active: v }))} label={t('price.type.active')} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18 },
});
