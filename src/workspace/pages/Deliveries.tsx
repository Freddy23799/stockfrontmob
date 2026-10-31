import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { DateField } from '@/components/date-field';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, NumberBox, Row, Screen, Sheet, Skeleton, TextBox, useToast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime, num, uuid } from '@/lib/format';
import { qs, useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Delivery = { id: string; number: string; status: string; late?: boolean; saleId: string; saleNumber: string; partyName?: string; recipientName?: string; siteName?: string; address?: string; phone?: string;
  scheduledDate?: string; carrier?: string; vehicle?: string; notes?: string; dispatchedAt?: string; deliveredAt?: string; receivedBy?: string; failureReason?: string;
  lines: { id: string; description: string; quantity: number; unit: string }[] };
type Remaining = { saleLineId: string; description: string; unit: string; sold: number; committed: number; remaining: number };
type SaleHit = { id: string; number: string; partyName?: string; issuedAt: string; total: number; cancelled?: boolean };
const TONE: Record<string, Tone> = { PREPARED: 'info', IN_TRANSIT: 'warning', DELIVERED: 'success', FAILED: 'danger', CANCELLED: 'neutral' };
const TABS = ['OPEN', 'DELIVERED', 'ALL'];
const fmt = (v: unknown) => num(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
const clean = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.trim() || undefined]));

function Status({ d }: { d: { status: string; late?: boolean } }) {
  const { t } = useT();
  return <View style={{ flexDirection: 'row', gap: 6 }}><Badge tone={TONE[d.status] ?? 'neutral'}>{t(`dv.s.${d.status}`)}</Badge>{d.late ? <Badge tone="danger">{t('dv.late')}</Badge> : null}</View>;
}

/** Cherche une vente par son numero ou son client. */
function SalePicker({ onPick }: { onPick: (s: SaleHit) => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<SaleHit[] | null>(null);
  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => {
      shop.call<{ items: SaleHit[] }>(`/api/shop/documents${qs({ type: 'SALE', q: q.trim() || undefined, size: 8 })}`)
        .then((r) => { if (alive) setItems(r.items.filter((x) => !x.cancelled)); }).catch(() => { if (alive) setItems([]); });
    }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ gap: 8 }}>
      <TextBox label={t('dv.searchSale')} value={q} onChangeText={setQ} autoCapitalize="none" />
      {items === null ? <Skeleton rows={3} height={56} /> : items.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('dv.noSale')}</ThemedText> : items.map((s) => (
        <Row key={s.id} title={s.number} subtitle={[s.partyName, formatDate(s.issuedAt, lang)].filter(Boolean).join(' · ')} right={<ThemedText type="smallBold">{shop.money(s.total)}</ThemedText>} onPress={() => onPick(s)} />
      ))}
    </View>
  );
}

