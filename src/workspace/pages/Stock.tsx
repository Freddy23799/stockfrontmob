import { useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ProductPicker } from '@/components/product-picker';
import { SelectField } from '@/components/dynamic-fields';
import { ThemedText } from '@/components/themed-text';
import { Thumb } from '@/components/thumb';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, Input, NumberBox, Screen, Sheet, Skeleton, TextBox, useToast, type Tone } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { OfflineAdvice } from '@/components/offline-advice';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useCatalog } from '@/lib/catalog';
import { formatDate, formatDateTime, num, sellable, uuid, type Product } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { qs, useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { LIST_PROPS } from '@/lib/list';
import type { PageProps } from '../registry';

export const LOSS_REASONS = ['EXPIRED', 'DAMAGED', 'THEFT', 'LOST', 'RECALL', 'OTHER'];
const LOT_TONE: Record<string, Tone> = { EXPIRED: 'danger', CRITICAL: 'danger', WARNING: 'warning', OK: 'success', NO_EXPIRY: 'info' };
type Lot = { id: string; productId: string; productName: string; lotNumber: string; expiryDate?: string; daysLeft?: number; status: string; quantity: number; unit: string; locationName?: string; supplierName?: string };

export function ExpiryBadge({ lot }: { lot: { expiryDate?: string; daysLeft?: number; status: string } }) {
  const { t, lang } = useT();
  if (!lot.expiryDate) return <Badge tone="info">—</Badge>;
  const d = lot.daysLeft ?? 0;
  return <Badge tone={LOT_TONE[lot.status]}>{d < 0 ? t('ws.expiredAgo', { days: Math.abs(d) }) : t('ws.daysLeft', { days: d })} · {formatDate(lot.expiryDate, lang, { month: 'short', year: 'numeric' })}</Badge>;
}

/** Ajustement ou perte sur un produit (et son lot si le metier suit les lots). Peut partir hors ligne : l'identifiant est choisi ici. */
export function AdjustSheet({ preset, onClose, onDone }: { preset?: { product: Pick<Product, 'id' | 'name' | 'trackLots' | 'stock' | 'image'> & Partial<Product>; lotId?: string; kind?: string; reason?: string }; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const offline = useOffline();
  const catalog = useCatalog();
  const id = useRef(uuid());
  const [product, setProduct] = useState<any>(preset?.product ?? null);
  const [lotId, setLotId] = useState(preset?.lotId ?? '');
  const [kind, setKind] = useState(preset?.kind ?? 'ADJUSTMENT');
  const [sign, setSign] = useState(1);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(preset?.reason ?? 'DAMAGED');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lots = useQuery<{ items: Lot[] }>(product?.trackLots ? `/api/shop/stock/lots${qs({ productId: product.id, status: 'all', size: 50 })}` : null);
  const loss = kind === 'LOSS';
  const quantity = num(qty) * (loss ? -1 : sign);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await offline.submit({ id: id.current, shopId: shop.shopId, method: 'POST', path: '/api/shop/stock/adjust', label: `${t('ws.adjustStock')} · ${product.name} (${quantity > 0 ? '+' : ''}${quantity})`,
        body: { id: id.current, productId: product.id, lotId: lotId || undefined, quantity, kind, reason: loss ? reason : undefined, note: note || undefined } });
      if (res.queued) { catalog.consume([{ productId: product.id, quantity: -quantity }]); toast(t('mob.adjustQueued'), 'warning'); } else toast(t('ws.saved'));
      onDone();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.error')); setBusy(false); }
  }

  return (
    <Sheet visible tall title={t('ws.adjustStock')} onClose={onClose}
      footer={<Btn icon="check" title={t('common.save')} loading={busy} disabled={busy || !product || !(num(qty) > 0) || (Boolean(product?.trackLots) && !lotId)} onPress={submit} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <Hint icon="lightbulb">{t('mob.adjustHint')}</Hint>
      {preset?.product ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Thumb image={product.image} size={44} />
          <View style={{ flex: 1 }}><ThemedText type="smallBold">{product.name}</ThemedText><ThemedText type="small" themeColor="textSecondary">{t('ws.currentStock')} : {num(product.stock)}</ThemedText></View>
        </Card>
      ) : <ProductPicker label={shop.v('product')} value={product} onChange={setProduct} stockedOnly />}
      {product ? (
        <>
          {shop.has('INVENTORY') ? <Chips scroll={false} value={kind} onChange={setKind} options={[{ value: 'ADJUSTMENT', label: t('ws.correction'), icon: 'sliders' }, { value: 'LOSS', label: t('ws.lossKind'), icon: 'ban' }]} /> : null}
          {product.trackLots ? <SelectField required label={shop.v('lot')} value={lotId} onChange={setLotId} options={(lots.data?.items ?? []).map((l) => ({ value: l.id, label: `${l.lotNumber} · ${l.expiryDate ?? '—'} · ${num(l.quantity)}` }))} /> : null}
          {!loss ? <Chips scroll={false} value={String(sign)} onChange={(v) => setSign(Number(v))} options={[{ value: '1', label: t('ws.add'), icon: 'plus' }, { value: '-1', label: t('ws.removeQty'), icon: 'minus' }]} /> : null}
          {loss ? <SelectField required label={t('ws.reason')} value={reason} onChange={setReason} options={LOSS_REASONS.map((r) => ({ value: r, label: t(`ws.reason.${r}`) }))} /> : null}
          <NumberBox label={`${shop.v('quantity')} *`} value={qty} onChange={setQty} />
          <TextBox label={t('ws.note')} value={note} onChangeText={setNote} maxLength={200} autoCapitalize="sentences" />
        </>
      ) : null}
    </Sheet>
  );
}

/** Sortie definitive d'un lot (perime, casse...) apres avoir choisi le motif. */
export function WriteOffSheet({ lot, onClose, onDone }: { lot: { id: string; lotNumber: string; quantity: number; productName: string; status?: string }; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [reason, setReason] = useState(lot.status === 'EXPIRED' ? 'EXPIRED' : 'DAMAGED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    try { await shop.call(`/api/shop/stock/lots/${lot.id}/write-off`, { method: 'POST', body: { reason } }); toast(t('ws.saved')); onDone(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible title={t('ws.writeOffTitle', { lot: lot.lotNumber })} onClose={onClose} footer={<Btn variant="danger" icon="ban" title={t('ws.writeOff')} loading={busy} onPress={go} />}>
      <Hint icon="triangle-exclamation" tone="warning">{t('ws.writeOffText', { qty: num(lot.quantity), name: lot.productName })}</Hint>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <SelectField required label={t('ws.reason')} value={reason} onChange={setReason} options={LOSS_REASONS.map((r) => ({ value: r, label: t(`ws.reason.${r}`) }))} />
    </Sheet>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const th = useTheme();
  return (
    <View style={{ justifyContent: 'center', marginBottom: 6 }}>
      <Icon name="magnifying-glass" size={15} color={th.textSecondary} style={{ position: 'absolute', left: 15, zIndex: 1 }} />
      <Input value={value} onChangeText={onChange} placeholder={placeholder} style={{ paddingLeft: 40 }} autoCapitalize="none" />
    </View>
  );
}

function LotsTab() {
  const { t } = useT();
  const shop = useShop();
  const th = useTheme();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [adjust, setAdjust] = useState<Parameters<typeof AdjustSheet>[0]['preset']>();
  const [off, setOff] = useState<Lot | null>(null);
  const list = useInfinite<Lot>('/api/shop/stock/lots', { q: q.trim(), status });
  return (
    <View style={{ flex: 1 }}>
      <SearchBar value={q} onChange={setQ} placeholder={t('ws.searchLot')} />
      <View style={{ marginBottom: 6 }}><Chips value={status} onChange={setStatus} options={[{ value: 'active', label: t('ws.lotsActive') }, { value: 'expiring', label: t('ws.lotsExpiring') }, { value: 'expired', label: t('ws.lotsExpired') }, { value: 'empty', label: t('ws.lotsEmpty') }, { value: 'all', label: t('ws.all') }]} /></View>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={5} height={72} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(l) => l.id} contentContainerStyle={{ gap: 8, paddingBottom: 100 }} onEndReached={list.loadMore} onEndReachedThreshold={0.6} refreshing={list.refreshing} onRefresh={list.reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="warehouse" title={t('ws.noLots')} text={t('ws.noLotsText')} />}
          renderItem={({ item: l }) => (
            <View style={[s.row, { backgroundColor: th.backgroundElement }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <ThemedText type="smallBold" numberOfLines={2}>{l.productName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ fontSize: 12 }}>{shop.v('lot')} {l.lotNumber}{l.locationName ? ` · ${l.locationName}` : ''}</ThemedText>
                <View style={{ flexDirection: 'row' }}><ExpiryBadge lot={l} /></View>
              </View>
              <ThemedText type="smallBold" style={{ fontSize: 16 }}>{num(l.quantity)} <ThemedText type="small" themeColor="textSecondary">{l.unit}</ThemedText></ThemedText>
              <View style={{ gap: 6 }}>
                {shop.can('STOCK', 'update') ? <IconBtn size={36} name="sliders" label={t('ws.adjustStock')} onPress={() => setAdjust({ product: { id: l.productId, name: l.productName, trackLots: true, stock: l.quantity }, lotId: l.id })} /> : null}
                {shop.has('INVENTORY') && shop.can('INVENTORY', 'update') && num(l.quantity) > 0 ? <IconBtn size={36} tone="danger" name="ban" label={t('ws.writeOff')} onPress={() => setOff(l)} /> : null}
              </View>
            </View>
          )} />
      )}
      {adjust ? <AdjustSheet preset={adjust} onClose={() => setAdjust(undefined)} onDone={() => { setAdjust(undefined); void list.reload(); }} /> : null}
      {off ? <WriteOffSheet lot={off} onClose={() => setOff(null)} onDone={() => { setOff(null); void list.reload(); }} /> : null}
    </View>
  );
}

function LevelsTab() {
  const { t } = useT();
  const shop = useShop();
  const th = useTheme();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [adjust, setAdjust] = useState<Product | null>(null);
  const list = useInfinite<Product>('/api/shop/products', { q: q.trim(), status, sort: 'stock' });
  const tone = (p: Product): Tone => (sellable(p) <= 0 ? 'danger' : p.minStockAlert != null && sellable(p) <= Number(p.minStockAlert) ? 'warning' : 'success');
  return (
    <View style={{ flex: 1 }}>
      <SearchBar value={q} onChange={setQ} placeholder={shop.v('searchProduct')} />
      <View style={{ marginBottom: 6 }}><Chips value={status} onChange={setStatus} options={[{ value: '', label: t('ws.all') }, { value: 'low', label: t('ws.lowStock') }, { value: 'out', label: t('ws.outOfStock') }]} /></View>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={5} height={64} /> : (
        <FlatList {...LIST_PROPS} data={list.items.filter((p) => p.trackStock)} keyExtractor={(p) => p.id} contentContainerStyle={{ gap: 8, paddingBottom: 100 }} onEndReached={list.loadMore} onEndReachedThreshold={0.6} refreshing={list.refreshing} onRefresh={list.reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="warehouse" title={t('ws.noResult')} />}
          renderItem={({ item: p }) => (
            <View style={[s.row, { backgroundColor: th.backgroundElement }]}>
              <Thumb image={p.image} size={44} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText type="smallBold" numberOfLines={2}>{p.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{t('ws.min')} {p.minStockAlert ?? shop.config.defaultMinStock ?? '—'}</ThemedText>
              </View>
              <Badge tone={tone(p)}>{num(p.stock)} {p.unit}</Badge>
              {shop.can('STOCK', 'update') ? <IconBtn size={36} name="sliders" label={t('ws.adjustStock')} onPress={() => setAdjust(p)} /> : null}
            </View>
          )} />
      )}
      {adjust ? <AdjustSheet preset={{ product: adjust }} onClose={() => setAdjust(null)} onDone={() => { setAdjust(null); void list.reload(); }} /> : null}
    </View>
  );
}

const KIND_TONE: Record<string, Tone> = { PURCHASE: 'success', SALE: 'info', RETURN: 'success', ADJUSTMENT: 'warning', INVENTORY_COUNT: 'warning', LOSS: 'danger', TRANSFER: 'info' };
function MovementsTab() {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const [kind, setKind] = useState('');
  const list = useInfinite<{ id: string; productName: string; occurredAt: string; lotNumber?: string; reason?: string; kind: string; quantity: number }>('/api/shop/stock/movements', { kind });
  return (
    <View style={{ flex: 1 }}>
      <View style={{ marginBottom: 6 }}><Chips value={kind} onChange={setKind} options={['', 'PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'INVENTORY_COUNT', 'LOSS'].map((k) => ({ value: k, label: k ? t(`ws.k.${k}`) : t('ws.all') }))} /></View>
      {list.loading && list.items.length === 0 ? <Skeleton rows={5} height={64} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(m) => m.id} contentContainerStyle={{ gap: 8, paddingBottom: 100 }} onEndReached={list.loadMore} onEndReachedThreshold={0.6} refreshing={list.refreshing} onRefresh={list.reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="list" title={t('ws.noMovements')} />}
          renderItem={({ item: m }) => (
            <View style={[s.row, { backgroundColor: th.backgroundElement }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <ThemedText type="smallBold" numberOfLines={2}>{m.productName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }} numberOfLines={1}>{formatDateTime(m.occurredAt, lang)}{m.lotNumber ? ` · ${shop.v('lot')} ${m.lotNumber}` : ''}</ThemedText>
                <View style={{ flexDirection: 'row' }}><Badge tone={KIND_TONE[m.kind]}>{t(`ws.k.${m.kind}`)}</Badge></View>
              </View>
              <ThemedText type="smallBold" style={{ fontSize: 17, color: num(m.quantity) < 0 ? th.danger : th.success }}>{num(m.quantity) > 0 ? '+' : ''}{num(m.quantity)}</ThemedText>
            </View>
          )} />
      )}
    </View>
  );
}

type CountRow = { key: string; productId: string; name: string; unit: string; lotId: string | null; label: string | null; expected: number; counted: string };
/** Inventaire : on saisit ce qu'on COMPTE ; le serveur enregistre l'ecart (compte - attendu). */
function CountTab() {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const offline = useOffline();
  const batch = useRef(uuid());
  const [rows, setRows] = useState<CountRow[]>([]);
  const [result, setResult] = useState<{ productName: string; lotNumber?: string; expected: number; counted: number; difference: number }[] | 'queued' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Product | null>(null);

  async function addProduct(p: Product | null) {
    setPicked(null);
    if (!p || !p.trackStock || rows.some((r) => r.productId === p.id)) return;
    let items: { lotId: string | null; label: string | null; expected: number }[] = [{ lotId: null, label: null, expected: num(p.stock) }];
    if (p.trackLots) {
      try {
        const r = await shop.call<{ items: Lot[] }>(`/api/shop/stock/lots${qs({ productId: p.id, status: 'active', size: 50 })}`);
        items = r.items.map((l) => ({ lotId: l.id, label: `${shop.v('lot')} ${l.lotNumber}${l.expiryDate ? ` · ${l.expiryDate}` : ''}`, expected: num(l.quantity) }));
      } catch { setError(t('mob.needsConnection')); return; }
      if (items.length === 0) { toast(t('ws.noActiveLot'), 'danger'); return; }
    }
    setRows((prev) => [...prev, ...items.map((it) => ({ key: uuid(), productId: p.id, name: p.name, unit: p.unit, ...it, counted: '' }))]);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const lines = rows.filter((r) => r.counted !== '').map((r) => ({ productId: r.productId, lotId: r.lotId || undefined, counted: num(r.counted), expected: r.expected }));
      const res = await offline.submit<typeof result>({ id: batch.current, shopId: shop.shopId, method: 'POST', path: '/api/shop/stock/count', label: `${t('ws.inventory')} · ${lines.length}`, body: { id: batch.current, lines } });
      setResult(res.queued ? 'queued' : (res.data as never));
      toast(t('ws.saved'));
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.error')); } finally { setBusy(false); }
  }

  if (result) {
    const diffs = Array.isArray(result) ? result.filter((r) => num(r.difference) !== 0) : [];
    return (
      <Card style={{ gap: 10 }}>
        <ThemedText type="smallBold" style={{ fontSize: 17 }}><Icon name="check-double" size={16} />  {t('ws.countDone')}</ThemedText>
        {result === 'queued' ? <Hint icon="cloud-arrow-up" tone="warning">{t('mob.countQueued')}</Hint> : <ThemedText type="small" themeColor="textSecondary">{t('ws.countSummary', { total: result.length, diffs: diffs.length })}</ThemedText>}
        {diffs.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><ThemedText type="smallBold">{r.productName}</ThemedText><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{t('ws.expected')} {num(r.expected)} → {t('ws.counted')} {num(r.counted)}</ThemedText></View>
            <Badge tone={num(r.difference) < 0 ? 'danger' : 'success'}>{num(r.difference) > 0 ? '+' : ''}{num(r.difference)}</Badge>
          </View>
        ))}
        <Btn title={t('ws.newCount')} onPress={() => { batch.current = uuid(); setRows([]); setResult(null); }} />
      </Card>
    );
  }
  return (
    <View style={{ flex: 1, gap: 10 }}>
      <OfflineAdvice kind="count" />
      <Hint icon="lightbulb">{t('ws.countHelp')}</Hint>
      <ProductPicker label={shop.v('product')} value={picked} onChange={addProduct} stockedOnly />
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <FlatList {...LIST_PROPS} data={rows} keyExtractor={(r) => r.key} contentContainerStyle={{ gap: 8, paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Empty icon="scale-balanced" title={t('ws.countEmpty')} />}
        renderItem={({ item: r }) => (
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}><ThemedText type="smallBold">{r.name}</ThemedText><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{r.label ? `${r.label} · ` : ''}{t('ws.expected')} {r.expected} {r.unit}</ThemedText></View>
              <IconBtn size={34} name="xmark" label={t('ws.remove')} onPress={() => setRows((p) => p.filter((x) => x.key !== r.key))} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}><NumberBox label={t('ws.counted')} value={r.counted} placeholder={String(r.expected)} onChange={(v) => setRows((p) => p.map((x) => (x.key === r.key ? { ...x, counted: v } : x)))} /></View>
              {r.counted !== '' && num(r.counted) !== r.expected ? <Badge tone={num(r.counted) < r.expected ? 'danger' : 'success'}>{num(r.counted) - r.expected > 0 ? '+' : ''}{num(r.counted) - r.expected}</Badge> : null}
            </View>
          </Card>
        )}
        ListFooterComponent={rows.length > 0 ? <Btn icon="check" title={t('ws.validateCount')} loading={busy} disabled={busy || rows.every((r) => r.counted === '')} onPress={submit} /> : undefined} />
    </View>
  );
}

export default function Stock({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const tabs = [
    ...(shop.has('EXPIRY') ? [{ value: 'lots', label: shop.v('lots') }] : []),
    { value: 'levels', label: t('ws.levels') }, { value: 'movements', label: t('ws.movements') },
    ...(shop.can('INVENTORY', 'update') ? [{ value: 'count', label: t('ws.inventory') }] : []),
  ];
  const [cur, setCur] = useState(tabs[0].value);
  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)}>
      <View style={{ marginBottom: 8 }}><Chips value={cur} onChange={setCur} options={tabs} /></View>
      {cur === 'lots' ? <LotsTab /> : cur === 'levels' ? <LevelsTab /> : cur === 'movements' ? <MovementsTab /> : <CountTab />}
    </Screen>
  );
}

const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18 } });
