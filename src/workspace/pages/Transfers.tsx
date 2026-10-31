import { useRef, useState } from 'react';
import { View } from 'react-native';

import { SelectField } from '@/components/dynamic-fields';
import { PdfButton } from '@/components/pdf-button';
import { ProductPicker } from '@/components/product-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, NumberBox, Row, Screen, Sheet, Skeleton, Switch, TextBox, useToast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDate, formatDateTime, num, uuid, type Product } from '@/lib/format';
import { qs, useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type TLine = { id: string; name: string; sku?: string; unit: string; quantity: number; receivedQuantity?: number; difference?: number; lotNumber?: string; lotExpiry?: string; note?: string;
  suggestedProductId?: string | null; suggestedProductName?: string; suggestedUnit?: string; unitMismatch?: boolean };
type Transfer = { id: string; number: string; status: string; direction: 'IN' | 'OUT'; fromShopName: string; toShopName: string; createdAt: string; sentAt?: string; receivedAt?: string; reason?: string; carrier?: string;
  totalValue?: number | null; shortfall?: number; lineCount?: number; rejectReason?: string; receiveNote?: string; lines: TLine[] };
type Site = { id: string; name: string; city?: string };
const TONE: Record<string, Tone> = { DRAFT: 'info', SENT: 'warning', RECEIVED: 'success', REJECTED: 'danger', RETURNED: 'info', CANCELLED: 'neutral' };
const fmt = (v: unknown) => num(v).toLocaleString(undefined, { maximumFractionDigits: 3 });

function Status({ status }: { status: string }) {
  const { t } = useT();
  return <Badge tone={TONE[status] ?? 'neutral'}>{t(`tr.s.${status}`)}</Badge>;
}

function TransferForm({ sites, onClose, onSaved }: { sites: Site[]; onClose: () => void; onSaved: (t: Transfer, sent: boolean) => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(uuid());
  const [toShopId, setToShopId] = useState(sites.length === 1 ? sites[0].id : '');
  const [reason, setReason] = useState('');
  const [carrier, setCarrier] = useState('');
  const [lines, setLines] = useState<{ key: string; product: Product; quantity: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const over = (l: { product: Product; quantity: string }) => l.product.stock != null && num(l.quantity) > num(l.product.stock);
  const valid = Boolean(toShopId) && lines.length > 0 && lines.every((l) => num(l.quantity) > 0);
  const value = lines.reduce((s, l) => s + num(l.quantity) * num((l.product as Product & { costPrice?: number }).costPrice), 0);
  async function submit(send: boolean) {
    setBusy(true); setError(null);
    try {
      onSaved(await shop.call<Transfer>('/api/shop/transfers', { method: 'POST', body: { id: id.current, toShopId, reason: reason || undefined, carrier: carrier || undefined, send, lines: lines.map((l) => ({ productId: l.product.id, quantity: num(l.quantity) })) } }), send);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('tr.new')} onClose={onClose}
      footer={<View style={{ gap: 8 }}><Btn icon="truck" title={busy ? t('ws.saving') : `${t('tr.sendNow')}${value > 0 ? ` · ${shop.money(value)}` : ''}`} loading={busy} disabled={!valid || busy} onPress={() => void submit(true)} /><Btn variant="secondary" title={t('tr.saveDraft')} disabled={!valid || busy} onPress={() => void submit(false)} /></View>}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <SelectField required label={t('tr.destination')} value={toShopId} onChange={setToShopId} options={[{ value: '', label: t('tr.chooseSite') }, ...sites.map((s) => ({ value: s.id, label: `${s.name}${s.city ? ` · ${s.city}` : ''}` }))]} />
      <TextBox label={t('tr.reason')} value={reason} onChangeText={setReason} hint={t('tr.reasonHint')} maxLength={200} autoCapitalize="sentences" />
      <TextBox label={t('tr.carrier')} value={carrier} onChangeText={setCarrier} hint={t('tr.carrierHint')} maxLength={120} autoCapitalize="words" />
      <ProductPicker label={t('tr.addProduct')} stockedOnly value={null} onChange={(p) => { if (p) setLines((ls) => (ls.some((l) => l.product.id === p.id) ? ls : [...ls, { key: uuid(), product: p, quantity: '' }])); }} />
      {lines.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('tr.noLines')}</ThemedText> : lines.map((l) => (
        <Card key={l.key} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ThemedText type="smallBold" style={{ flex: 1 }}>{l.product.name}</ThemedText><IconBtn size={34} name="xmark" label={t('ws.remove')} onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /></View>
          <NumberBox label={t('tr.quantityIn', { unit: l.product.unit })} value={l.quantity} onChange={(v) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: v } : x)))} error={over(l) ? t('tr.available', { count: fmt(l.product.stock) }) : null} />
          <ThemedText type="small" themeColor="textSecondary">{t('tr.available', { count: fmt(l.product.stock) })}{(l.product as Product & { trackLots?: boolean }).trackLots ? ` · ${t('tr.lotsAuto')}` : ''}</ThemedText>
        </Card>
      ))}
      <ThemedText type="small" themeColor="textSecondary">{t('tr.stockLeavesAtSend')}</ThemedText>
    </Sheet>
  );
}

