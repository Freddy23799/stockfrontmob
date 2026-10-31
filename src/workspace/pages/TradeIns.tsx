import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { ListFooter } from '@/components/list-footer';
import { PdfButton } from '@/components/pdf-button';
import { PartyPicker } from '@/components/party-picker';
import { ProductPicker } from '@/components/product-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Fab, Input, NumberBox, Screen, Sheet, Skeleton, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { API, errText, num, prettyImei } from '@/lib/electronics';
import { formatDate, uuid, type Product } from '@/lib/format';
import { LIST_PROPS } from '@/lib/list';
import { useInfinite } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Trade = {
  id: string; number: string; status: string; sellerName: string; sellerPhone?: string | null; idType?: string | null; idNumber?: string | null; productName: string; deviceLabel?: string | null; serial: string;
  imei2?: string | null; condition: string; grade?: string | null; checks?: Record<string, boolean>; offeredValue: number | string; expectedResale?: number | string | null; payoutMethod?: string | null;
  payoutAmount: number | string; creditAmount: number | string; unitStatus?: string | null; notes?: string | null; rejectReason?: string | null; completedAt?: string | null; margin?: number | string | null;
};
const FILTERS = ['', 'QUOTED', 'COMPLETED', 'REJECTED'];
const PAYOUTS = ['CASH', 'MOBILE_MONEY', 'TRANSFER', 'STORE_CREDIT'];
const ID_TYPES = ['CNI', 'PASSPORT', 'DRIVING', 'OTHER'];
const CHECKS = ['screenCracked', 'batteryWeak', 'buttonsFaulty', 'cameraFaulty', 'waterDamage', 'accountLocked', 'noCharger', 'noBox'];
const TONE: Record<string, 'warning' | 'success' | 'danger'> = { QUOTED: 'warning', COMPLETED: 'success', REJECTED: 'danger' };

function TradeForm({ onClose, onSaved }: { onClose: () => void; onSaved: (x: Trade) => void }) {
  const { t } = useT();
  const shop = useShop();
  const [id] = useState(uuid);
  const [product, setProduct] = useState<Product | null>(null);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [f, setF] = useState({ sellerName: '', sellerPhone: '', idType: 'CNI', idNumber: '', deviceLabel: '', serial: '', condition: 'USED', grade: '', offeredValue: '', expectedResale: '', notes: '' });
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!product) return;
    setBusy(true); setError(null);
    try {
      onSaved(await shop.call<Trade>(`${API}/trade-ins`, { method: 'POST', body: {
        id, partyId: partyId ?? undefined, sellerName: f.sellerName.trim(), sellerPhone: f.sellerPhone.trim() || undefined, idType: f.idNumber ? f.idType : undefined, idNumber: f.idNumber.trim() || undefined,
        productId: product.id, deviceLabel: f.deviceLabel.trim() || undefined, serial: f.serial.trim().toUpperCase(), condition: f.condition, grade: f.grade.trim() || undefined, checks,
        offeredValue: num(f.offeredValue), expectedResale: f.expectedResale === '' ? undefined : num(f.expectedResale), notes: f.notes.trim() || undefined } }));
    } catch (e) { setError(errText(e, t('common.error'))); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('el.tradeNew')} onClose={onClose} footer={<Btn title={t('el.tradeSaveQuote')} disabled={!product || !f.sellerName.trim() || f.serial.trim().length < 4 || num(f.offeredValue) <= 0} loading={busy} onPress={() => void save()} />}>
      {error ? <ErrorNote message={error} /> : null}
      <ThemedText type="small" themeColor="textSecondary">{t('el.tradeHelp')}</ThemedText>
      <ProductPicker label={t('el.pickModel')} value={product} onChange={setProduct} />
      <TextBox label={`${t('el.imei')} *`} value={f.serial} onChangeText={set('serial')} autoCapitalize="characters" autoCorrect={false} />
      <TextBox label={t('el.deviceLabel')} hint={t('el.deviceLabelHint')} value={f.deviceLabel} onChangeText={set('deviceLabel')} />
      <Chips scroll={false} value={f.condition} onChange={set('condition')} options={['USED', 'REFURBISHED'].map((c) => ({ value: c, label: t(`el.cond.${c}`) }))} />
      <TextBox label={t('el.grade')} value={f.grade} onChangeText={set('grade')} />
      <PartyPicker role="CUSTOMER" label={t('el.seller')} value={partyId} onChange={(v) => setPartyId(v)} />
      <TextBox label={`${t('el.sellerName')} *`} value={f.sellerName} onChangeText={set('sellerName')} />
      <TextBox label={t('el.phone')} value={f.sellerPhone} onChangeText={set('sellerPhone')} keyboardType="phone-pad" />
      <Chips value={f.idType} onChange={set('idType')} options={ID_TYPES.map((k) => ({ value: k, label: t(`el.id.${k}`) }))} />
      <TextBox label={t('el.idNumber')} hint={t('el.idHint')} value={f.idNumber} onChangeText={set('idNumber')} autoCapitalize="characters" />
      <ThemedText type="smallBold">{t('el.checksTitle')}</ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {CHECKS.map((c) => <Btn key={c} small variant={checks[c] ? 'primary' : 'secondary'} title={t(`el.chk.${c}`)} onPress={() => setChecks((x) => ({ ...x, [c]: !x[c] }))} />)}
      </View>
      <NumberBox label={`${t('el.offered')} *`} value={f.offeredValue} onChange={set('offeredValue')} />
      <NumberBox label={t('el.expectedResale')} value={f.expectedResale} onChange={set('expectedResale')} />
      <TextBox label={t('el.notes')} value={f.notes} onChangeText={set('notes')} multiline />
    </Sheet>
  );
}

function TradeSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const [x, setX] = useState<Trade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<null | 'complete' | 'reject'>(null);
  const [f, setF] = useState({ method: 'CASH', value: '', reason: '' });
  useState(() => { shop.call<Trade>(`${API}/trade-ins/${id}`).then(setX).catch((e) => setError(errText(e, t('common.error')))); return null; });
  async function act(path: string, body: unknown, ok: string) {
    setBusy(true); setError(null);
    try { setX(await shop.call<Trade>(`${API}/trade-ins/${id}/${path}`, { method: 'POST', body })); toast(ok); setMode(null); onChanged(); } catch (e) { setError(errText(e, t('common.error'))); } finally { setBusy(false); }
  }
  if (!x) return <Sheet visible title="…" onClose={onClose}>{error ? <ErrorNote message={error} /> : <Skeleton rows={3} height={60} />}</Sheet>;
  const problems = CHECKS.filter((c) => x.checks?.[c] === true);
  const canUpdate = shop.can('TRADE_INS', 'update');
  return (
    <Sheet visible tall title={`${t('el.trade')} ${x.number}`} onClose={onClose}>
      {error ? <ErrorNote message={error} /> : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{x.productName}{x.deviceLabel ? ` · ${x.deviceLabel}` : ''}</ThemedText><Badge tone={TONE[x.status]}>{t(`el.ts.${x.status}`)}</Badge></View>
      <ThemedText type="small" themeColor="textSecondary">{t(`el.thint.${x.status}`)}</ThemedText>
      <ThemedText type="small">{t('el.imei')} : {prettyImei(x.serial)}</ThemedText>
      <ThemedText type="small">{t('el.condition')} : {t(`el.cond.${x.condition}`)}{x.grade ? ` · ${x.grade}` : ''}</ThemedText>
      <ThemedText type="small">{t('el.seller')} : {x.sellerName}{x.sellerPhone ? ` · ${x.sellerPhone}` : ''}</ThemedText>
      {x.idNumber ? <ThemedText type="small">{t('el.idNumber')} : {x.idType ? `${t(`el.id.${x.idType}`)} ` : ''}{x.idNumber}</ThemedText> : null}
      <ThemedText type="smallBold">{t('el.offered')} : {shop.money(x.offeredValue)}</ThemedText>
      {x.expectedResale != null ? <ThemedText type="small">{t('el.expectedResale')} : {shop.money(x.expectedResale)}</ThemedText> : null}
      {x.status === 'COMPLETED' ? <ThemedText type="small">{t('el.payout')} : {num(x.creditAmount) > 0 ? `${t('el.storeCredit')} ${shop.money(x.creditAmount)}` : `${shop.money(x.payoutAmount)} · ${t(`ws.m.${x.payoutMethod}`)}`}{x.completedAt ? ` · ${formatDate(x.completedAt, lang)}` : ''}</ThemedText> : null}
      {problems.length > 0 ? <ThemedText type="small"><ThemedText type="smallBold">{t('el.checksTitle')} : </ThemedText>{problems.map((c) => t(`el.chk.${c}`)).join(' · ')}</ThemedText> : <ThemedText type="small" themeColor="textSecondary">{t('el.noChecksIssue')}</ThemedText>}
      {x.notes ? <ThemedText type="small" themeColor="textSecondary">{x.notes}</ThemedText> : null}
      {x.rejectReason ? <ThemedText type="small" themeColor="danger">{t('el.rejectReason')} : {x.rejectReason}</ThemedText> : null}
      {canUpdate && x.status === 'QUOTED' && mode == null ? (
        <View style={{ gap: 8 }}>
          <Btn title={t('el.tradeComplete')} onPress={() => { setF({ method: 'CASH', value: String(num(x.offeredValue)), reason: '' }); setMode('complete'); }} />
          <Btn small variant="ghost" title={t('el.tradeReject')} onPress={() => { setF({ method: 'CASH', value: '', reason: '' }); setMode('reject'); }} />
        </View>
      ) : null}
      {mode === 'complete' ? <Card>
        <ThemedText type="small" themeColor="textSecondary">{t('el.completeHelp')}</ThemedText>
        <NumberBox label={t('el.offered')} value={f.value} onChange={(v) => setF({ ...f, value: v })} />
        <Chips value={f.method} onChange={(v) => setF({ ...f, method: v })} options={PAYOUTS.map((m) => ({ value: m, label: m === 'STORE_CREDIT' ? t('el.storeCredit') : t(`ws.m.${m}`) }))} />
        <Btn title={t('el.tradeComplete')} loading={busy} disabled={num(f.value) <= 0} onPress={() => void act('complete', { payout: { method: f.method }, offeredValue: num(f.value) }, t('el.tradeCompleted'))} />
        <Btn variant="ghost" title={t('common.cancel')} onPress={() => setMode(null)} /></Card> : null}
      {mode === 'reject' ? <Card>
        <TextBox label={`${t('el.rejectReason')} *`} value={f.reason} onChangeText={(v) => setF({ ...f, reason: v })} />
        <Btn title={t('el.tradeReject')} loading={busy} disabled={!f.reason.trim()} onPress={() => void act('reject', { reason: f.reason.trim() }, t('el.tradeRejected'))} />
        <Btn variant="ghost" title={t('common.cancel')} onPress={() => setMode(null)} /></Card> : null}
      <PdfButton path={`/api/shop/pdf/electronics/trade-in/${x.id}`} name={`reprise-${x.number}.pdf`} label={t('el.tradePdf')} small />
    </Sheet>
  );
}

