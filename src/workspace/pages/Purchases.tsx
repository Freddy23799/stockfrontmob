import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { DateField } from '@/components/date-field';
import { SelectField } from '@/components/dynamic-fields';
import { Icon } from '@/components/icon';
import { PartyPicker, type Party } from '@/components/party-picker';
import { ProductPicker } from '@/components/product-picker';
import { Receipt, type Doc } from '@/components/receipt';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, Input, NumberBox, Screen, Sheet, Skeleton, Switch, TextBox, useToast, type Tone } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDate, num, uuid, type Product, type Unit } from '@/lib/format';
import { baseUnitName } from '@/lib/units';
import { useOffline } from '@/lib/offline';
import { useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { LIST_PROPS } from '@/lib/list';
import type { PageProps } from '../registry';

const STATUS_TONE: Record<string, Tone> = { DRAFT: 'info', SENT: 'warning', PARTIAL: 'warning', RECEIVED: 'success', CANCELLED: 'danger' };
const payTone = (s: string): Tone => (s === 'PAID' ? 'success' : s === 'PARTIAL' ? 'warning' : 'danger');
type Row = { id: string; number: string; partyName?: string; issuedAt: string; lineCount: number; total: number; status: string; paymentStatus: string };
type PDoc = Doc & { status: string; partyId?: string; dueDate?: string; notes?: string; paidTotal: number };

export default function Purchases({ item, tab: isTab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const params = useLocalSearchParams<{ order?: string; receive?: string }>();
  const [tab, setTab] = useState('orders');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [unpaid, setUnpaid] = useState(false);
  const [form, setForm] = useState<{ type: 'order' | 'receive'; order?: PDoc; preset?: string } | null>(() => (params.receive ? { type: 'receive' } : params.order ? { type: 'order', preset: params.order } : null));
  const [open, setOpen] = useState<string | null>(null);
  const type = tab === 'receipts' ? 'GOODS_RECEIPT' : 'PURCHASE_ORDER';
  const list = useInfinite<Row>('/api/shop/documents', { type, q: q.trim(), status: tab === 'orders' ? status : undefined, unpaid: tab === 'receipts' && unpaid ? true : undefined }, { enabled: tab !== 'suggest' });
  const statuses = ['', 'DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED'];
  const tabs = [{ value: 'orders', label: shop.v('purchaseOrders') }, { value: 'receipts', label: t('ws.receipts') }, ...(shop.can('PURCHASE_ORDERS', 'create') ? [{ value: 'suggest', label: t('ro.tab'), icon: 'wand-magic-sparkles' }] : [])];

  return (
    <Screen tabs={isTab} fixed title={t('ws.supply')} subtitle={shop.tr(item.label)}
      right={<View style={{ flexDirection: 'row', gap: 8 }}>
        {shop.can('STOCK', 'create') ? <IconBtn name="truck-ramp-box" label={t('ws.receiveGoods')} onPress={() => setForm({ type: 'receive' })} /> : null}
        {shop.can('PURCHASE_ORDERS', 'create') ? <IconBtn name="plus" tone="primary" label={t('ws.newOrder')} onPress={() => setForm({ type: 'order' })} /> : null}
      </View>}>
      <View style={{ marginBottom: 8 }}><Chips value={tab} onChange={setTab} options={tabs} /></View>
      {tab === 'suggest' ? <Reorder onCreated={() => { setTab('orders'); void list.reload(); }} /> : (
        <>
          <View style={{ justifyContent: 'center', marginBottom: 8 }}>
            <Icon name="magnifying-glass" size={15} color={th.textSecondary} style={{ position: 'absolute', left: 15, zIndex: 1 }} />
            <Input value={q} onChangeText={setQ} placeholder={t('ws.searchDoc')} style={{ paddingLeft: 40 }} autoCapitalize="none" />
          </View>
          <View style={{ marginBottom: 8 }}>
            {tab === 'orders' ? <Chips value={status} onChange={setStatus} options={statuses.map((s) => ({ value: s, label: s ? t(`ws.s.${s}`) : t('ws.all') }))} />
              : <Chips value={unpaid ? 'u' : ''} onChange={(v) => setUnpaid(v === 'u')} options={[{ value: '', label: t('ws.all') }, { value: 'u', label: t('ws.unpaid') }]} />}
          </View>
          {shop.can('REPORTS', 'view') && list.total > 0 ? <View style={{ marginBottom: 8 }}><PdfButton small path="/api/shop/pdf/purchases" name="achats.pdf" /></View> : null}
          {list.stale ? <Hint icon="cloud" tone="warning">{t('mob.showingSaved')}</Hint> : null}
          {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
          {list.loading && list.items.length === 0 ? <Skeleton rows={5} height={68} /> : (
            <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(d) => d.id} contentContainerStyle={{ gap: 8, paddingBottom: 100 }} onEndReached={list.loadMore} onEndReachedThreshold={0.6} refreshing={list.refreshing} onRefresh={list.reload} showsVerticalScrollIndicator={false}
              ListEmptyComponent={<Empty icon="truck" title={t('ws.noDocs')} text={tab === 'orders' ? t('ws.noOrdersText') : t('ws.noReceiptsText')} />}
              renderItem={({ item: d }) => (
                <Pressable onPress={() => setOpen(d.id)} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: th.backgroundElement, opacity: pressed ? 0.75 : 1 }]}>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <ThemedText type="smallBold">{d.number}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={{ fontSize: 12 }}>{d.partyName ?? '—'} · {formatDate(d.issuedAt, lang)} · {t('ws.itemsCount', { count: d.lineCount })}</ThemedText>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <ThemedText type="smallBold">{shop.money(d.total)}</ThemedText>
                    {tab === 'orders' ? <Badge tone={STATUS_TONE[d.status] ?? 'info'}>{t(`ws.s.${d.status}`)}</Badge> : <Badge tone={payTone(d.paymentStatus)}>{t(`ws.p.${d.paymentStatus}`)}</Badge>}
                  </View>
                </Pressable>
              )} />
          )}
        </>
      )}
      {form?.type === 'order' ? <OrderForm order={form.order} presetProductId={form.preset} onClose={() => setForm(null)} onSaved={() => { setForm(null); setOpen(null); void list.reload(); }} /> : null}
      {form?.type === 'receive' ? <ReceiveForm order={form.order} onClose={() => setForm(null)} onSaved={() => { setForm(null); setOpen(null); setTab('receipts'); void list.reload(); }} /> : null}
      {open && !form ? <DocSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} onReceive={(order) => setForm({ type: 'receive', order })} onEdit={(order) => setForm({ type: 'order', order })} /> : null}
    </Screen>
  );
}