type RRow = { productId: string | null; productName?: string; productUnit?: string; create: boolean; quantity: string; note: string; acceptUnit: boolean; unitMismatch?: boolean };

/** Reception : chaque ligne est rapprochee d'un article de CE site, la quantite recue est controlee, les ecarts sont notes. */
function ReceiveSheet({ transfer, onClose, onDone }: { transfer: Transfer; onClose: () => void; onDone: (t: Transfer) => void }) {
  const { t } = useT();
  const shop = useShop();
  const [rows, setRows] = useState<Record<string, RRow>>(() => Object.fromEntries(transfer.lines.map((l) => [l.id, { productId: l.suggestedProductId ?? null, productName: l.suggestedProductName, productUnit: l.suggestedUnit, create: false, quantity: String(num(l.quantity)), note: '', acceptUnit: false, unitMismatch: l.unitMismatch }])));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (id: string, c: Partial<RRow>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...c } }));
  const problem = (l: TLine) => {
    const r = rows[l.id];
    if (num(r.quantity) > num(l.quantity)) return t('tr.overReceipt');
    if (num(r.quantity) === 0) return null;
    if (!r.productId && !r.create) return t('tr.mapRequired');
    if (r.productId && r.unitMismatch && !r.acceptUnit) return t('tr.unitConfirm', { from: l.unit, to: r.productUnit ?? '' });
    return null;
  };
  const blocked = transfer.lines.some((l) => problem(l));
  const diff = transfer.lines.reduce((s, l) => s + Math.max(0, num(l.quantity) - num(rows[l.id].quantity)), 0);
  async function submit() {
    setBusy(true); setError(null);
    try {
      onDone(await shop.call<Transfer>(`/api/shop/transfers/${transfer.id}/receive`, { method: 'POST', body: { note: note || undefined,
        lines: transfer.lines.map((l) => { const r = rows[l.id]; return { lineId: l.id, productId: r.create ? undefined : r.productId ?? undefined, create: r.create || undefined, quantity: num(r.quantity), note: r.note || undefined, acceptUnitMismatch: r.acceptUnit || undefined }; }) } }));
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('tr.receiveTitle')} onClose={onClose} footer={<Btn icon="check" title={busy ? t('ws.saving') : t('tr.confirmReceipt')} loading={busy} disabled={blocked || busy} onPress={() => void submit()} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <ThemedText type="small" themeColor="textSecondary">{t('tr.receiveHelp')}</ThemedText>
      {transfer.lines.some((l) => !rows[l.id].productId && !rows[l.id].create) ? <Btn small variant="secondary" icon="plus" title={t('tr.createAllMissing')} onPress={() => setRows((r) => Object.fromEntries(Object.entries(r).map(([id, x]) => [id, x.productId || x.create ? x : { ...x, create: true }])))} /> : null}
      {transfer.lines.map((l) => {
        const r = rows[l.id];
        const err = problem(l);
        return (
          <Card key={l.id} style={{ gap: 8 }} tone={err ? 'danger' : undefined}>
            <ThemedText type="smallBold">{l.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{fmt(l.quantity)} {l.unit}{l.lotNumber ? ` · ${l.lotNumber}` : ''}</ThemedText>
            {r.create ? <Badge tone="info">{t('tr.willCreate')}</Badge> : r.productId ? <ThemedText type="small">✓ {r.productName}</ThemedText> : <ThemedText type="small" themeColor="textSecondary">{t('tr.notMatched')}</ThemedText>}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!r.create ? <View style={{ flex: 1 }}><Btn small variant="secondary" title={t('tr.createProduct')} onPress={() => patch(l.id, { create: true, productId: null, unitMismatch: false })} /></View> : null}
              {r.create || r.productId ? <View style={{ flex: 1 }}><Btn small variant="secondary" title={t('tr.change')} onPress={() => patch(l.id, { create: false, productId: l.suggestedProductId ?? null, productName: l.suggestedProductName, productUnit: l.suggestedUnit, unitMismatch: l.unitMismatch })} /></View> : null}
            </View>
            {!r.create && (!r.productId || r.productId !== l.suggestedProductId) ? <ProductPicker label={t('tr.pickMine')} stockedOnly value={null} onChange={(p) => { if (p) patch(l.id, { productId: p.id, productName: p.name, productUnit: p.unit, create: false, unitMismatch: String(p.unit).toLowerCase() !== String(l.unit).toLowerCase(), acceptUnit: false }); }} /> : null}
            <NumberBox label={t('tr.received')} value={r.quantity} onChange={(v) => patch(l.id, { quantity: v })} />
            <TextBox label={t('tr.lineNote')} value={r.note} onChangeText={(v) => patch(l.id, { note: v })} hint={num(r.quantity) < num(l.quantity) ? t('tr.diffHint') : undefined} maxLength={200} autoCapitalize="sentences" />
            {r.productId && r.unitMismatch ? <Switch value={r.acceptUnit} onChange={(v) => patch(l.id, { acceptUnit: v })} label={t('tr.unitConfirm', { from: l.unit, to: r.productUnit ?? '' })} /> : null}
            {err ? <ThemedText type="small" style={{ color: '#c0392b' }}>{err}</ThemedText> : null}
          </Card>
        );
      })}
      <TextBox label={t('tr.receiveNote')} value={note} onChangeText={setNote} multiline autoCapitalize="sentences" />
      {diff > 0 ? <Hint icon="triangle-exclamation" tone="warning">{t('tr.diffWarning', { count: fmt(diff) })}</Hint> : null}
    </Sheet>
  );
}

function TransferSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Transfer>(`/api/shop/transfers/${id}`);
  const [local, setLocal] = useState<Transfer | null>(null);
  const tr = local ?? q.data;
  const [rejecting, setRejecting] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canWrite = shop.can('STOCK_TRANSFERS', 'update');
  async function act(path: string, body: unknown, done: string) {
    setBusy(true); setError(null);
    try { const res = await shop.call<Transfer>(`/api/shop/transfers/${id}/${path}`, { method: 'POST', body }); setLocal(res); toast(done); onChanged(); setRejecting(false); }
    catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  async function cancel() {
    if (!tr) return;
    const sent = tr.status === 'SENT';
    if (await confirmAction(t(sent ? 'tr.cancelSentTitle' : 'tr.cancelTitle'), t(sent ? 'tr.cancelSentText' : 'tr.cancelText'), t('tr.cancelConfirm'), t('common.cancel'))) void act('cancel', undefined, t('tr.cancelled'));
  }
  const out = tr?.direction === 'OUT';
  const footer = !tr || !canWrite ? undefined : rejecting ? <Btn variant="secondary" icon="xmark" title={t('tr.rejectConfirm')} disabled={!reason.trim() || busy} loading={busy} onPress={() => void act('reject', { reason: reason.trim() }, t('tr.rejected'))} />
    : <View style={{ gap: 8 }}>
      {out && tr.status === 'DRAFT' && shop.can('STOCK_TRANSFERS', 'create') ? <Btn icon="truck" title={t('tr.sendNow')} disabled={busy} onPress={() => void act('send', undefined, t('tr.sent'))} /> : null}
      {!out && tr.status === 'SENT' ? <Btn icon="check" title={t('tr.receiveTitle')} onPress={() => setReceiving(true)} /> : null}
      {out && tr.status === 'REJECTED' ? <Btn title={t('tr.takeBack')} disabled={busy} onPress={() => void act('take-back', undefined, t('tr.takenBack'))} /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {!out && tr.status === 'SENT' ? <View style={{ flex: 1 }}><Btn small variant="secondary" title={t('tr.reject')} onPress={() => setRejecting(true)} /></View> : null}
        {out && (tr.status === 'DRAFT' || tr.status === 'SENT') ? <View style={{ flex: 1 }}><Btn small variant="secondary" title={t('tr.cancel')} onPress={() => void cancel()} /></View> : null}
      </View>
    </View>;
  const steps = tr ? [{ k: 'created', done: true }, { k: 'sent', done: tr.status !== 'DRAFT' && tr.status !== 'CANCELLED' }, { k: 'received', done: tr.status === 'RECEIVED', warn: tr.status === 'REJECTED' || tr.status === 'RETURNED' }] : [];
  return (
    <Sheet visible tall title={tr ? `${t('tr.slip')} ${tr.number}` : '…'} onClose={onClose} footer={footer}>
      {!tr ? <Skeleton rows={3} height={70} /> : (
        <>
          {q.error ? <ErrorNote message={q.error} onRetry={() => void q.reload()} /> : null}
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{tr.fromShopName} → {tr.toShopName}</ThemedText><Status status={tr.status} /></View>
          <View style={{ flexDirection: 'row', gap: 12 }}>{steps.map((s) => <ThemedText key={s.k} type="small" style={{ opacity: s.done || s.warn ? 1 : 0.5 }}>{s.done ? '✓' : s.warn ? '⚠' : '○'} {t(`tr.step.${s.k}`)}</ThemedText>)}</View>
          <ThemedText type="small" themeColor="textSecondary">{t(`tr.hint.${tr.direction}.${tr.status}`)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{[`${t('tr.createdAt')} ${formatDateTime(tr.createdAt, lang)}`, tr.sentAt && `${t('tr.sentAt')} ${formatDateTime(tr.sentAt, lang)}`, tr.receivedAt && `${t('tr.receivedAt')} ${formatDateTime(tr.receivedAt, lang)}`, tr.reason, tr.carrier, tr.totalValue != null && shop.money(tr.totalValue)].filter(Boolean).join(' · ')}</ThemedText>
          {tr.rejectReason ? <Hint icon="circle-xmark" tone="danger" title={t('tr.rejectReason')}>{tr.rejectReason}</Hint> : null}
          {tr.receiveNote ? <Hint icon="note-sticky" title={t('tr.receiveNote')}>{tr.receiveNote}</Hint> : null}
          {tr.status === 'RECEIVED' && num(tr.shortfall) > 0 ? <Hint icon="triangle-exclamation" tone="warning">{t('tr.diffReceived', { count: fmt(tr.shortfall) })}</Hint> : null}
          {tr.lines.map((l) => (
            <Row key={l.id} title={l.name} tone={num(l.difference) > 0 ? 'danger' : undefined} subtitle={[l.sku, l.lotNumber && `${shop.v('lot')} ${l.lotNumber}`, l.lotExpiry && formatDate(l.lotExpiry, lang), l.note].filter(Boolean).join(' · ')}
              right={<ThemedText type="smallBold">{tr.status === 'RECEIVED' ? `${fmt(l.receivedQuantity)} / ${fmt(l.quantity)}` : `${fmt(l.quantity)}`} {l.unit}</ThemedText>} />
          ))}
          <View style={{ alignItems: 'flex-start' }}><PdfButton path={`/api/shop/pdf/transfers/${tr.id}`} name={`transfert-${tr.number}.pdf`} label={t('tr.pdf')} small /></View>
          {rejecting ? <><ThemedText type="small" themeColor="textSecondary">{t('tr.rejectHelp')}</ThemedText><TextBox label={t('tr.rejectReason')} value={reason} onChangeText={setReason} multiline autoCapitalize="sentences" /></> : null}
          {receiving ? <ReceiveSheet transfer={tr} onClose={() => setReceiving(false)} onDone={(res) => { setReceiving(false); setLocal(res); toast(t('tr.received')); onChanged(); }} /> : null}
        </>
      )}
    </Sheet>
  );
}

/** Transferts entre les sites d'une enseigne : envoyer, suivre la marchandise en transit, recevoir avec controle des ecarts. */
export default function Transfers({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const [view, setView] = useState('in');
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const sitesQ = useQuery<Site[]>('/api/shop/transfers/sites');
  const incomingQ = useQuery<{ total: number }>(`/api/shop/transfers${qs({ direction: 'in', status: 'SENT', size: 1 })}`);
  const list = useInfinite<Transfer>('/api/shop/transfers', { direction: view === 'all' ? undefined : view, status: view === 'in' ? 'SENT' : undefined });
  const sites = sitesQ.data;
  const incoming = incomingQ.data?.total ?? 0;
  const refresh = () => { void list.reload(); void incomingQ.reload(); };
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('tr.subtitle')} onRefresh={refresh} refreshing={list.refreshing} onEndReached={list.loadMore}
      right={shop.can('STOCK_TRANSFERS', 'create') && sites && sites.length > 0 ? <IconBtn name="plus" tone="primary" label={t('tr.new')} onPress={() => setForm(true)} /> : undefined}>
      {sites && sites.length === 0 ? <Hint icon="triangle-exclamation" tone="warning" title={t('tr.noSitesTitle')}>{t('tr.noSitesText')}</Hint> : null}
      <Chips value={view} onChange={setView} options={[{ value: 'in', label: `${t('tr.tab.in')}${incoming > 0 ? ` (${incoming})` : ''}` }, { value: 'out', label: t('tr.tab.out') }, { value: 'all', label: t('tr.tab.all') }]} />
      {list.error ? <ErrorNote message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={68} /> : list.items.length === 0 ? <Empty icon="right-left" title={t(`tr.empty.${view}`)} text={t('tr.emptyText')} /> : list.items.map((x) => (
        <Row key={x.id} title={x.number} subtitle={`${x.direction === 'OUT' ? `${t('tr.to')} ${x.toShopName}` : `${t('tr.from')} ${x.fromShopName}`} · ${formatDate(x.sentAt ?? x.createdAt, lang)} · ${t('ws.itemsCount', { count: x.lineCount ?? 0 })}`} onPress={() => setOpen(x.id)}
          right={<View style={{ alignItems: 'flex-end', gap: 4 }}>{x.totalValue != null ? <ThemedText type="smallBold">{shop.money(x.totalValue)}</ThemedText> : null}<Status status={x.status} />{num(x.shortfall) > 0 ? <Badge tone="danger">{t('tr.diffShort', { count: fmt(x.shortfall) })}</Badge> : null}</View>} />
      ))}
      {list.hasMore ? <Btn variant="secondary" small loading={list.loadingMore} title={t('list.more')} onPress={list.loadMore} /> : null}
      {form && sites ? <TransferForm sites={sites} onClose={() => setForm(false)} onSaved={(tr, sent) => { setForm(false); toast(sent ? t('tr.sent') : t('tr.draftSaved')); setView('out'); setOpen(tr.id); refresh(); }} /> : null}
      {open ? <TransferSheet id={open} onClose={() => setOpen(null)} onChanged={refresh} /> : null}
    </Screen>
  );
}
