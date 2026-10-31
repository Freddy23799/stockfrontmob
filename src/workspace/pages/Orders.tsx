import { useRef, useState } from 'react';
import { View } from 'react-native';

import { DateField } from '@/components/date-field';
import { SelectField } from '@/components/dynamic-fields';
import { PartyPicker, type Party } from '@/components/party-picker';
import { ProductPicker } from '@/components/product-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, NumberBox, Row, Screen, Sheet, Skeleton, Switch, TextBox, useToast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDate, num, uuid, type Product } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { qs, useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { activeUnits, defaultUnit } from '@/lib/units';
import type { PageProps } from '../registry';

type Order = { id: string; number: string; status: string; partyId: string; partyName: string; source: string; repName?: string; deliveryDate?: string; deliveryAddress?: string; notes?: string; total: number; late?: boolean; saleNumber?: string; deliveryNumber?: string; cancelReason?: string;
  lines?: { id: string; productId: string; unitId?: string; description: string; unitLabel?: string; quantity: number; unitPrice: number; lineTotal: number; short?: boolean }[] };
type Demand = { productId: string; name: string; unit?: string; baseQty: number; orders: number; inStock: number; bigUnit?: string; bigFactor?: number; shortage: number };
const TONE: Record<string, Tone> = { DRAFT: 'neutral', CONFIRMED: 'warning', PREPARED: 'warning', INVOICED: 'success', CANCELLED: 'neutral' };
const TABS = ['OPEN', 'INVOICED', 'CANCELLED', 'ALL'];
const SOURCES = ['COUNTER', 'REP', 'PHONE', 'WHATSAPP', 'OTHER'];
const METHODS = ['CASH', 'MOBILE_MONEY', 'TRANSFER', 'CARD', 'CHEQUE'];
const fmt = (v: unknown) => num(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
type FLine = { key: string; product: Product; unitId: string | null; quantity: string };

function OrderForm({ initial, onClose, onSaved }: { initial?: Order; onClose: () => void; onSaved: (queued: boolean, id?: string) => void }) {
  const { t } = useT();
  const shop = useShop();
  const offline = useOffline();
  const id = useRef(initial?.id ?? uuid());
  const [partyId, setPartyId] = useState<string | null>(initial?.partyId ?? null);
  const [party, setParty] = useState<Party | null>(null);
  const [source, setSource] = useState(initial?.source ?? 'COUNTER');
  const [rep, setRep] = useState(initial?.repName ?? '');
  const [date, setDate] = useState(initial?.deliveryDate ?? '');
  const [address, setAddress] = useState(initial?.deliveryAddress ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState<FLine[]>(() => (initial?.lines ?? []).map((l) => ({ key: l.id, product: { id: l.productId, name: l.description, unit: '', salePrice: 0, stock: 0, trackStock: false, isActive: true, units: [] } as Product, unitId: l.unitId ?? null, quantity: String(num(l.quantity)) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = Boolean(partyId) && lines.length > 0 && lines.every((l) => num(l.quantity) > 0);
  const patch = (key: string, c: Partial<FLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...c } : l)));
  async function save(confirm: boolean) {
    setBusy(true); setError(null);
    try {
      const body = { id: id.current, partyId, source, repName: rep || undefined, deliveryDate: date || undefined, deliveryAddress: address || undefined, notes: notes || undefined, confirm: confirm || undefined,
        lines: lines.map((l) => ({ productId: l.product.id, unitId: l.unitId || undefined, quantity: num(l.quantity) })) };
      const res = await offline.submit<Order>({ id: id.current, shopId: shop.shopId, method: initial ? 'PUT' : 'POST', path: initial ? `/api/shop/orders/${initial.id}` : '/api/shop/orders', body, kind: 'order', label: `${t('bv.or.label')} · ${party?.name ?? initial?.partyName ?? ''}` });
      onSaved(res.queued, res.queued ? undefined : res.data.id);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={initial ? `${t('bv.or.edit')} ${initial.number}` : t('bv.or.new')} onClose={onClose}
      footer={<View style={{ gap: 8 }}><Btn icon="check" title={busy ? t('ws.saving') : t('bv.or.saveConfirm')} loading={busy} disabled={!valid || busy} onPress={() => void save(true)} /><Btn variant="secondary" title={t('bv.or.saveDraft')} disabled={!valid || busy} onPress={() => void save(false)} /></View>}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <PartyPicker role="CUSTOMER" label={t('bv.or.customer')} value={partyId} selected={party} onChange={(pid, p) => { setPartyId(pid); setParty(p ?? null); }} />
      <SelectField required label={t('bv.or.source')} value={source} onChange={setSource} options={SOURCES.map((s) => ({ value: s, label: t(`bv.or.src.${s}`) }))} />
      <TextBox label={t('bv.or.rep')} value={rep} onChangeText={setRep} autoCapitalize="words" />
      <DateField label={t('bv.or.deliveryDate')} value={date} onChange={setDate} optional />
      <TextBox label={t('bv.or.address')} value={address} onChangeText={setAddress} autoCapitalize="sentences" />
      <ProductPicker label={t('bv.or.addProduct')} value={null} onChange={(p) => { if (p) setLines((ls) => [...ls, { key: uuid(), product: p, unitId: defaultUnit(p)?.id ?? null, quantity: '1' }]); }} />
      {lines.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('bv.or.noLines')}</ThemedText> : lines.map((l) => (
        <Card key={l.key} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ThemedText type="smallBold" style={{ flex: 1 }}>{l.product.name}</ThemedText><IconBtn size={34} name="xmark" label={t('ws.remove')} onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /></View>
          <NumberBox label={t('bv.or.qty')} value={l.quantity} onChange={(v) => patch(l.key, { quantity: v })} />
          {activeUnits(l.product).length > 0 ? <Chips value={l.unitId ?? ''} onChange={(v) => patch(l.key, { unitId: v || null })} options={[{ value: '', label: l.product.unit }, ...activeUnits(l.product).map((u) => ({ value: u.id, label: u.label }))]} /> : null}
        </Card>
      ))}
      <ThemedText type="small" themeColor="textSecondary">{t('bv.or.priceAuto')}</ThemedText>
      <TextBox label={t('bv.or.notes')} value={notes} onChangeText={setNotes} multiline autoCapitalize="sentences" />
    </Sheet>
  );
}

function OrderSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Order>(`/api/shop/orders/${id}`);
  const [o, setO] = useState<Order | null>(null);
  const d = o ?? q.data;
  const [mode, setMode] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [pay, setPay] = useState(false);
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState('');
  const [delivery, setDelivery] = useState(shop.has('DELIVERIES'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saleId = useRef(uuid());
  const payId = useRef(uuid());
  const canUpdate = shop.can('CUSTOMER_ORDERS', 'update');
  async function act(path: string, body?: unknown, done?: string) {
    setBusy(true); setError(null);
    try { const res = await shop.call<Order>(`/api/shop/orders/${id}/${path}`, { method: 'POST', body }); setO(res); setMode(null); if (done) toast(done); onChanged(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  const editable = d ? ['DRAFT', 'CONFIRMED', 'PREPARED'].includes(d.status) : false;
  return (
    <Sheet visible tall title={d ? `${t('bv.or.label')} ${d.number}` : '…'} onClose={onClose}
      footer={d && canUpdate ? (mode === 'invoice' ? <Btn icon="check" title={busy ? t('ws.saving') : t('bv.or.invoice')} loading={busy} disabled={busy} onPress={() => void act('invoice', { saleId: saleId.current, payments: pay && num(amount) > 0 ? [{ id: payId.current, method, amount: num(amount) }] : undefined, createDelivery: delivery || undefined }, undefined)} />
        : mode === 'cancel' ? <Btn variant="secondary" icon="xmark" title={t('bv.or.cancelConfirm')} disabled={!reason.trim() || busy} onPress={() => void act('cancel', { reason: reason.trim() })} />
        : <View style={{ gap: 8 }}>
          {d.status === 'DRAFT' ? <Btn title={t('bv.or.confirm')} disabled={busy} onPress={() => void act('confirm')} /> : null}
          {d.status === 'CONFIRMED' ? <Btn variant="secondary" title={t('bv.or.prepared')} disabled={busy} onPress={() => void act('prepared')} /> : null}
          {d.status === 'CANCELLED' ? <Btn variant="secondary" title={t('bv.or.reopen')} disabled={busy} onPress={() => void act('reopen')} /> : null}
          {editable && d.status !== 'DRAFT' ? <Btn icon="check" title={t('bv.or.invoice')} onPress={() => { setAmount(String(num(d.total))); setMode('invoice'); }} /> : null}
          {editable ? <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Btn small variant="secondary" title={t('bv.or.edit')} onPress={() => setMode('edit')} /></View><View style={{ flex: 1 }}><Btn small variant="secondary" title={t('bv.or.cancel')} onPress={() => setMode('cancel')} /></View></View> : null}
        </View>) : undefined}>
      {!d ? <Skeleton rows={3} height={70} /> : (
        <>
          {q.error ? <ErrorNote message={q.error} onRetry={() => void q.reload()} /> : null}
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge tone={TONE[d.status] ?? 'neutral'}>{t(`bv.or.s.${d.status}`)}</Badge>{d.late ? <Badge tone="danger">{t('bv.or.late')}</Badge> : null}
            <ThemedText type="smallBold">{d.partyName}</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">{[t(`bv.or.src.${d.source}`), d.repName, d.deliveryDate && formatDate(d.deliveryDate, lang), d.deliveryAddress, d.saleNumber && t('bv.or.sale', { number: d.saleNumber }), d.deliveryNumber && t('bv.or.delivery', { number: d.deliveryNumber })].filter(Boolean).join(' · ')}</ThemedText>
          {d.cancelReason ? <Hint icon="circle-xmark" tone="danger">{d.cancelReason}</Hint> : null}
          {(d.lines ?? []).map((l) => <Row key={l.id} title={l.description} subtitle={`${fmt(l.quantity)} ${l.unitLabel ?? ''} × ${shop.money(l.unitPrice)}${l.short ? ` · ${t('bv.or.short')}` : ''}`} tone={l.short ? 'danger' : undefined} right={<ThemedText type="smallBold">{shop.money(l.lineTotal)}</ThemedText>} />)}
          <View style={{ flexDirection: 'row' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{t('bv.or.total')}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 18 }}>{shop.money(d.total)}</ThemedText></View>
          {mode === 'cancel' ? <TextBox label={t('bv.or.cancelReason')} value={reason} onChangeText={setReason} multiline autoCapitalize="sentences" /> : null}
          {mode === 'invoice' ? (
            <Card style={{ gap: 10 }}>
              <ThemedText type="small" themeColor="textSecondary">{t('bv.or.invoiceHelp')}</ThemedText>
              <Switch value={pay} onChange={setPay} label={t('bv.or.payNow')} />
              {pay ? <><NumberBox label={t('bv.rb.amount')} value={amount} onChange={setAmount} /><SelectField required label={t('bv.dp.refundMethod')} value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} /></> : null}
              {shop.has('DELIVERIES') ? <Switch value={delivery} onChange={setDelivery} label={t('bv.or.createDelivery')} /> : null}
            </Card>
          ) : null}
          {mode === 'edit' ? <OrderForm initial={d} onClose={() => setMode(null)} onSaved={() => { setMode(null); toast(t('bv.or.saved')); void q.reload(); onChanged(); }} /> : null}
        </>
      )}
    </Sheet>
  );
}

function DemandSheet({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [until, setUntil] = useState('');
  const q = useQuery<Demand[]>(`/api/shop/orders/demand${qs({ until: until || undefined })}`);
  return (
    <Sheet visible tall title={t('bv.or.demand')} onClose={onClose}>
      <ThemedText type="small" themeColor="textSecondary">{t('bv.or.demandHelp')}</ThemedText>
      <DateField label={t('bv.or.until')} value={until} onChange={setUntil} optional />
      {q.error ? <ErrorNote message={q.error} onRetry={() => void q.reload()} /> : null}
      {!q.data ? <Skeleton rows={3} height={64} /> : q.data.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('bv.or.demandEmpty')}</ThemedText> : q.data.map((r) => (
        <Row key={r.productId} title={r.name} subtitle={`${t('bv.or.orders', { count: r.orders })} · ${t('bv.or.inStock', { qty: fmt(r.inStock) })}`} tone={num(r.shortage) > 0 ? 'danger' : undefined}
          right={<View style={{ alignItems: 'flex-end', gap: 4 }}><ThemedText type="smallBold">{r.bigUnit && num(r.bigFactor) > 1 ? `${fmt(num(r.baseQty) / num(r.bigFactor))} ${r.bigUnit}` : `${fmt(r.baseQty)} ${r.unit ?? ''}`}</ThemedText>{num(r.shortage) > 0 ? <Badge tone="danger">{t('bv.or.shortage', { qty: fmt(r.shortage) })}</Badge> : null}</View>} />
      ))}
    </Sheet>
  );
}

/** Commandes clients et pre-ventes : saisie (meme hors ligne), preparation par date, facturation en vraie vente. */
export default function Orders({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const [view, setView] = useState('OPEN');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(false);
  const [demand, setDemand] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = useInfinite<Order>('/api/shop/orders', { status: view === 'ALL' ? undefined : view, q: q || undefined });
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('bv.or.subtitle')} onRefresh={() => void list.reload()} refreshing={list.refreshing} onEndReached={list.loadMore}
      right={shop.can('CUSTOMER_ORDERS', 'create') ? <IconBtn name="plus" tone="primary" label={t('bv.or.new')} onPress={() => setForm(true)} /> : undefined}>
      <Btn variant="secondary" small icon="clipboard-list" title={t('bv.or.demand')} onPress={() => setDemand(true)} />
      <TextBox label={t('bv.or.search')} value={q} onChangeText={setQ} autoCapitalize="none" />
      <Chips value={view} onChange={setView} options={TABS.map((s) => ({ value: s, label: t(`bv.or.tab.${s}`) }))} />
      {list.error ? <ErrorNote message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={68} /> : list.items.length === 0 ? <Empty icon="clipboard-list" title={t('bv.or.empty')} text={t('bv.or.emptyText')} /> : list.items.map((x) => (
        <Row key={x.id} title={`${x.number} · ${x.partyName}`} subtitle={[x.repName, x.deliveryDate && formatDate(x.deliveryDate, lang)].filter(Boolean).join(' · ')} onPress={() => setOpen(x.id)}
          right={<View style={{ alignItems: 'flex-end', gap: 4 }}><ThemedText type="smallBold">{shop.money(x.total)}</ThemedText><Badge tone={x.late ? 'danger' : TONE[x.status] ?? 'neutral'}>{x.late ? t('bv.or.late') : t(`bv.or.s.${x.status}`)}</Badge></View>} />
      ))}
      {list.hasMore ? <Btn variant="secondary" small loading={list.loadingMore} title={t('list.more')} onPress={list.loadMore} /> : null}
      {form ? <OrderForm onClose={() => setForm(false)} onSaved={(queued, oid) => { setForm(false); toast(queued ? t('bv.x.queued') : t('bv.or.saved')); if (oid) setOpen(oid); void list.reload(); }} /> : null}
      {demand ? <DemandSheet onClose={() => setDemand(false)} /> : null}
      {open ? <OrderSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}