type OrderLine = { key: string; productId: string; name: string; quantity: string; unitCost: string; baseCost?: number; unitId?: string; units?: Unit[]; baseUnit?: string };

function OrderForm({ order, presetProductId, onClose, onSaved }: { order?: PDoc; presetProductId?: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const offline = useOffline();
  const id = useRef(order?.id ?? uuid());
  const [supplierId, setSupplierId] = useState<string | null>(order?.partyId ?? null);
  const [supplier, setSupplier] = useState<Party | null>(order?.partyName ? ({ id: order.partyId!, name: order.partyName } as Party) : null);
  const [expected, setExpected] = useState(order?.dueDate ?? '');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [lines, setLines] = useState<OrderLine[]>(() => (order ? order.lines.map((l) => ({ key: l.id, productId: l.productId ?? '', name: l.description, quantity: String(l.quantity), unitCost: String(l.unitPrice) })) : []));
  const [pick, setPick] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = lines.reduce((a, l) => a + num(l.quantity) * num(l.unitCost), 0);
  const add = (p: Product | null) => {
    setPick(null);
    if (!p) return;
    setLines((ls) => (ls.some((l) => l.productId === p.id) ? ls : [...ls, { key: uuid(), productId: p.id, name: p.name, quantity: String(Math.max(1, Math.ceil(Number(p.minStockAlert ?? shop.config.defaultMinStock ?? 10) * 2 - Number(p.stock)))), unitCost: String(p.costPrice ?? 0), baseCost: Number(p.costPrice ?? 0), units: (p.units ?? []).filter((u) => u.active), baseUnit: p.unit }]));
  };
  // produit propose par une alerte de stock : on l'ajoute des que sa fiche est chargee (appel asynchrone, pas dans le rendu)
  useEffect(() => {
    if (!presetProductId) return undefined;
    let alive = true;
    shop.call<Product>(`/api/shop/products/${presetProductId}`).then((p) => { if (alive) add(p); }).catch(() => undefined);
    return () => { alive = false; };
  }, [presetProductId]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (key: string, c: Partial<OrderLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...c } : l)));
  const valid = Boolean(supplierId) && lines.length > 0 && lines.every((l) => num(l.quantity) > 0);

  async function save(send: boolean) {
    setBusy(true);
    setError(null);
    const body = { id: id.current, supplierId, expectedDate: expected || undefined, notes: notes || undefined, send, lines: lines.map((l) => ({ productId: l.productId, quantity: num(l.quantity), unitCost: num(l.unitCost), unitId: l.unitId })) };
    try {
      if (order) {
        await shop.call(`/api/shop/purchase-orders/${order.id}`, { method: 'PUT', body });
        if (send) await shop.call(`/api/shop/purchase-orders/${order.id}/status`, { method: 'POST', body: { status: 'SENT' } });
      } else {
        const res = await offline.submit({ id: id.current, shopId: shop.shopId, method: 'POST', path: '/api/shop/purchase-orders', body, label: `${t('ws.newOrder')} · ${supplier?.name ?? ''} · ${shop.money(total)}` });
        if (res.queued) toast(t('mob.orderQueued'), 'warning'); else toast(t('ws.saved'));
        return onSaved();
      }
      toast(t('ws.saved'));
      onSaved();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }

  return (
    <Sheet visible tall title={order ? `${shop.v('purchaseOrder')} ${order.number}` : t('ws.newOrder')} onClose={onClose}
      footer={(
        <View style={{ gap: 8 }}>
          <View style={s.totalRow}><ThemedText type="smallBold" style={{ flex: 1 }}>{t('ws.total')}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 18 }}>{shop.money(total)}</ThemedText></View>
          <Btn icon="truck" title={t('ws.saveAndSend')} disabled={busy || !valid || (Boolean(order) && !offline.online)} loading={busy} onPress={() => save(true)} />
          <Btn variant="secondary" title={t('ws.saveDraft')} disabled={busy || !valid || (Boolean(order) && !offline.online)} onPress={() => save(false)} />
        </View>
      )}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <Hint icon="lightbulb">{t('mob.orderHint')}</Hint>
      <PartyPicker role="SUPPLIER" label={shop.v('supplier')} value={supplierId} selected={supplier} onChange={(sid, p) => { setSupplierId(sid); setSupplier(p ?? null); }} />
      <DateField label={t('ws.expectedDate')} value={expected} onChange={setExpected} optional />
      <ProductPicker label={t('ws.addProductToOrder')} value={pick} onChange={add} stockedOnly />
      {lines.length === 0 ? <Empty icon="truck" title={t('ws.orderEmpty')} /> : lines.map((l) => (
        <Card key={l.key} style={{ gap: 8 }}>
          <View style={s.line}><ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={2}>{l.name}</ThemedText><IconBtn size={34} name="xmark" label={t('ws.remove')} onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /></View>
          {(l.units?.length ?? 0) > 0 ? (
            <SelectField required label={t('mob.boughtBy')} value={l.unitId ?? ''} onChange={(v) => { const u = l.units?.find((x) => x.id === v); patch(l.key, { unitId: v || undefined, unitCost: String(Math.round((l.baseCost ?? 0) * Number(u?.factor ?? 1) * 100) / 100) }); }}
              options={[{ value: '', label: baseUnitName(shop, l.baseUnit ?? '') }, ...l.units!.map((u) => ({ value: u.id, label: u.label }))]} />
          ) : null}
          <View style={s.line}>
            <View style={{ flex: 1 }}><NumberBox label={shop.v('quantity')} value={l.quantity} onChange={(v) => patch(l.key, { quantity: v })} /></View>
            <View style={{ flex: 1 }}><NumberBox label={t('ws.unitCost')} value={l.unitCost} onChange={(v) => patch(l.key, { unitCost: v })} /></View>
          </View>
          <ThemedText type="smallBold" style={{ textAlign: 'right' }}>{shop.money(num(l.quantity) * num(l.unitCost))}</ThemedText>
        </Card>
      ))}
      <TextBox label={t('ws.note')} value={notes} onChangeText={setNotes} multiline autoCapitalize="sentences" />
    </Sheet>
  );
}

