import { useRef, useState } from 'react';
import { View } from 'react-native';

import { DateField } from '@/components/date-field';
import { SelectField } from '@/components/dynamic-fields';
import { PartyPicker, type Party } from '@/components/party-picker';
import { PdfButton } from '@/components/pdf-button';
import { ProductPicker } from '@/components/product-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, NumberBox, Row, Screen, Sheet, Skeleton, Switch, TextBox, useToast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDate, num, uuid, type Product } from '@/lib/format';
import { usePricing } from '@/lib/pricing';
import { useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type QLine = { id: string; productId: string; description: string; unit: string; quantity: number; unitPrice: number; discount?: number; lineTotal: number; available?: number | null };
type Quote = { id: string; number: string; status: string; expired?: boolean; partyId?: string; partyName?: string; buyerName?: string; siteName?: string; validUntil?: string; issuedAt: string; notes?: string; terms?: string;
  total: number; margin?: number | null; saleNumber?: string; rejectReason?: string; lines: QLine[] };
const TONE: Record<string, Tone> = { DRAFT: 'info', SENT: 'warning', ACCEPTED: 'success', REJECTED: 'danger', CANCELLED: 'neutral', CONVERTED: 'success', EXPIRED: 'danger' };
const FILTERS = ['', 'DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CONVERTED'];
const fmt = (v: unknown) => num(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
type FLine = { key: string; product: Product; quantity: string; price: string; discount: string; auto: boolean };

function Status({ q }: { q: { status: string; expired?: boolean } }) {
  const { t } = useT();
  const key = q.expired ? 'EXPIRED' : q.status;
  return <Badge tone={TONE[key] ?? 'neutral'}>{t(`qt.s.${key}`)}</Badge>;
}

function QuoteForm({ initial, onClose, onSaved }: { initial?: Quote; onClose: () => void; onSaved: (q: Quote, sent: boolean) => void }) {
  const { t } = useT();
  const shop = useShop();
  const pricing = usePricing();
  const id = useRef(initial?.id ?? uuid());
  const [partyId, setPartyId] = useState<string | null>(initial?.partyId ?? null);
  const [buyer, setBuyer] = useState(initial?.buyerName ?? '');
  const [site, setSite] = useState(initial?.siteName ?? '');
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [terms, setTerms] = useState(initial?.terms ?? '');
  const [lines, setLines] = useState<FLine[]>(() => (initial?.lines ?? []).map((l) => ({ key: l.id, product: { id: l.productId, name: l.description, unit: l.unit, salePrice: l.unitPrice, stock: l.available ?? 0, trackStock: false, isActive: true, units: [] } as Product,
    quantity: String(num(l.quantity)), price: String(num(l.unitPrice)), discount: num(l.discount) ? String(num(l.discount)) : '', auto: false })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // prix negocie du client s'il y en a un, sinon prix de vente ; il ne remplace une ligne que si l'utilisateur ne l'a pas modifiee
  const dealPrice = (product: Product, forParty: string | null) => {
    const r = forParty && pricing.active ? pricing.resolve(product, null, 1, null, forParty) : null;
    return r?.source === 'NEGOTIATED' ? r.price : num(product.salePrice);
  };
  const changeParty = (pid: string | null) => { setPartyId(pid); setLines((ls) => ls.map((l) => (l.auto ? { ...l, price: String(dealPrice(l.product, pid)) } : l))); };
  const patch = (key: string, c: Partial<FLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...c } : l)));
  const gross = (l: FLine) => num(l.quantity) * num(l.price);
  const total = lines.reduce((s, l) => s + gross(l) - num(l.discount), 0);
  const valid = lines.length > 0 && lines.every((l) => num(l.quantity) > 0 && num(l.price) >= 0 && num(l.discount) <= gross(l));
  async function submit(send: boolean) {
    setBusy(true); setError(null);
    try {
      const body = { id: id.current, partyId: partyId || undefined, buyerName: buyer || undefined, siteName: site || undefined, validUntil: validUntil || undefined, notes: notes || undefined, terms: terms || undefined, send,
        lines: lines.map((l) => ({ productId: l.product.id, quantity: num(l.quantity), unitPrice: num(l.price), discount: num(l.discount) || undefined })) };
      onSaved(await shop.call<Quote>(initial ? `/api/shop/quotes/${initial.id}` : '/api/shop/quotes', { method: initial ? 'PUT' : 'POST', body }), send);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={initial ? `${t('qt.edit')} ${initial.number}` : t('qt.new')} onClose={onClose}
      footer={<View style={{ gap: 8 }}><Btn icon="paper-plane" title={busy ? t('ws.saving') : `${t('qt.saveSend')} · ${shop.money(total)}`} loading={busy} disabled={!valid || busy} onPress={() => void submit(true)} /><Btn variant="secondary" title={t('qt.saveDraft')} disabled={!valid || busy} onPress={() => void submit(false)} /></View>}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <PartyPicker role="CUSTOMER" label={shop.v('customer')} value={partyId} selected={null as Party | null} onChange={(pid) => changeParty(pid)} />
      {!partyId ? <TextBox label={t('qt.buyerName')} value={buyer} onChangeText={setBuyer} hint={t('qt.buyerHint')} maxLength={120} autoCapitalize="words" /> : null}
      <TextBox label={t('qt.site')} value={site} onChangeText={setSite} hint={t('qt.siteHint')} maxLength={120} autoCapitalize="sentences" />
      <DateField label={t('qt.validUntil')} value={validUntil} onChange={setValidUntil} optional />
      <ProductPicker label={t('qt.addProduct')} value={null} onChange={(p) => { if (p) setLines((ls) => [...ls, { key: uuid(), product: p, quantity: '1', price: String(dealPrice(p, partyId)), discount: '', auto: true }]); }} />
      {lines.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('qt.noLines')}</ThemedText> : lines.map((l) => (
        <Card key={l.key} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ThemedText type="smallBold" style={{ flex: 1 }}>{l.product.name} <ThemedText type="small" themeColor="textSecondary">{l.product.unit}</ThemedText></ThemedText><IconBtn size={34} name="xmark" label={t('ws.remove')} onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /></View>
          <NumberBox label={shop.v('quantity')} value={l.quantity} onChange={(v) => patch(l.key, { quantity: v })} />
          <NumberBox label={t('qt.unitPrice')} value={l.price} onChange={(v) => patch(l.key, { price: v, auto: false })} />
          <NumberBox label={t('qt.discount')} value={l.discount} onChange={(v) => patch(l.key, { discount: v })} error={num(l.discount) > gross(l) ? t('qt.discount') : null} />
          <ThemedText type="smallBold" style={{ textAlign: 'right' }}>{shop.money(gross(l) - num(l.discount))}</ThemedText>
        </Card>
      ))}
      <TextBox label={t('qt.notes')} value={notes} onChangeText={setNotes} multiline autoCapitalize="sentences" />
      <TextBox label={t('qt.terms')} value={terms} onChangeText={setTerms} hint={t('qt.termsHint')} multiline autoCapitalize="sentences" />
      <ThemedText type="small" themeColor="textSecondary">{t('qt.noStockEffect')}</ThemedText>
    </Sheet>
  );
}

function ConvertSheet({ quote, onClose, onDone }: { quote: Quote; onClose: () => void; onDone: (q: Quote) => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const saleId = useRef(uuid());
  const methods: string[] = shop.ws.manifest.paymentMethods?.length ? shop.ws.manifest.paymentMethods : ['CASH'];
  const [deposit, setDeposit] = useState('');
  const [method, setMethod] = useState(methods[0]);
  const [acceptExpired, setAcceptExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = quote.lines.filter((l) => l.available != null && num(l.quantity) > num(l.available));
  async function go() {
    setBusy(true); setError(null);
    try { onDone(await shop.call<Quote>(`/api/shop/quotes/${quote.id}/convert`, { method: 'POST', body: { saleId: saleId.current, acceptExpired: acceptExpired || undefined, payments: num(deposit) > 0 ? [{ method, amount: num(deposit) }] : undefined } })); }
    catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible title={t('qt.convertTitle')} onClose={onClose} footer={<Btn icon="cart-shopping" title={busy ? t('ws.saving') : t('qt.convertConfirm')} loading={busy} disabled={busy || (Boolean(quote.expired) && !acceptExpired)} onPress={() => void go()} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <ThemedText>{t('qt.convertHelp', { total: shop.money(quote.total) })}</ThemedText>
      {short.length > 0 ? <Hint icon="triangle-exclamation" tone="warning" title={t('qt.shortStock')}>{short.map((l) => `${l.description} : ${fmt(l.quantity)} / ${fmt(l.available)} ${l.unit}`).join(' · ')}</Hint> : null}
      {quote.expired ? <Switch value={acceptExpired} onChange={setAcceptExpired} label={t('qt.expiredConfirm', { date: quote.validUntil ? formatDate(quote.validUntil, lang) : '' })} /> : null}
      {shop.can('SALES', 'create') ? <>
        <NumberBox label={t('qt.deposit')} value={deposit} onChange={setDeposit} hint={t('qt.depositHelp')} />
        <SelectField required label={t('ws.paymentMethod')} value={method} onChange={setMethod} options={methods.map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} />
      </> : null}
    </Sheet>
  );
}

function QuoteSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Quote>(`/api/shop/quotes/${id}`);
  const [local, setLocal] = useState<Quote | null>(null);
  const d = local ?? q.data;
  const [edit, setEdit] = useState(false);
  const [converting, setConverting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canUpdate = shop.can('QUOTES', 'update');
  async function act(path: string, body: unknown, done: string) {
    setBusy(true); setError(null);
    try { const res = await shop.call<Quote>(`/api/shop/quotes/${id}/${path}`, { method: 'POST', body }); setLocal(res); toast(done); onChanged(); setRejecting(false); }
    catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  async function cancel() { if (await confirmAction(t('qt.cancelTitle'), t('qt.cancelText'), t('qt.cancel'), t('common.cancel'))) void act('cancel', undefined, t('qt.cancelled')); }
  const open = d ? ['DRAFT', 'SENT', 'ACCEPTED'].includes(d.status) : false;
  const footer = !d || !canUpdate ? undefined : rejecting ? <Btn variant="secondary" icon="xmark" title={t('qt.rejectConfirm')} disabled={!reason.trim() || busy} loading={busy} onPress={() => void act('reject', { reason: reason.trim() }, t('qt.rejected'))} />
    : <View style={{ gap: 8 }}>
      {open && shop.can('SALES', 'create') ? <Btn icon="cart-shopping" title={t('qt.convert')} disabled={busy} onPress={() => setConverting(true)} /> : null}
      {d.status === 'DRAFT' ? <Btn variant="secondary" title={t('qt.send')} disabled={busy} onPress={() => void act('send', undefined, t('qt.sent'))} /> : null}
      {d.status === 'SENT' ? <Btn variant="secondary" title={t('qt.markAccepted')} disabled={busy} onPress={() => void act('accept', undefined, t('qt.accepted'))} /> : null}
      {['REJECTED', 'CANCELLED'].includes(d.status) ? <Btn variant="secondary" title={t('qt.reopen')} disabled={busy} onPress={() => void act('reopen', undefined, t('qt.reopened'))} /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {['DRAFT', 'SENT'].includes(d.status) ? <View style={{ flex: 1 }}><Btn small variant="secondary" title={t('qt.edit')} onPress={() => setEdit(true)} /></View> : null}
        {['SENT', 'ACCEPTED'].includes(d.status) ? <View style={{ flex: 1 }}><Btn small variant="secondary" title={t('qt.markRejected')} onPress={() => setRejecting(true)} /></View> : null}
        {['DRAFT', 'SENT', 'ACCEPTED'].includes(d.status) ? <View style={{ flex: 1 }}><Btn small variant="secondary" title={t('qt.cancel')} onPress={() => void cancel()} /></View> : null}
      </View>
    </View>;
  return (
    <Sheet visible tall title={d ? `${t('qt.quote')} ${d.number}` : '…'} onClose={onClose} footer={footer}>
      {!d ? <Skeleton rows={3} height={70} /> : (
        <>
          {q.error ? <ErrorNote message={q.error} onRetry={() => void q.reload()} /> : null}
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{d.partyName ?? d.buyerName ?? t('qt.walkIn')}{d.siteName ? ` · ${d.siteName}` : ''}</ThemedText><Status q={d} /></View>
          <ThemedText type="small" themeColor="textSecondary">{t(`qt.hint.${d.expired ? 'EXPIRED' : d.status}`)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{`${t('qt.issued')} ${formatDate(d.issuedAt, lang)} · ${t('qt.validUntil')} ${d.validUntil ? formatDate(d.validUntil, lang) : '—'}${d.saleNumber ? ` · ${t('qt.sale')} ${d.saleNumber}` : ''}`}</ThemedText>
          {d.rejectReason ? <Hint icon="circle-xmark" tone="danger" title={t('qt.rejectReason')}>{d.rejectReason}</Hint> : null}
          {d.notes ? <ThemedText type="small">{d.notes}</ThemedText> : null}
          {d.lines.map((l) => <Row key={l.id} title={l.description} subtitle={`${fmt(l.quantity)} ${l.unit} × ${shop.money(l.unitPrice)}${num(l.discount) ? ` − ${shop.money(l.discount)}` : ''}${open && l.available != null && num(l.quantity) > num(l.available) ? ` · ${t('qt.stockShort', { count: fmt(l.available) })}` : ''}`} tone={open && l.available != null && num(l.quantity) > num(l.available) ? 'danger' : undefined} right={<ThemedText type="smallBold">{shop.money(l.lineTotal)}</ThemedText>} />)}
          <View style={{ flexDirection: 'row' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{t('qt.total')}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 18 }}>{shop.money(d.total)}</ThemedText></View>
          {d.margin != null ? <ThemedText type="small" themeColor="textSecondary">{`${t('ws.margin')} ${shop.money(d.margin)}`}</ThemedText> : null}
          <View style={{ alignItems: 'flex-start' }}><PdfButton path={`/api/shop/pdf/quotes/${d.id}`} name={`devis-${d.number}.pdf`} label={t('qt.pdf')} small /></View>
          {rejecting ? <TextBox label={t('qt.rejectReason')} value={reason} onChangeText={setReason} hint={t('qt.rejectHint')} multiline autoCapitalize="sentences" /> : null}
          {edit ? <QuoteForm initial={d} onClose={() => setEdit(false)} onSaved={(res) => { setLocal(res); setEdit(false); toast(t('qt.saved')); onChanged(); }} /> : null}
          {converting ? <ConvertSheet quote={d} onClose={() => setConverting(false)} onDone={(res) => { setConverting(false); setLocal(res); toast(t('qt.converted', { number: res.saleNumber ?? '' })); onChanged(); }} /> : null}
        </>
      )}
    </Sheet>
  );
}

/** Devis et proforma : preparer, envoyer, faire accepter, puis transformer en vente. Le stock ne bouge qu'a la vente. */
export default function Quotes({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = useInfinite<Quote>('/api/shop/quotes', { status: status || undefined, q: q || undefined });
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('qt.subtitle')} onRefresh={() => void list.reload()} refreshing={list.refreshing} onEndReached={list.loadMore}
      right={shop.can('QUOTES', 'create') ? <IconBtn name="plus" tone="primary" label={t('qt.new')} onPress={() => setForm(true)} /> : undefined}>
      <TextBox label={t('qt.search')} value={q} onChangeText={setQ} autoCapitalize="none" />
      <Chips value={status} onChange={setStatus} options={FILTERS.map((s) => ({ value: s, label: s ? t(`qt.s.${s}`) : t('ws.all') }))} />
      {list.error ? <ErrorNote message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={68} /> : list.items.length === 0 ? <Empty icon="receipt" title={t('qt.empty')} text={t('qt.emptyText')} /> : list.items.map((x) => (
        <Row key={x.id} title={x.number} subtitle={[x.partyName ?? x.buyerName, x.siteName, `${t('qt.validUntil')} ${x.validUntil ? formatDate(x.validUntil, lang) : '—'}`].filter(Boolean).join(' · ')} onPress={() => setOpen(x.id)}
          right={<View style={{ alignItems: 'flex-end', gap: 4 }}><ThemedText type="smallBold">{shop.money(x.total)}</ThemedText><Status q={x} /></View>} />
      ))}
      {list.hasMore ? <Btn variant="secondary" small loading={list.loadingMore} title={t('list.more')} onPress={list.loadMore} /> : null}
      {form ? <QuoteForm onClose={() => setForm(false)} onSaved={(res, sent) => { setForm(false); toast(sent ? t('qt.sent') : t('qt.saved')); setOpen(res.id); void list.reload(); }} /> : null}
      {open ? <QuoteSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}
