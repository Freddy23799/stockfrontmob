import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, View } from 'react-native';

import { DateField, today } from '@/components/date-field';
import { PaymentPanel } from '@/components/payment-panel';
import { ProductPicker } from '@/components/product-picker';
import { ClientFinder, MemberBar, SheetForm, useMembers, type Client } from '@/components/tailor-parts';
import { appendPhoto, pickPhoto } from '@/lib/photo';
import { FabricSearchSheet } from './TailorFabrics';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, NumberBox, Screen, SectionTitle, Sheet, Skeleton, Stack, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { num, uuid, type Product } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { initPay, resetPay, settle } from '@/lib/payments';
import { qs, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { applyOrders, patchOrder, useTailorOverlay } from '@/lib/tailor-local';
import type { PageProps } from '../registry';

const API = '/api/shop/tailor';
const STAGES = ['RECEIVED', 'CUTTING', 'SEWING', 'FITTING', 'READY'];
type Item = { id: string; garment: string; quantity: number; unitPrice: number; lineTotal: number; fabric?: string | null; details?: string | null; memberName?: string | null; fabricName?: string | null; fabricMeters?: number | null; fabricTotal?: number };
export type Model = { id: string; name: string; kind: string; defaultPrice: number; defaultDays: number; fabricMeters?: number | null; active: boolean; parts: { partId: string; quantity: number }[] };
type Photo = { id: string; kind: string; caption?: string | null; image?: { variants: Record<string, { webp: string }> } | null };
type Fit = { id: string; scheduledAt: string; status: string; adjustments?: string | null };
type Order = { id: string; number: string; kind: string; status: string; partyName: string; phone?: string | null; workerId?: string | null; workerName?: string | null; workerColor?: string | null; promisedOn?: string | null;
  overdue: boolean; daysLate: number; priority?: string; partyId?: string; fabricBy: string; notes?: string | null; total: number; paid: number; balance: number; items?: Item[]; photos?: Photo[]; fittings?: Fit[]; events?: { id: string; kind: string; toStatus?: string | null; at: string }[]; local?: boolean };
type Worker = { id: string; name: string; active: boolean };
type Board = { counts: Record<string, number>; late: number; dueToday: number; readyWaiting: number; fittingsToday: number; urgent: number };

const tone = (s: string) => (s === 'READY' ? 'success' : s === 'CANCELLED' ? 'danger' : s === 'DELIVERED' ? 'info' : 'warning');

// ---------------------------------------------------------------------------------------------------------------- nouvelle commande
type Line = { key: number; memberId: string | null; model: Model | null; garment: string; qty: string; price: string; fabric: string; details: string; fabricProduct: Product | null; meters: string };
let seq = 1;
const blank = (memberId: string | null, extra: Partial<Line> = {}): Line => ({ key: seq++, memberId, model: null, garment: '', qty: '1', price: '', fabric: '', details: '', fabricProduct: null, meters: '', ...extra });

export function NewOrder({ workers, models, preParty, onClose, onCreated }: { workers: Worker[]; models: Model[]; preParty?: Client | null; onClose: () => void; onCreated: (queued: boolean, o?: Order) => void }) {
  const { t } = useT();
  const shop = useShop();
  const outbox = useOffline();
  const methods: string[] = shop.ws.manifest.paymentMethods?.length ? shop.ws.manifest.paymentMethods : ['CASH'];
  const [kind, setKind] = useState<'CUSTOM' | 'ALTERATION'>('CUSTOM');
  const [party, setParty] = useState<Client | null>(preParty ?? null);
  const partyId = party?.id ?? null;
  const [members, reloadMembers] = useMembers(partyId);
  const [who, setWho] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState('');
  const [promised, setPromised] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Line[]>([]);
  const [fabricAll, setFabricAll] = useState<Product | null>(null);
  const [fabricFor, setFabricFor] = useState<number | null>(null);
  const [check, setCheck] = useState<{ missing: { modelId: string; memberId?: string | null; name: string; memberName?: string | null; keys: string[] }[]; days: number } | null>(null);
  const [sheet, setSheet] = useState<{ memberId: string | null; memberName?: string; highlight: string[] } | null>(null);
  const [pay, setPay] = useState(() => initPay(methods[0]));
  const touched = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orderId = useRef(uuid());
  const reset = () => { orderId.current = uuid(); };
  const withMeasures = shop.has('MEASUREMENTS');
  const usable = models.filter((m) => m.active && (kind === 'ALTERATION' ? m.kind === 'ALTERATION' : m.kind !== 'ALTERATION'));
  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.name : party?.name);
  const setLine = (k: number, patch: Partial<Line>) => { reset(); setItems((a) => a.map((i) => (i.key === k ? { ...i, ...patch } : i))); };

  function addModel(m: Model) {
    reset();
    const parts = m.kind === 'SET' ? m.parts.flatMap((p) => Array.from({ length: p.quantity }, () => models.find((x) => x.id === p.partId)).filter(Boolean) as Model[]) : [m];
    setItems((a) => [...a, ...parts.map((x) => blank(who, { model: x, garment: x.name, price: x.defaultPrice > 0 ? String(x.defaultPrice) : '', meters: x.fabricMeters ? String(x.fabricMeters) : '', fabricProduct: fabricAll && x.fabricMeters ? fabricAll : null }))]);
  }
  const sig = JSON.stringify(items.filter((i) => i.model).map((i) => [i.model?.id, i.memberId]));
  useEffect(() => {
    if (!partyId || !withMeasures || kind === 'ALTERATION' || items.every((i) => !i.model)) return undefined;
    let live = true;
    shop.call<NonNullable<typeof check>>(`${API}/models/check`, { method: 'POST', body: { partyId, items: items.filter((i) => i.model).map((i) => ({ modelId: i.model?.id, memberId: i.memberId || undefined })) } }).then((r) => { if (live) setCheck(r); }).catch(() => {});
    return () => { live = false; };
  }, [sig, partyId, withMeasures, kind, sheet]); // eslint-disable-line react-hooks/exhaustive-deps

  const fabricCost = (i: Line) => (i.fabricProduct ? num(i.fabricProduct.salePrice) * num(i.meters) * (Number(i.qty) || 1) : 0);
  const due = items.reduce((a, i) => a + num(i.price) * (Number(i.qty) || 1) + fabricCost(i), 0);
  const minPct = kind === 'CUSTOM' ? num((shop.ws.config as Record<string, unknown> | undefined)?.minDepositPercent ?? 30) : 0;
  const minDeposit = Math.ceil((due * minPct) / 100);
  useEffect(() => { if (!touched.current) setPay((p) => (p.split ? p : { ...p, rows: [{ ...p.rows[0], amount: minDeposit ? String(minDeposit) : '0' }] })); }, [minDeposit]);
  const sett = settle(pay, due);
  const paidNow = sett.payments.reduce((a, p) => a + p.amount, 0);
  const valid = !!partyId && items.length > 0 && items.every((i) => i.garment.trim() && i.price !== '' && (!i.fabricProduct || num(i.meters) > 0)) && sett.valid && paidNow + 0.001 >= minDeposit;
  const people = [...new Set(items.map((i) => i.memberId ?? ''))];

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = { id: orderId.current, partyId, kind, workerId: workerId || undefined, promisedOn: promised || undefined, priority: urgent ? 'URGENT' : 'NORMAL', notes: notes.trim() || undefined,
        items: items.map((i) => ({ garment: i.garment.trim(), modelId: i.model?.id, memberId: i.memberId || undefined, quantity: Number(i.qty) || 1, unitPrice: num(i.price), fabric: i.fabric.trim() || undefined, details: i.details.trim() || undefined,
          fabricProductId: i.fabricProduct?.id, fabricMeters: i.fabricProduct ? num(i.meters) : undefined })),
        payments: sett.payments.map((p) => ({ id: uuid(), method: p.method, amount: p.amount, reference: p.reference })) };
      const res = await outbox.submit({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `${API}/orders`, body, queuedBody: { ...body, offline: true, at: new Date().toISOString() }, kind: 'tailor', label: `${t('tl.newOrder')} · ${items[0].garment.trim()}`, group: body.id });
      if (res.queued) {
        patchOrder(shop.shopId, body.id, { local: true, number: t('tl.pendingNumber'), kind, status: 'RECEIVED', priority: body.priority, partyName: party?.name ?? t('tl.queuedClient'), promisedOn: promised || null, total: due, balance: Math.max(0, due - paidNow),
          items: body.items.map((i) => ({ id: uuid(), garment: i.garment, quantity: i.quantity })), overdue: false, daysLate: 0 });
        onCreated(true);
      } else onCreated(false, res.data as Order);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  return (
    <Sheet visible tall title={t('tl.newOrder')} onClose={onClose} footer={<Btn icon="check" title={busy ? t('ws.saving') : t('tl.createOrder')} loading={busy} disabled={!valid} onPress={() => void submit()} />}>
      <View style={{ gap: 12 }}>
        {error ? <ErrorNote message={error} /> : null}
        <Chips options={[{ value: 'CUSTOM', label: t('tl.kind.CUSTOM') }, { value: 'ALTERATION', label: t('tl.kind.ALTERATION') }]} value={kind} onChange={(v) => { reset(); setKind(v); setItems([]); }} />
        <SectionTitle title={`1 · ${t('tl.step.client')}`} />
        <ClientFinder value={partyId} selected={party} onChange={(id, c) => { reset(); setParty(c); setWho(null); setItems([]); setCheck(null); }} />
        {partyId ? (
          <>
            <SectionTitle title={`2 · ${t('tl.step.pieces')}`} hint={t('tl.step.piecesHelp')} />
            <MemberBar partyId={partyId} partyName={party?.name} memberId={who} onChange={setWho} members={members} reload={reloadMembers} label={t('tl.mb.pickFor')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {usable.map((m) => <Btn key={m.id} small variant="secondary" title={`${m.name}${m.kind === 'SET' ? ` (${m.parts.length})` : ''}`} onPress={() => addModel(m)} />)}
              <Btn small variant="secondary" icon="plus" title={t('tl.freePiece')} onPress={() => { reset(); setItems((a) => [...a, blank(who)]); }} />
            </View>
            {models.length === 0 ? <Hint>{t('tl.noModelsHint')}</Hint> : null}
            {items.length === 0 ? <ThemedText themeColor="textSecondary">{t('tl.pickOne')}</ThemedText> : null}
            {people.map((pid) => (
              <View key={pid || 'self'} style={{ gap: 8, borderLeftWidth: 3, borderLeftColor: '#6366f1', paddingLeft: 10 }}>
                <ThemedText type="smallBold">{nameOf(pid || null) ?? t('tl.mb.self')}</ThemedText>
                {items.filter((i) => (i.memberId ?? '') === pid).map((i) => (
                  <Card key={i.key}>
                    <View style={{ gap: 8 }}>
                      <TextBox label={t('tl.garment')} value={i.garment} onChangeText={(v) => setLine(i.key, { garment: v })} placeholder={t(kind === 'CUSTOM' ? 'tl.garmentHint' : 'tl.alterHint')} maxLength={160} />
                      <NumberBox label={t('tl.unitPrice')} value={i.price} onChange={(v) => setLine(i.key, { price: v })} />
                      <NumberBox label={t('tl.qty')} value={i.qty} onChange={(v) => setLine(i.key, { qty: v })} />
                      <TextBox label={t('tl.fabric')} value={i.fabric} onChangeText={(v) => setLine(i.key, { fabric: v })} placeholder={t('tl.fabricHint')} maxLength={200} />
                      <TextBox label={t('tl.details')} value={i.details} onChangeText={(v) => setLine(i.key, { details: v })} placeholder={t('tl.detailsHint')} maxLength={800} />
                      {shop.has('STOCK') ? (
                        i.fabricProduct ? (
                          <View style={{ gap: 8 }}>
                            <ThemedText type="smallBold">{i.fabricProduct.name}</ThemedText>
                            <NumberBox label={t('tl.meters')} value={i.meters} onChange={(v) => setLine(i.key, { meters: v })} />
                            <ThemedText type="small" themeColor="textSecondary">{shop.money(fabricCost(i))}</ThemedText>
                            <Btn small variant="secondary" title={t('tl.removeStockFabric')} onPress={() => setLine(i.key, { fabricProduct: null, meters: '' })} />
                          </View>
                        ) : (
                          <View style={{ gap: 8 }}>
                            <ProductPicker label={t('tl.stockFabric')} value={null} stockedOnly onChange={(p) => { if (p) { setFabricAll((f) => f ?? p); setLine(i.key, { fabricProduct: p, meters: i.meters || String(i.model?.fabricMeters ?? '') }); } }} />
                            {shop.has('FABRIC_SEARCH') ? <Btn small variant="secondary" icon="camera" title={t('tl.fs.byPhoto')} onPress={() => setFabricFor(i.key)} /> : null}
                          </View>
                        )
                      ) : null}
                      <Btn small variant="secondary" title={t('ws.delete')} onPress={() => { reset(); setItems((a) => a.filter((x) => x.key !== i.key)); }} />
                    </View>
                  </Card>
                ))}
              </View>
            ))}
            {fabricAll && items.length > 1 && items.some((i) => !i.fabricProduct) ? <Btn small variant="secondary" icon="shirt" title={t('tl.sameFabric', { name: fabricAll.name })} onPress={() => { reset(); setItems((a) => a.map((i) => (i.fabricProduct ? i : { ...i, fabricProduct: fabricAll, meters: i.meters || String(i.model?.fabricMeters ?? '1') }))); }} /> : null}
            {check && check.missing.length > 0 ? (
              <Hint tone="warning" title={t('tl.missingTitle')}>
                <View style={{ gap: 8 }}>{check.missing.map((m) => (
                  <View key={`${m.modelId}:${m.memberId ?? ''}`} style={{ gap: 4 }}>
                    <ThemedText type="small">{m.memberName ?? party?.name} · {m.name} : {m.keys.map((k) => t(`tl.m.${k}`)).join(', ')}</ThemedText>
                    {shop.can('MEASUREMENTS', 'create') ? <Btn small variant="secondary" title={t('tl.takeMeasures')} onPress={() => setSheet({ memberId: m.memberId ?? null, memberName: m.memberName ?? party?.name, highlight: m.keys })} /> : null}
                  </View>
                ))}</View>
              </Hint>
            ) : null}
            <SectionTitle title={`3 · ${t('tl.step.dates')}`} />
            <DateField label={t('tl.promisedOn')} value={promised} onChange={setPromised} min={today()} optional />
            {check && check.days > 0 && !promised ? <Btn small variant="secondary" title={t('tl.suggestDate', { n: check.days })} onPress={() => setPromised(addDays(check.days))} /> : null}
            {workers.length > 0 ? <Chips options={[{ value: '', label: t('tl.unassigned') }, ...workers.filter((w) => w.active).map((w) => ({ value: w.id, label: w.name }))]} value={workerId} onChange={setWorkerId} /> : null}
            <Switch label={t('tl.urgent')} hint={t('tl.urgentHelp')} value={urgent} onChange={setUrgent} />
            <TextBox label={t('tl.notes')} value={notes} onChangeText={setNotes} multiline maxLength={1500} />
            <Hint icon="camera">{t('tl.photosAfter')}</Hint>
            <SectionTitle title={`4 · ${t('tl.step.pay')}`} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="smallBold">{t('tl.total')}</ThemedText><ThemedText type="smallBold">{shop.money(due)}</ThemedText></View>
            {minDeposit > 0 ? <ThemedText type="small" themeColor="textSecondary">{t('tl.minDeposit', { amount: shop.money(minDeposit), pct: minPct })}</ThemedText> : null}
            <PaymentPanel pay={pay} setPay={(p) => { reset(); touched.current = true; setPay(p); }} due={Math.max(due, 0)} methods={methods} res={sett} money={shop.money} currency={shop.currency} />
            {due - paidNow > 0.001 ? <ThemedText type="small" themeColor="textSecondary">{t('tl.balanceLeft', { amount: shop.money(due - paidNow) })}</ThemedText> : null}
          </>
        ) : null}
      </View>
      {fabricFor != null ? <FabricSearchSheet onClose={() => setFabricFor(null)} onPick={(m) => { const p = { id: m.productId, name: m.name, salePrice: m.salePrice, unit: m.unit, stock: m.stock, trackStock: true, isActive: true } as Product; const it = items.find((x) => x.key === fabricFor); setFabricAll((f) => f ?? p); setLine(fabricFor, { fabricProduct: p, meters: it?.meters || String(it?.model?.fabricMeters ?? '') }); setFabricFor(null); }} /> : null}
      {sheet && partyId ? <SheetForm partyId={partyId} memberId={sheet.memberId} memberName={sheet.memberName} highlight={sheet.highlight} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); setCheck(null); }} /> : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------------------------- detail
function PhotosBlock({ o, canEdit, onChanged }: { o: Order; canEdit: boolean; onChanged: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [kind, setKind] = useState('FABRIC');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function add(source: 'camera' | 'library') {
    setBusy(true); setError(null);
    try {
      const photo = await pickPhoto(source);
      if (!photo) return;
      const fd = new FormData();
      await appendPhoto(fd, 'file', photo); fd.append('kind', kind); fd.append('mediaId', uuid());
      await shop.call(`${API}/orders/${o.id}/photos`, { method: 'POST', body: fd });
      onChanged();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  async function remove(id: string) { try { await shop.call(`${API}/orders/${o.id}/photos/${id}`, { method: 'DELETE' }); onChanged(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } }
  const photos = o.photos ?? [];
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle title={t('tl.photos')} />
      {error ? <ErrorNote message={error} /> : null}
      {photos.length === 0 ? <ThemedText themeColor="textSecondary">{t('tl.noPhoto')}</ThemedText> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{photos.map((p) => {
          const v = p.image ? (p.image.variants.sm ?? Object.values(p.image.variants)[0]) : null;
          return <View key={p.id} style={{ gap: 4 }}>{v ? <Image source={{ uri: v.webp }} style={{ width: 96, height: 96, borderRadius: 10 }} /> : null}<ThemedText type="small" themeColor="textSecondary">{t(`tl.photo.${p.kind}`)}</ThemedText>{canEdit ? <Btn small variant="secondary" title={t('ws.delete')} onPress={() => void remove(p.id)} /> : null}</View>;
        })}</View>
      )}
      {canEdit && photos.length < 8 ? (
        <View style={{ gap: 8 }}>
          <Chips options={['FABRIC', 'MODEL', 'OTHER'].map((k) => ({ value: k, label: t(`tl.photo.${k}`) }))} value={kind} onChange={setKind} />
          <View style={{ flexDirection: 'row', gap: 8 }}><Btn small icon="camera" title={busy ? t('ws.saving') : t('tl.addPhoto')} loading={busy} onPress={() => void add('camera')} /><Btn small variant="secondary" title={t('tl.fs.library')} onPress={() => void add('library')} /></View>
        </View>
      ) : null}
    </View>
  );
}

function Detail({ id, local, workers, onClose, onChanged }: { id: string; local: Order | null; workers: Worker[]; onClose: () => void; onChanged: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const outbox = useOffline();
  const toast = useToast();
  const q = useQuery<Order>(local ? null : `${API}/orders/${id}`);
  const [panel, setPanel] = useState<null | 'deliver' | 'pay' | 'cancel' | 'fitting'>(null);
  const [reason, setReason] = useState('');
  const [fitDate, setFitDate] = useState('');
  const [sheet, setSheet] = useState(false);
  const methods: string[] = shop.ws.manifest.paymentMethods?.length ? shop.ws.manifest.paymentMethods : ['CASH'];
  const [pay, setPay] = useState(() => initPay(methods[0]));
  const [allowUnpaid, setAllowUnpaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const o = q.data;
  const canEdit = shop.can('TAILOR_ORDERS', 'update');
  const manager = shop.owner || shop.can('PRODUCTS', 'update');
  const due = o ? num(o.balance) : 0;
  const sett = settle(pay, due);
  const err = (e: unknown) => setError(e instanceof ApiError ? e.message : t('common.network'));
  const refresh = async () => { await q.reload(); onChanged(); };
  async function act(fn: () => Promise<void>) { setBusy(true); setError(null); try { await fn(); } catch (e) { err(e); } finally { setBusy(false); } }

  if (local) return <Sheet visible title={local.number} onClose={onClose}><Hint>{t('tl.pendingInfo')}</Hint></Sheet>;
  if (!o) return <Sheet visible title="" onClose={onClose}>{q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <Skeleton rows={3} />}</Sheet>;
  const open = STAGES.includes(o.status);
  const at = STAGES.indexOf(o.status);
  const queue = async (path: string, body: Record<string, unknown>, label: string, patch?: Record<string, unknown>) => {
    const res = await outbox.submit({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `${API}/orders/${o.id}/${path}`, body, queuedBody: { ...body, offline: true, at: new Date().toISOString() }, kind: 'tailor', label: `${o.number} · ${label}`, group: o.id });
    if (res.queued) { if (patch) patchOrder(shop.shopId, o.id, patch); toast(t('tl.queuedShort')); }
  };
  const go = (status: string) => act(async () => { await queue('status', { status, eventId: uuid() }, t(`tl.st.${status}`), { status }); await refresh(); });
  const deliver = () => act(async () => {
    await queue('deliver', { id: uuid(), payments: due > 0 ? sett.payments.map((p) => ({ id: uuid(), method: p.method, amount: p.amount, reference: p.reference })) : [], allowUnpaid: allowUnpaid || undefined }, t('tl.st.DELIVERED'), { status: 'DELIVERED', balance: 0 });
    setPanel(null); setPay((p) => resetPay(p)); toast(t('tl.delivered')); await refresh();
  });
  const payBalance = () => act(async () => {
    for (const p of sett.payments) await queue('pay', { id: uuid(), method: p.method, amount: p.amount, reference: p.reference }, t('tl.payShort'), { balance: Math.max(0, due - p.amount) });
    setPanel(null); setPay((p) => resetPay(p)); toast(t('tl.paid')); await refresh();
  });
  const cancel = () => act(async () => { await shop.call(`${API}/orders/${o.id}/cancel`, { method: 'POST', body: { reason: reason.trim() } }); setPanel(null); await refresh(); });
  const addFit = () => act(async () => { await queue('fittings', { id: uuid(), scheduledAt: new Date(`${fitDate}T10:00:00`).toISOString() }, t('tl.planFitting')); setFitDate(''); setPanel(null); await refresh(); });
  const doneFit = (fid: string, status: string) => act(async () => { await shop.call(`${API}/orders/${o.id}/fittings/${fid}/done`, { method: 'POST', body: { status } }); await refresh(); });
  const assign = (wid: string) => act(async () => { await shop.call(`${API}/orders/${o.id}/assign`, { method: 'POST', body: { workerId: wid || null } }); await refresh(); });
  const setPriority = (p: string) => act(async () => { await shop.call(`${API}/orders/${o.id}/priority`, { method: 'POST', body: { priority: p } }); await refresh(); });
  const groups = (o.items ?? []).reduce<Record<string, Item[]>>((m, i) => { const k = i.memberName ?? ''; (m[k] ??= []).push(i); return m; }, {});

  return (
    <Sheet visible tall title={`${o.number} · ${o.partyName}`} onClose={onClose}
      footer={<View style={{ gap: 8 }}>
        {o.status === 'READY' && canEdit ? <Btn icon="check" title={t('tl.deliver')} onPress={() => setPanel('deliver')} /> : null}
        {open && canEdit && o.status !== 'READY' ? <Btn title={t('tl.moveTo', { stage: t(`tl.st.${STAGES[at + 1]}`) })} loading={busy} onPress={() => void go(STAGES[at + 1])} /> : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {open && canEdit && at > 0 ? <Btn small variant="secondary" title={t('tl.back')} onPress={() => void go(STAGES[at - 1])} /> : null}
          <PdfButton small path={`/api/shop/pdf/tailor/orders/${o.id}/receipt`} name={`recu-${o.number}.pdf`} label={t('tl.pdf.receipt')} />
          <PdfButton small path={`/api/shop/pdf/tailor/orders/${o.id}`} name={`commande-${o.number}.pdf`} label={t('tl.pdf.order')} />
          {open && shop.can('TAILOR_ORDERS', 'delete') ? <Btn small variant="secondary" title={t('tl.cancelOrder')} onPress={() => setPanel('cancel')} /> : null}
        </View></View>}>
      <View style={{ gap: 12 }}>
        {error ? <ErrorNote message={error} /> : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Badge tone={tone(o.status)}>{t(`tl.st.${o.status}`)}</Badge><Badge>{t(`tl.kind.${o.kind}`)}</Badge>{o.priority === 'URGENT' ? <Badge tone="danger">{t('tl.urgent')}</Badge> : null}{o.overdue ? <Badge tone="danger">{t('tl.lateDays', { n: o.daysLate })}</Badge> : null}</View>
        {open && canEdit ? <Btn small variant="secondary" title={o.priority === 'URGENT' ? t('tl.notUrgent') : t('tl.markUrgent')} onPress={() => void setPriority(o.priority === 'URGENT' ? 'NORMAL' : 'URGENT')} /> : null}
        {open ? <View style={{ flexDirection: 'row', gap: 3 }}>{STAGES.map((s, i) => <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < at ? '#16a34a' : i === at ? '#6366f1' : '#9ca3af55' }} />)}</View> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {[[t('tl.promisedOn'), o.promisedOn ?? '—'], [t('tl.total'), shop.money(o.total)], [t('tl.paidSoFar'), shop.money(o.paid)], [t('tl.balance'), shop.money(o.balance)]].map(([k, v]) => (
            <View key={k}><ThemedText type="small" themeColor="textSecondary">{k}</ThemedText><ThemedText type="smallBold">{v}</ThemedText></View>
          ))}
        </View>
        {open && canEdit && workers.length > 0 ? <Chips options={[{ value: '', label: t('tl.unassigned') }, ...workers.filter((w) => w.active || w.id === o.workerId).map((w) => ({ value: w.id, label: w.name }))]} value={o.workerId ?? ''} onChange={(v) => void assign(v)} /> : null}
        <SectionTitle title={t('tl.garments')} />
        {Object.entries(groups).map(([person, list]) => (
          <View key={person} style={{ gap: 6 }}>
            {Object.keys(groups).length > 1 ? <ThemedText type="smallBold">{person || o.partyName}</ThemedText> : null}
            {list.map((i) => <Card key={i.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{i.garment}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</ThemedText><ThemedText type="smallBold">{shop.money(i.lineTotal)}</ThemedText></View>
              {i.fabric ? <ThemedText type="small" themeColor="textSecondary">{t('tl.fabric')} : {i.fabric}</ThemedText> : null}
              {i.fabricName ? <ThemedText type="small" themeColor="textSecondary">{i.fabricName} · {Number(i.fabricMeters)} m · {shop.money(i.fabricTotal ?? 0)}</ThemedText> : null}
              {i.details ? <ThemedText type="small" themeColor="textSecondary">{i.details}</ThemedText> : null}</Card>)}
          </View>
        ))}
        {o.notes ? <ThemedText type="small" themeColor="textSecondary">{o.notes}</ThemedText> : null}
        {due > 0 && o.status !== 'CANCELLED' && canEdit ? <Btn small variant="secondary" icon="coins" title={t('tl.payBalance', { amount: shop.money(due) })} onPress={() => setPanel('pay')} /> : null}
        <PhotosBlock o={o} canEdit={canEdit} onChanged={() => void refresh()} />
        <SectionTitle title={t('tl.fittings')} />
        {(o.fittings ?? []).length === 0 ? <ThemedText themeColor="textSecondary">{t('tl.noFitting')}</ThemedText> : (o.fittings ?? []).map((f) => (
          <Card key={f.id}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{new Date(f.scheduledAt).toLocaleString()}</ThemedText><Badge tone={f.status === 'DONE' ? 'success' : f.status === 'MISSED' ? 'danger' : 'warning'}>{t(`tl.fit.${f.status}`)}</Badge></View>
            {f.adjustments ? <ThemedText type="small" themeColor="textSecondary">{f.adjustments}</ThemedText> : null}
            {f.status === 'PLANNED' && canEdit ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><Btn small variant="secondary" title={t('tl.fitDone')} onPress={() => void doneFit(f.id, 'DONE')} /><Btn small variant="secondary" title={t('tl.fitMissed')} onPress={() => void doneFit(f.id, 'MISSED')} /></View> : null}</Card>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {open && canEdit ? <Btn small variant="secondary" icon="calendar" title={t('tl.planFitting')} onPress={() => setPanel('fitting')} /> : null}
          {shop.has('MEASUREMENTS') && shop.can('MEASUREMENTS', 'create') && o.partyId ? <Btn small variant="secondary" icon="ruler" title={t('tl.takeMeasures')} onPress={() => setSheet(true)} /> : null}
        </View>
        {panel === 'fitting' ? <Card><DateField label={t('tl.fittingAt')} value={fitDate} onChange={setFitDate} min={today()} /><Btn title={t('common.save')} disabled={!fitDate} loading={busy} onPress={() => void addFit()} /></Card> : null}
        {panel === 'cancel' ? <Card><TextBox label={t('tl.cancelReason')} value={reason} onChangeText={setReason} maxLength={200} /><ThemedText type="small" themeColor="textSecondary">{t('tl.cancelInfo')}</ThemedText><Btn title={t('tl.cancelOrder')} disabled={!reason.trim()} loading={busy} onPress={() => void cancel()} /></Card> : null}
        {panel === 'deliver' || panel === 'pay' ? (
          <Card>
            <ThemedText type="smallBold">{panel === 'deliver' ? t('tl.deliverTitle') : t('tl.payBalance', { amount: shop.money(due) })}</ThemedText>
            {due > 0 ? <PaymentPanel pay={pay} setPay={setPay} due={due} methods={methods} res={sett} money={shop.money} currency={shop.currency} /> : <ThemedText themeColor="textSecondary">{t('tl.nothingDue')}</ThemedText>}
            {panel === 'deliver' && due > 0 && sett.remaining > 0 && manager ? <Switch label={t('tl.allowUnpaid', { amount: shop.money(sett.remaining) })} value={allowUnpaid} onChange={setAllowUnpaid} /> : null}
            <Btn title={panel === 'deliver' ? t('tl.deliver') : t('common.save')} loading={busy} disabled={panel === 'deliver' ? (due > 0 && !sett.valid) || (sett.remaining > 0 && !allowUnpaid) : !sett.valid || sett.payments.length === 0} onPress={() => void (panel === 'deliver' ? deliver() : payBalance())} />
          </Card>
        ) : null}
      </View>
      {sheet && o.partyId ? <SheetForm partyId={o.partyId} memberId={null} memberName={o.partyName} onClose={() => setSheet(false)} onSaved={(queued) => { setSheet(false); toast(queued ? t('tl.queuedShort') : t('tl.sheetSaved')); }} /> : null}
    </Sheet>
  );
}

type Reminder = { kind: string; orderId: string; number: string; partyName: string; email?: string | null; waNumber?: string | null; telUrl?: string | null; fittingAt?: string | null; balance: number; waitingDays: number; remindedAt?: string | null; message: string };

function ReadySheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const q = useQuery<Reminder[]>(`${API}/reminders`);
  const [kind, setKind] = useState('');
  const [texts, setTexts] = useState<Record<string, string>>({});
  const key = (r: Reminder) => `${r.kind}:${r.orderId}`;
  const textOf = (r: Reminder) => texts[key(r)] ?? r.message;
  async function mark(r: Reminder) { await shop.call(`${API}/orders/${r.orderId}/reminded`, { method: 'POST', body: { kind: r.kind } }); await q.reload(); onChanged(); }
  const open = (url: string, r: Reminder) => { void Linking.openURL(url); void mark(r); };
  const shown = (q.data ?? []).filter((r) => !kind || r.kind === kind);
  const count = (k: string) => (q.data ?? []).filter((r) => r.kind === k && !r.remindedAt).length;
  return (
    <Sheet visible tall title={t('tl.readyTitle')} onClose={onClose}>
      <View style={{ gap: 12 }}>
        <Hint>{t('tl.rem.help')}</Hint>
        <Chips options={[{ value: '', label: t('tl.all') }, ...['READY', 'FITTING', 'LATE'].map((k) => ({ value: k, label: `${t(`tl.rem.${k}`)} ${count(k)}` }))]} value={kind} onChange={setKind} />
        {!q.data ? <Skeleton rows={2} /> : shown.length === 0 ? <Empty icon="check" title={t('tl.rem.none')} /> : (
          <Stack gap={8}>{shown.map((r) => (
            <Card key={key(r)}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{r.number} · {r.partyName}</ThemedText>
                <Badge tone={r.kind === 'LATE' ? 'danger' : r.kind === 'READY' ? 'success' : 'warning'}>{t(`tl.rem.${r.kind}`)}</Badge><Badge tone={r.remindedAt ? 'success' : 'warning'}>{r.remindedAt ? t('tl.warned') : t('tl.toWarn')}</Badge></View>
              {r.kind === 'FITTING' && r.fittingAt ? <ThemedText type="small" themeColor="textSecondary">{t('tl.rem.fittingAt', { date: new Date(r.fittingAt).toLocaleString() })}</ThemedText> : null}
              {r.kind === 'READY' && r.balance > 0 ? <ThemedText type="small" themeColor="textSecondary">{shop.money(r.balance)}</ThemedText> : null}
              <TextBox label={t('tl.rem.message')} value={textOf(r)} onChangeText={(v) => setTexts((x) => ({ ...x, [key(r)]: v }))} multiline maxLength={900} />
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {r.waNumber ? <Btn small icon="whatsapp" title="WhatsApp" onPress={() => open(`https://wa.me/${r.waNumber}?text=${encodeURIComponent(textOf(r))}`, r)} /> : <ThemedText type="small" themeColor="textSecondary">{t('tl.rem.noPhone')}</ThemedText>}
                {r.telUrl ? <Btn small variant="secondary" icon="phone" title={t('tl.call')} onPress={() => open(r.telUrl as string, r)} /> : null}
                {r.email ? <Btn small variant="secondary" title={t('tl.mail')} onPress={() => open(`mailto:${r.email}?subject=${encodeURIComponent(t(`tl.rem.${r.kind}`))}&body=${encodeURIComponent(textOf(r))}`, r)} /> : null}
                <Btn small variant="secondary" title={t('tl.markWarned')} onPress={() => void mark(r)} />
              </View>
            </Card>
          ))}</Stack>
        )}
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------------------------- page
export default function TailorOrders({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const outbox = useOffline();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [worker, setWorker] = useState('');
  const [text, setText] = useState('');
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const board = useQuery<Board>(`${API}/board`);
  const workers = useQuery<Worker[]>(`${API}/workers${qs({ all: true })}`);
  const models = useQuery<Model[]>(`${API}/models`);
  const list = useQuery<{ items: Order[]; total: number }>(`${API}/orders${qs({ status, q: text, workerId: worker || undefined, open: status ? undefined : 1, page: 0, size: 30 * (page + 1) })}`, { debounce: 300 });
  const live = useMemo(() => new Set(outbox.items.filter((i) => i.shopId === shop.shopId && i.state === 'pending').map((i) => i.group as string)), [outbox.items, shop.shopId]);
  const overlay = useTailorOverlay(shop.shopId, live);
  const orders = useMemo(() => applyOrders(list.data?.items ?? null, overlay).filter((o) => !status || o.status === status), [list.data, overlay, status]);
  const reload = async () => { await Promise.all([list.reload(), board.reload()]); };
  const opened = openId ? orders.find((o) => o.id === openId) : null;
  async function advance(o: Order) {
    const next = STAGES[STAGES.indexOf(o.status) + 1];
    if (!next) return;
    try {
      const res = await outbox.submit({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `${API}/orders/${o.id}/status`, body: { status: next, eventId: uuid() }, kind: 'tailor', label: `${o.number} · ${t(`tl.st.${next}`)}`, group: o.id });
      if (res.queued) patchOrder(shop.shopId, o.id, { status: next });
      toast(t('tl.advanced', { number: o.number, stage: t(`tl.st.${next}`) }));
      void reload();
    } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network')); }
  }
  const b = board.data;
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={reload} right={shop.can('TAILOR_ORDERS', 'create') ? <Btn small icon="plus" title={t('tl.newOrder')} onPress={() => setCreating(true)} /> : undefined}>
      {b ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[[t('tl.today.due'), b.dueToday, false], [t('tl.today.fittings'), b.fittingsToday, false], [t('tl.today.ready'), b.readyWaiting, false], [t('tl.late'), b.late, true], [t('tl.urgent'), b.urgent, true]].map(([k, v, bad]) => (
            <Card key={k as string} style={{ minWidth: 96, flexGrow: 1 }}><ThemedText type="subtitle">{String(v)}</ThemedText><ThemedText type="small" themeColor="textSecondary">{k as string}</ThemedText>{bad && Number(v) > 0 ? <Badge tone="danger">!</Badge> : null}</Card>
          ))}
        </View>
      ) : null}
      <Chips options={[{ value: '', label: t('tl.all') }, ...STAGES.map((s) => ({ value: s, label: `${t(`tl.st.${s}`)} ${b?.counts?.[s] ?? 0}` }))]} value={status} onChange={setStatus} />
      {(workers.data ?? []).filter((w) => w.active).length > 1 ? <Chips options={[{ value: '', label: t('tl.allTailors') }, ...(workers.data ?? []).filter((w) => w.active).map((w) => ({ value: w.id, label: w.name }))]} value={worker} onChange={setWorker} /> : null}
      <TextBox label={t('tl.search')} value={text} onChangeText={(v) => { setText(v); setPage(0); }} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Btn small variant="secondary" icon="bell" title={`${t('tl.warnClients')}${b?.readyWaiting ? ` (${b.readyWaiting})` : ''}`} onPress={() => setReady(true)} />
        <PdfButton small path="/api/shop/pdf/tailor/workshop" name="atelier.pdf" label={t('tl.pdf.workshop')} />
      </View>
      {list.error && !list.data ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {!list.data && orders.length === 0 ? <Skeleton rows={3} /> : orders.length === 0 ? <Empty icon="shirt" title={t('tl.noOrder')} text={t('tl.noOrderText')} /> : (
        <Stack gap={8}>
          {orders.map((o) => {
            const at = STAGES.indexOf(o.status);
            return (
              <Card key={o.id} onPress={() => setOpenId(o.id)} style={{ borderLeftWidth: 4, borderLeftColor: o.workerColor ?? '#6366f1' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><ThemedText type="smallBold">{o.number}</ThemedText><Badge tone={tone(o.status)}>{t(`tl.st.${o.status}`)}</Badge>{o.priority === 'URGENT' ? <Badge tone="danger">{t('tl.urgent')}</Badge> : null}{o.local ? <Badge tone="warning">{t('tl.offlinePending')}</Badge> : null}{o.overdue ? <Badge tone="danger">{t('tl.lateDays', { n: o.daysLate })}</Badge> : null}</View>
                <ThemedText type="smallBold">{o.partyName}</ThemedText>
                {at >= 0 ? <View style={{ flexDirection: 'row', gap: 3 }}>{STAGES.map((s, i) => <View key={s} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < at ? '#16a34a' : i === at ? '#6366f1' : '#9ca3af55' }} />)}</View> : null}
                <ThemedText type="small" themeColor="textSecondary">{(o.items ?? []).map((i) => i.garment).slice(0, 3).join(', ') || t(`tl.kind.${o.kind}`)}</ThemedText>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="small">{o.promisedOn ?? t('tl.noDate')}{o.workerName ? ` · ${o.workerName}` : ''}</ThemedText>{num(o.balance) > 0 ? <ThemedText type="smallBold">{t('tl.owes', { amount: shop.money(o.balance) })}</ThemedText> : null}</View>
                {at >= 0 && at < STAGES.length - 1 && !o.local && shop.can('TAILOR_ORDERS', 'update') ? <Btn small variant="secondary" title={t('tl.moveTo', { stage: t(`tl.st.${STAGES[at + 1]}`) })} onPress={() => void advance(o)} /> : null}
              </Card>
            );
          })}
          {(list.data?.total ?? 0) > (list.data?.items.length ?? 0) ? <Btn variant="secondary" title={t('list.more')} onPress={() => setPage((p) => p + 1)} /> : null}
        </Stack>
      )}
      {creating ? <NewOrder workers={workers.data ?? []} models={models.data ?? []} onClose={() => setCreating(false)} onCreated={(queued, o) => { setCreating(false); toast(queued ? t('tl.queued') : t('tl.created', { number: o?.number ?? '' })); void reload(); if (o) setOpenId(o.id); }} /> : null}
      {opened ? <Detail id={opened.id} local={opened.local ? opened : null} workers={workers.data ?? []} onClose={() => setOpenId(null)} onChanged={() => void reload()} /> : null}
      {ready ? <ReadySheet onClose={() => setReady(false)} onChanged={() => void reload()} /> : null}
    </Screen>
  );
}