type RLine = { key: string; lineId?: string; productId: string; name: string; trackLots: boolean; quantity: string; unitCost: string; lotNumber: string; expiryDate: string; locationId: string; baseCost?: number; unitId?: string; units?: Unit[]; baseUnit?: string };

/** Reception : avec une commande (lignes pre-remplies) ou libre (produits choisis a la main). */
function ReceiveForm({ order, onClose, onSaved }: { order?: PDoc; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const offline = useOffline();
  const id = useRef(uuid());
  const lotMode = shop.has('EXPIRY');
  const [supplierId, setSupplierId] = useState<string | null>(order?.partyId ?? null);
  const [supplier, setSupplier] = useState<Party | null>(null);
  const locations = useQuery<{ id: string; name: string }[]>(shop.has('LOCATIONS') ? '/api/shop/locations' : null);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [pay, setPay] = useState('');
  const [method, setMethod] = useState('CASH');
  const [lines, setLines] = useState<RLine[]>(() => (order ? order.lines.filter((l) => num(l.receivedQuantity) < num(l.quantity)).map((l) => ({ key: l.id, lineId: l.id, productId: l.productId ?? '', name: l.description, trackLots: true, quantity: String(num(l.quantity) - num(l.receivedQuantity)), unitCost: String(l.unitPrice), lotNumber: '', expiryDate: '', locationId: '' })) : []));
  const [needLots, setNeedLots] = useState<Record<string, boolean>>({});
  const [pick, setPick] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!order) return;
    Promise.all(order.lines.map((l) => shop.call<Product>(`/api/shop/products/${l.productId}`).catch(() => null))).then((ps) => {
      const map: Record<string, boolean> = {};
      ps.filter(Boolean).forEach((p) => { map[p!.id] = Boolean(p!.trackLots); });
      setNeedLots(map);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const add = (p: Product | null) => {
    setPick(null);
    if (!p) return;
    setNeedLots((m) => ({ ...m, [p.id]: Boolean(p.trackLots) }));
    setLines((ls) => [...ls, { key: uuid(), productId: p.id, name: p.name, trackLots: Boolean(p.trackLots), quantity: '1', unitCost: String(p.costPrice ?? 0), lotNumber: '', expiryDate: '', locationId: p.locationId ?? '', baseCost: Number(p.costPrice ?? 0), units: (p.units ?? []).filter((u) => u.active), baseUnit: p.unit }]);
  };
  const patch = (key: string, c: Partial<RLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...c } : l)));
  const total = lines.reduce((a, l) => a + num(l.quantity) * num(l.unitCost), 0);
  const tracks = (l: RLine) => lotMode && (needLots[l.productId] ?? l.trackLots);
  const valid = lines.length > 0 && lines.every((l) => num(l.quantity) > 0 && (!tracks(l) || (l.lotNumber.trim() && (!shop.config.lotRequiresExpiry || l.expiryDate))));

  async function submit() {
    setBusy(true);
    setError(null);
    const body = {
      id: id.current, supplierId: order ? undefined : supplierId || undefined, purchaseOrderId: order?.id, attributes: deliveryNote ? { deliveryNote } : undefined,
      lines: lines.map((l) => ({ lineId: l.lineId, productId: l.lineId ? undefined : l.productId, quantity: num(l.quantity), unitCost: num(l.unitCost), unitId: l.lineId ? undefined : l.unitId, lotNumber: tracks(l) ? l.lotNumber : undefined, expiryDate: tracks(l) && l.expiryDate ? l.expiryDate : undefined, locationId: l.locationId || undefined })),
      payments: num(pay) > 0 ? [{ id: uuid(), method, amount: num(pay) }] : undefined,
    };
    try {
      const res = await offline.submit<Doc>({ id: id.current, shopId: shop.shopId, method: 'POST', path: '/api/shop/receipts', body, label: `${t('ws.receiveGoods')} · ${shop.money(total)}` });
      toast(res.queued ? t('mob.receiptQueued') : t('ws.receiptDone', { number: res.data.number ?? '' }), res.queued ? 'warning' : 'success');
      onSaved();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }

  return (
    <Sheet visible tall title={order ? `${t('ws.receiveOrder')} ${order.number}` : t('ws.receiveGoods')} onClose={onClose}
      footer={(
        <View style={{ gap: 8 }}>
          <View style={s.totalRow}><ThemedText type="smallBold" style={{ flex: 1 }}>{t('ws.total')}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 18 }}>{shop.money(total)}</ThemedText></View>
          <Btn icon="check" title={t('ws.validateReceipt')} disabled={busy || !valid} loading={busy} onPress={submit} />
        </View>
      )}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <Hint icon="lightbulb">{t('mob.receiveHint')}</Hint>
      {!offline.online ? <Hint icon="cloud-arrow-up" tone="warning">{t('mob.createOfflineOk')}</Hint> : null}
      {!order && shop.has('SUPPLIERS') ? <PartyPicker role="SUPPLIER" label={shop.v('supplier')} value={supplierId} selected={supplier} onChange={(sid, p) => { setSupplierId(sid); setSupplier(p ?? null); }} /> : null}
      {!order ? <ProductPicker label={t('ws.addProductToReceipt')} value={pick} onChange={add} stockedOnly /> : null}
      {lines.length === 0 ? <Empty icon="truck" title={t('ws.receiptEmpty')} /> : lines.map((l) => (
        <Card key={l.key} style={{ gap: 10 }}>
          <View style={s.line}><ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={2}>{l.name}</ThemedText>{!order ? <IconBtn size={34} name="xmark" label={t('ws.remove')} onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /> : null}</View>
          {(l.units?.length ?? 0) > 0 ? (
            <SelectField required label={t('mob.boughtBy')} value={l.unitId ?? ''} onChange={(v) => { const u = l.units?.find((x) => x.id === v); patch(l.key, { unitId: v || undefined, unitCost: String(Math.round((l.baseCost ?? 0) * Number(u?.factor ?? 1) * 100) / 100) }); }}
              options={[{ value: '', label: baseUnitName(shop, l.baseUnit ?? '') }, ...l.units!.map((u) => ({ value: u.id, label: u.label }))]} />
          ) : null}
          <View style={s.line}>
            <View style={{ flex: 1 }}><NumberBox label={shop.v('quantity')} value={l.quantity} onChange={(v) => patch(l.key, { quantity: v })} /></View>
            <View style={{ flex: 1 }}><NumberBox label={t('ws.unitCost')} value={l.unitCost} onChange={(v) => patch(l.key, { unitCost: v })} /></View>
          </View>
          {tracks(l) ? (
            <>
              <TextBox label={`${t('ws.lotNumber')} *`} value={l.lotNumber} onChangeText={(v) => patch(l.key, { lotNumber: v })} maxLength={60} autoCapitalize="characters" />
              <DateField label={`${shop.v('expiry')}${shop.config.lotRequiresExpiry ? ' *' : ''}`} value={l.expiryDate} onChange={(v) => patch(l.key, { expiryDate: v })} optional min={new Date().toISOString().slice(0, 10)} />
            </>
          ) : null}
          {shop.has('LOCATIONS') && (locations.data?.length ?? 0) > 0 ? <SelectField label={shop.v('location')} value={l.locationId} onChange={(v) => patch(l.key, { locationId: v })} options={locations.data!.map((x) => ({ value: x.id, label: x.name }))} /> : null}
        </Card>
      ))}
      <TextBox label={t('ws.deliveryNote')} value={deliveryNote} onChangeText={setDeliveryNote} maxLength={80} />
      {shop.has('SUPPLIERS') ? (
        <>
          <NumberBox label={t('ws.paidNow')} value={pay} onChange={setPay} placeholder="0" suffix={shop.currency} />
          {num(pay) > 0 ? <Chips scroll={false} value={method} onChange={setMethod} options={(shop.ws.manifest.paymentMethods ?? ['CASH']).map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} /> : null}
        </>
      ) : null}
    </Sheet>
  );
}