function DeliveryForm({ saleId: initialSale, onClose, onSaved }: { saleId?: string; onClose: () => void; onSaved: (d: Delivery) => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(uuid());
  const [sale, setSale] = useState<{ id: string; number?: string; partyName?: string } | null>(initialSale ? { id: initialSale } : null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [f, setF] = useState({ recipientName: '', siteName: '', address: '', phone: '', carrier: '', vehicle: '', notes: '' });
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remQ = useQuery<Remaining[]>(sale ? `/api/shop/deliveries/remaining/${sale.id}` : null);
  const rem = remQ.data;
  const qv = (x: Remaining) => qty[x.saleLineId] ?? String(num(x.remaining));   // par defaut : tout ce qui reste a livrer
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const chosen = (rem ?? []).filter((x) => num(qv(x)) > 0);
  const over = (x: Remaining) => num(qv(x)) > num(x.remaining);
  const valid = Boolean(sale) && chosen.length > 0 && !(rem ?? []).some(over);
  async function submit() {
    if (!sale) return;
    setBusy(true); setError(null);
    try {
      const body = { id: id.current, saleId: sale.id, ...clean(f), scheduledDate: date || undefined, lines: chosen.map((x) => ({ saleLineId: x.saleLineId, quantity: num(qv(x)) })) };
      onSaved(await shop.call<Delivery>('/api/shop/deliveries', { method: 'POST', body }));
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('dv.new')} onClose={onClose} footer={sale ? <Btn icon="check" title={busy ? t('ws.saving') : t('dv.create')} loading={busy} disabled={!valid || busy} onPress={() => void submit()} /> : undefined}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {!sale ? <><ThemedText type="small" themeColor="textSecondary">{t('dv.pickSale')}</ThemedText><SalePicker onPick={(s) => { setSale(s); setF((x) => ({ ...x, recipientName: s.partyName ?? '' })); }} /></> : !rem ? <Skeleton rows={3} height={64} /> : (
        <>
          <ThemedText type="smallBold">{t('dv.sale')} {sale.number ?? ''}{sale.partyName ? ` · ${sale.partyName}` : ''}</ThemedText>
          {rem.every((x) => num(x.remaining) === 0) ? <Hint icon="check" tone="success">{t('dv.allDone')}</Hint> : rem.map((x) => (
            <Card key={x.saleLineId} style={{ gap: 8 }}>
              <ThemedText type="smallBold">{x.description}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{t('dv.soldDelivered', { sold: fmt(x.sold), done: fmt(x.committed), unit: x.unit })}</ThemedText>
              <NumberBox label={t('dv.toSend', { unit: x.unit })} value={qv(x)} onChange={(v) => setQty((q) => ({ ...q, [x.saleLineId]: v }))} error={over(x) ? t('dv.remaining', { count: fmt(x.remaining) }) : null} editable={num(x.remaining) > 0} />
            </Card>
          ))}
          <TextBox label={t('dv.recipient')} value={f.recipientName} onChangeText={set('recipientName')} maxLength={120} autoCapitalize="words" />
          <TextBox label={t('dv.phone')} value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={30} />
          <TextBox label={t('dv.site')} value={f.siteName} onChangeText={set('siteName')} hint={t('qt.siteHint')} maxLength={120} autoCapitalize="sentences" />
          <DateField label={t('dv.scheduled')} value={date} onChange={setDate} optional />
          <TextBox label={t('dv.address')} value={f.address} onChangeText={set('address')} hint={t('dv.addressHint')} maxLength={250} autoCapitalize="sentences" />
          <TextBox label={t('dv.carrier')} value={f.carrier} onChangeText={set('carrier')} hint={t('dv.carrierHint')} maxLength={120} autoCapitalize="words" />
          <TextBox label={t('dv.vehicle')} value={f.vehicle} onChangeText={set('vehicle')} maxLength={60} />
          <TextBox label={t('ws.note')} value={f.notes} onChangeText={set('notes')} multiline autoCapitalize="sentences" />
          <ThemedText type="small" themeColor="textSecondary">{t('dv.noStockEffect')}</ThemedText>
        </>
      )}
    </Sheet>
  );
}

function DeliverySheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Delivery>(`/api/shop/deliveries/${id}`);
  const [local, setLocal] = useState<Delivery | null>(null);
  const d = local ?? q.data;
  const [mode, setMode] = useState<string | null>(null);   // deliver | fail | edit | cancel
  const [text, setText] = useState('');
  const [f, setF] = useState({ recipientName: '', siteName: '', address: '', phone: '', carrier: '', vehicle: '' });
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canUpdate = shop.can('DELIVERIES', 'update');
  async function act(path: string, body: unknown, done: string, method = 'POST') {
    setBusy(true); setError(null);
    try { const res = await shop.call<Delivery>(`/api/shop/deliveries/${id}${path ? `/${path}` : ''}`, { method, body }); setLocal(res); setMode(null); setText(''); toast(done); onChanged(); }
    catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  const open = d ? d.status === 'PREPARED' || d.status === 'IN_TRANSIT' : false;
  function startEdit() {
    if (!d) return;
    setF({ recipientName: d.recipientName ?? '', siteName: d.siteName ?? '', address: d.address ?? '', phone: d.phone ?? '', carrier: d.carrier ?? '', vehicle: d.vehicle ?? '' });
    setDate(d.scheduledDate ?? ''); setMode('edit');
  }
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const footer = !d || !canUpdate ? undefined : mode === 'deliver' ? <Btn icon="check" title={t('dv.confirm')} disabled={!text.trim() || busy} loading={busy} onPress={() => void act('deliver', { receivedBy: text.trim() }, t('dv.delivered'))} />
    : mode === 'fail' ? <Btn variant="secondary" icon="xmark" title={t('dv.failConfirm')} disabled={!text.trim() || busy} loading={busy} onPress={() => void act('fail', { reason: text.trim() }, t('dv.failed'))} />
    : mode === 'cancel' ? <Btn variant="secondary" icon="xmark" title={t('dv.cancel')} disabled={busy} loading={busy} onPress={() => void act('cancel', undefined, t('dv.cancelled'))} />
    : mode === 'edit' ? <Btn icon="check" title={t('dv.save')} disabled={busy} loading={busy} onPress={() => void act('', { ...clean(f), scheduledDate: date || undefined }, t('dv.saved'), 'PUT')} />
    : open ? <View style={{ gap: 8 }}>
      {d.status === 'PREPARED' ? <Btn variant="secondary" icon="truck" title={t('dv.dispatch')} disabled={busy} onPress={() => void act('dispatch', undefined, t('dv.dispatched'))} /> : null}
      <Btn icon="check" title={t('dv.markDelivered')} onPress={() => setMode('deliver')} />
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Btn small variant="secondary" title={t('dv.editDetails')} onPress={startEdit} /></View><View style={{ flex: 1 }}><Btn small variant="secondary" title={t('dv.markFailed')} onPress={() => setMode('fail')} /></View><View style={{ flex: 1 }}><Btn small variant="secondary" title={t('dv.cancel')} onPress={() => setMode('cancel')} /></View></View>
    </View> : undefined;
  return (
    <Sheet visible tall title={d ? `${t('dv.slip')} ${d.number}` : '…'} onClose={onClose} footer={footer}>
      {!d ? <Skeleton rows={3} height={70} /> : (
        <>
          {q.error ? <ErrorNote message={q.error} onRetry={() => void q.reload()} /> : null}
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{d.recipientName ?? d.partyName ?? '—'} · {d.saleNumber}</ThemedText><Status d={d} /></View>
          <ThemedText type="small" themeColor="textSecondary">{t(`dv.hint.${d.status}`)}</ThemedText>
          {[[t('dv.site'), d.siteName], [t('dv.address'), d.address], [t('dv.phone'), d.phone], [t('dv.scheduled'), d.scheduledDate && formatDate(d.scheduledDate, lang)], [t('dv.carrier'), d.carrier ? `${d.carrier}${d.vehicle ? ` · ${d.vehicle}` : ''}` : null],
            [t('dv.dispatchedAt'), d.dispatchedAt && formatDateTime(d.dispatchedAt, lang)], [t('dv.deliveredAt'), d.deliveredAt && formatDateTime(d.deliveredAt, lang)], [t('dv.receivedBy'), d.receivedBy]]
            .filter(([, v]) => v).map(([k, v]) => <View key={String(k)} style={{ flexDirection: 'row', gap: 8 }}><ThemedText type="small" themeColor="textSecondary" style={{ width: 110 }}>{k}</ThemedText><ThemedText type="small" style={{ flex: 1 }}>{v}</ThemedText></View>)}
          {d.failureReason ? <Hint icon="circle-xmark" tone="danger" title={t('dv.failureReason')}>{d.failureReason}</Hint> : null}
          {d.notes ? <ThemedText type="small">{d.notes}</ThemedText> : null}
          {d.lines.map((l) => <Row key={l.id} title={l.description} right={<ThemedText type="smallBold">{fmt(l.quantity)} {l.unit}</ThemedText>} />)}
          <View style={{ alignItems: 'flex-start' }}><PdfButton path={`/api/shop/pdf/deliveries/${d.id}`} name={`livraison-${d.number}.pdf`} label={t('dv.pdf')} small /></View>
          {mode === 'deliver' ? <TextBox label={t('dv.receivedByLabel')} value={text} onChangeText={setText} hint={t('dv.receivedHint')} maxLength={120} autoCapitalize="words" /> : null}
          {mode === 'fail' ? <><ThemedText type="small" themeColor="textSecondary">{t('dv.failHelp')}</ThemedText><TextBox label={t('dv.failureReason')} value={text} onChangeText={setText} hint={t('dv.failHint')} multiline autoCapitalize="sentences" /></> : null}
          {mode === 'cancel' ? <Hint icon="triangle-exclamation" tone="warning" title={t('dv.cancelTitle')}>{t('dv.cancelText')}</Hint> : null}
          {mode === 'edit' ? (
            <Card style={{ gap: 8 }}>
              <TextBox label={t('dv.recipient')} value={f.recipientName} onChangeText={set('recipientName')} autoCapitalize="words" />
              <TextBox label={t('dv.phone')} value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
              <TextBox label={t('dv.site')} value={f.siteName} onChangeText={set('siteName')} autoCapitalize="sentences" />
              <DateField label={t('dv.scheduled')} value={date} onChange={setDate} optional />
              <TextBox label={t('dv.address')} value={f.address} onChangeText={set('address')} autoCapitalize="sentences" />
              <TextBox label={t('dv.carrier')} value={f.carrier} onChangeText={set('carrier')} autoCapitalize="words" />
              <TextBox label={t('dv.vehicle')} value={f.vehicle} onChangeText={set('vehicle')} />
              <Btn variant="secondary" small title={t('common.cancel')} onPress={() => setMode(null)} />
            </Card>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

/** Livraisons : ce qui reste a livrer, ce qui est en route, ce qui est signe. Le stock est deja sorti a la vente. */
export default function Deliveries({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const [view, setView] = useState('OPEN');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = useInfinite<Delivery>('/api/shop/deliveries', { status: view === 'ALL' ? undefined : view, q: q || undefined });
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('dv.subtitle')} onRefresh={() => void list.reload()} refreshing={list.refreshing} onEndReached={list.loadMore}
      right={shop.can('DELIVERIES', 'create') ? <IconBtn name="plus" tone="primary" label={t('dv.new')} onPress={() => setForm(true)} /> : undefined}>
      <TextBox label={t('dv.search')} value={q} onChangeText={setQ} autoCapitalize="none" />
      <Chips value={view} onChange={setView} options={TABS.map((s) => ({ value: s, label: t(`dv.tab.${s}`) }))} />
      {list.error ? <ErrorNote message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={68} /> : list.items.length === 0 ? <Empty icon="truck" title={t(`dv.empty.${view}`)} text={t('dv.emptyText')} /> : list.items.map((x) => (
        <Row key={x.id} title={x.number} subtitle={[x.recipientName ?? x.partyName, x.siteName, `${t('dv.sale')} ${x.saleNumber}`, x.scheduledDate && formatDate(x.scheduledDate, lang)].filter(Boolean).join(' · ')} onPress={() => setOpen(x.id)} right={<Status d={x} />} />
      ))}
      {list.hasMore ? <Btn variant="secondary" small loading={list.loadingMore} title={t('list.more')} onPress={list.loadMore} /> : null}
      {form ? <DeliveryForm onClose={() => setForm(false)} onSaved={(d) => { setForm(false); toast(t('dv.created', { number: d.number })); setOpen(d.id); void list.reload(); }} /> : null}
      {open ? <DeliverySheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}