/** Reprise d'appareils d'occasion : etat, controle IMEI anti-vol, paiement ou avoir, entree en stock. */
export default function TradeIns({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [status, setStatus] = useState('QUOTED');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = useInfinite<Trade>(`${API}/trade-ins`, { q: q.trim(), status: status || undefined });
  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('el.tradesSubtitle')}>
      <Chips value={status} onChange={setStatus} options={FILTERS.map((s) => ({ value: s, label: s ? t(`el.ts.${s}`) : t('ws.all') }))} />
      <View style={{ marginVertical: 8 }}><Input value={q} onChangeText={setQ} placeholder={t('el.searchTrades')} autoCapitalize="none" /></View>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={72} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(x) => x.id} contentContainerStyle={{ gap: 8, paddingBottom: 110 }} onEndReached={list.loadMore} refreshing={list.refreshing} onRefresh={() => void list.reload()} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="repeat" title={t('el.tradesEmpty')} text={t('el.tradesEmptyText')} />}
          ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} failed={false} onMore={list.loadMore} />}
          renderItem={({ item: x }) => (
            <Card onPress={() => setOpen(x.id)}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={1}>{x.number} · {x.productName}</ThemedText>
                <Badge tone={TONE[x.status]}>{t(`el.ts.${x.status}`)}</Badge>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{[x.sellerName, prettyImei(x.serial), shop.money(x.offeredValue)].join(' · ')}</ThemedText>
            </Card>
          )} />
      )}
      {shop.can('TRADE_INS', 'create') ? <Fab label={t('el.tradeNew')} onPress={() => setForm(true)} /> : null}
      {form ? <TradeForm onClose={() => setForm(false)} onSaved={(x) => { setForm(false); toast(t('el.saved')); setOpen(x.id); void list.reload(); }} /> : null}
      {open ? <TradeSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}