function DocSheet({ id, onClose, onChanged, onReceive, onEdit }: { id: string; onClose: () => void; onChanged: () => void; onReceive: (d: PDoc) => void; onEdit: (d: PDoc) => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<PDoc>(`/api/shop/documents/${id}`);
  const [doc, setDoc] = useState<PDoc | null>(null);
  const d = doc ?? q.data;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [error, setError] = useState<string | null>(null);

  async function status(st: string) {
    if (st === 'CANCELLED' && !(await confirmAction(t('ws.cancelOrderTitle'), t('ws.cancelOrderText'), t('ws.cancelOrder'), t('common.cancel')))) return;
    try { setDoc(await shop.call<PDoc>(`/api/shop/purchase-orders/${id}/status`, { method: 'POST', body: { status: st } })); onChanged(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  async function pay() {
    try { setDoc(await shop.call<PDoc>(`/api/shop/documents/${id}/payments`, { method: 'POST', body: { id: uuid(), method, amount: Number(amount) } })); setAmount(''); toast(t('ws.saved')); onChanged(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  const po = d?.docType === 'PURCHASE_ORDER';
  return (
    <Sheet visible tall title={d ? `${po ? shop.v('purchaseOrder') : shop.v('goodsReceipt')} ${d.number}` : '…'} onClose={onClose}
      footer={d && po ? (
        <View style={{ gap: 8 }}>
          {['SENT', 'PARTIAL', 'DRAFT'].includes(d.status) ? <Btn icon="check" title={t('ws.receiveOrder')} onPress={() => onReceive(d)} /> : null}
          {d.status === 'DRAFT' ? <Btn variant="secondary" icon="truck" title={t('ws.markSent')} onPress={() => status('SENT')} /> : null}
          {d.status === 'DRAFT' ? <Btn variant="secondary" icon="pen" title={t('ws.edit')} onPress={() => onEdit(d)} /> : null}
          {['DRAFT', 'SENT'].includes(d.status) ? <Btn variant="danger" title={t('ws.cancelOrder')} onPress={() => status('CANCELLED')} /> : null}
        </View>
      ) : undefined}>
      {!d ? (q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <Skeleton rows={3} height={70} />) : (
        <>
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge tone={STATUS_TONE[d.status] ?? 'info'}>{t(`ws.s.${d.status}`)}</Badge>
            <ThemedText type="small">{d.partyName}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{formatDate(d.issuedAt, lang)}</ThemedText>
          </View>
          {d.dueDate ? <ThemedText type="small" themeColor="textSecondary">{t('ws.expectedDate')} : {formatDate(d.dueDate, lang)}</ThemedText> : null}
          {d.lines.map((l) => (
            <Card key={l.id} style={s.line}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText type="smallBold" numberOfLines={2}>{l.description}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{num(l.quantity)} × {shop.money(l.unitPrice)}{l.lotNumber ? ` · ${shop.v('lot')} ${l.lotNumber}` : ''}</ThemedText>
              </View>
              {po ? <Badge tone={num(l.receivedQuantity) >= num(l.quantity) ? 'success' : 'warning'}>{num(l.receivedQuantity)} / {num(l.quantity)}</Badge> : null}
              <ThemedText type="smallBold">{shop.money(l.lineTotal)}</ThemedText>
            </Card>
          ))}
          <View style={s.totalRow}><ThemedText type="smallBold" style={{ flex: 1 }}>{t('ws.total')}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 18 }}>{shop.money(d.total)}</ThemedText></View>
          {!po ? (
            <Card style={{ gap: 10 }}>
              <View style={s.totalRow}><ThemedText type="small" style={{ flex: 1 }}>{t('ws.paid')}</ThemedText><ThemedText type="smallBold">{shop.money(d.paidTotal)}</ThemedText></View>
              <View style={s.totalRow}><ThemedText type="small" style={{ flex: 1 }}>{t('ws.balanceDue')}</ThemedText><ThemedText type="smallBold" themeColor={num(d.balance) > 0 ? 'danger' : undefined}>{shop.money(d.balance)}</ThemedText></View>
              {num(d.balance) > 0 && shop.can('SUPPLIERS', 'update') ? (
                <>
                  <Chips scroll={false} value={method} onChange={setMethod} options={(shop.ws.manifest.paymentMethods ?? ['CASH']).map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} />
                  <NumberBox label={t('ws.amountPaid')} value={amount} onChange={setAmount} placeholder={String(d.balance)} suffix={shop.currency} />
                  <Btn title={t('ws.pay')} disabled={!(Number(amount) > 0)} onPress={pay} />
                </>
              ) : null}
            </Card>
          ) : null}
          {d.notes ? <ThemedText type="small" themeColor="textSecondary">{d.notes}</ThemedText> : null}
          {!po ? <Receipt doc={d} /> : null}
        </>
      )}
    </Sheet>
  );
}

type RGroup = { supplierId?: string; supplierName?: string; lines: { productId: string; name: string; stock: number; sold30: number; incoming: number; suggested: number; unitCost: number }[] };
/** Que commander ? Propose, fournisseur par fournisseur, ce qui manque ; le proprietaire ajuste avant d'envoyer. */
function Reorder({ onCreated }: { onCreated: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [cover, setCover] = useState('21');
  const q = useQuery<RGroup[]>(`/api/shop/reports/reorder?coverDays=${cover}`);
  const [edits, setEdits] = useState<Record<string, string | 'off'>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qty = (l: RGroup['lines'][number]) => (edits[l.productId] === undefined ? String(l.suggested) : edits[l.productId]);
  const included = (l: RGroup['lines'][number]) => edits[l.productId] !== 'off';
  async function create(g: RGroup) {
    setBusy(g.supplierId ?? ''); setError(null);
    try {
      const lines = g.lines.filter(included).map((l) => ({ productId: l.productId, quantity: num(qty(l)), unitCost: num(l.unitCost) })).filter((l) => l.quantity > 0);
      const doc = await shop.call<Doc>('/api/shop/purchase-orders', { method: 'POST', body: { id: uuid(), supplierId: g.supplierId, lines, send: false } });
      toast(t('ro.created', { number: doc.number ?? '' }));
      onCreated();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(null); }
  }
  if (q.error && !q.data) return <ErrorNote message={q.error} onRetry={q.reload} />;
  if (!q.data) return <Skeleton rows={3} height={110} />;
  return (
    <FlatList {...LIST_PROPS} data={q.data} keyExtractor={(g) => g.supplierId ?? 'none'} contentContainerStyle={{ gap: 12, paddingBottom: 100 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      ListHeaderComponent={(
        <View style={{ gap: 10, marginBottom: 6 }}>
          <Hint icon="wand-magic-sparkles">{t('ro.hint')}</Hint>
          <PdfButton path="/api/shop/pdf/reorder" params={{ coverDays: cover }} name="reapprovisionnement.pdf" />
          <SelectField required label={t('ro.cover')} value={cover} onChange={(v) => { setCover(v); setEdits({}); }} options={[7, 14, 21, 30, 45, 60].map((d) => ({ value: String(d), label: t('ro.days', { count: d }) }))} />
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
        </View>
      )}
      ListEmptyComponent={<Empty icon="check-double" title={t('ro.allGood')} text={t('ro.allGoodText')} />}
      renderItem={({ item: g }) => (
        <Card style={{ gap: 10 }}>
          <View style={s.line}>
            <Icon name="handshake" size={15} />
            <ThemedText type="smallBold" style={{ flex: 1 }}>{g.supplierName ?? t('ro.noSupplier')} · {shop.money(g.lines.filter(included).reduce((a, l) => a + num(qty(l)) * Number(l.unitCost), 0))}</ThemedText>
          </View>
          {!g.supplierId ? <Hint icon="triangle-exclamation" tone="warning">{t('ro.noSupplierHint')}</Hint> : null}
          {g.lines.map((l) => (
            <View key={l.productId} style={{ gap: 6, opacity: included(l) ? 1 : 0.5 }}>
              <Switch value={included(l)} onChange={(v) => setEdits((e) => ({ ...e, [l.productId]: v ? String(l.suggested) : 'off' }))} label={l.name} hint={`${t('ro.stock')} ${num(l.stock)} · ${t('ro.sold30')} ${num(l.sold30)}${num(l.incoming) ? ` · ${t('ro.incoming')} ${num(l.incoming)}` : ''}`} />
              {included(l) ? <NumberBox label={t('ro.toOrder')} value={qty(l)} onChange={(v) => setEdits((e) => ({ ...e, [l.productId]: v }))} /> : null}
            </View>
          ))}
          {g.supplierId && shop.can('PURCHASE_ORDERS', 'create') ? <Btn icon="truck" title={t('ro.create')} loading={busy === g.supplierId} disabled={busy === g.supplierId || !g.lines.some(included)} onPress={() => create(g)} /> : null}
        </Card>
      )} />
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
