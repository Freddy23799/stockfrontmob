import { useRef, useState } from 'react';
import { View } from 'react-native';

import { DateField } from '@/components/date-field';
import { SelectField } from '@/components/dynamic-fields';
import { PartyPicker, type Party } from '@/components/party-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, NumberBox, Row, Screen, SectionTitle, Sheet, Skeleton, TextBox, useToast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDate, num, uuid } from '@/lib/format';
import { useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Rebate = { id: string; supplierId: string; supplierName: string; name: string; scope: string; categoryId?: string; productId?: string; basis: string; threshold: number; rewardKind: string; rewardValue: number; freeEvery?: number; startsOn: string; endsOn: string; status: string; note?: string;
  purchasedQty: number; purchasedAmount: number; thresholdReached: boolean; missingToThreshold: number; progressPct: number; earnedAmount: number; earnedUnits: number; settledAmount: number; remainingAmount: number; remainingUnits: number; daysLeft: number; ended: boolean;
  settlements: { id: string; mode: string; amount: number; freeUnits: number; reference?: string; note?: string; settledOn: string }[] };
const TONE: Record<string, Tone> = { ACTIVE: 'success', CLOSED: 'neutral', CANCELLED: 'neutral' };
const fmt = (v: unknown) => num(v).toLocaleString(undefined, { maximumFractionDigits: 3 });

function Bar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, num(pct)));
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p }} style={{ height: 8, borderRadius: 4, backgroundColor: '#8884', overflow: 'hidden' }}><View style={{ width: `${p}%`, height: '100%', backgroundColor: p >= 100 ? '#1a9d5c' : '#2f6fed' }} /></View>;
}

function RebateForm({ initial, onClose, onSaved }: { initial?: Rebate; onClose: () => void; onSaved: (r: Rebate) => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(initial?.id ?? uuid());
  const [name, setName] = useState(initial?.name ?? '');
  const [supplierId, setSupplierId] = useState<string | null>(initial?.supplierId ?? null);
  const [supplier, setSupplier] = useState<Party | null>(null);
  const [basis, setBasis] = useState(initial?.basis ?? 'AMOUNT');
  const [threshold, setThreshold] = useState(initial ? String(initial.threshold) : '');
  const [kind, setKind] = useState(initial?.rewardKind ?? 'PERCENT');
  const [value, setValue] = useState(initial ? String(initial.rewardValue) : '');
  const [freeEvery, setFreeEvery] = useState(initial?.freeEvery != null ? String(initial.freeEvery) : '');
  const [starts, setStarts] = useState(initial?.startsOn ?? new Date().toISOString().slice(0, 10));
  const [ends, setEnds] = useState(initial?.endsOn ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim() && supplierId && ends && value !== '' && (kind !== 'FREE_UNITS' || num(freeEvery) > 0);
  async function save() {
    setBusy(true); setError(null);
    try {
      const body = { id: id.current, name: name.trim(), supplierId, scope: initial?.scope ?? 'ALL', categoryId: initial?.categoryId, productId: initial?.productId, basis, threshold: num(threshold), rewardKind: kind, rewardValue: num(value), freeEvery: kind === 'FREE_UNITS' ? num(freeEvery) : undefined, startsOn: starts, endsOn: ends, note: note || undefined };
      onSaved(await shop.call<Rebate>(initial ? `/api/shop/rebates/${initial.id}` : '/api/shop/rebates', { method: initial ? 'PUT' : 'POST', body }));
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={initial ? t('bv.rb.edit') : t('bv.rb.new')} onClose={onClose} footer={<Btn icon="check" title={busy ? t('ws.saving') : t('bv.x.confirm')} loading={busy} disabled={!valid || busy} onPress={save} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <TextBox label={t('bv.rb.name')} value={name} onChangeText={setName} autoCapitalize="sentences" />
      <PartyPicker role="SUPPLIER" label={t('bv.rb.supplier')} value={supplierId} selected={supplier} onChange={(sid, p) => { setSupplierId(sid); setSupplier(p ?? null); }} />
      <SelectField required label={t('bv.rb.basis')} value={basis} onChange={setBasis} options={['AMOUNT', 'QTY'].map((b) => ({ value: b, label: t(`bv.rb.b.${b}`) }))} />
      <NumberBox label={t('bv.rb.threshold')} value={threshold} onChange={setThreshold} />
      <SelectField required label={t('bv.rb.rewardKind')} value={kind} onChange={setKind} options={['PERCENT', 'PER_UNIT', 'LUMP_SUM', 'FREE_UNITS'].map((b) => ({ value: b, label: t(`bv.rb.k.${b}`) }))} />
      <NumberBox label={t('bv.rb.rewardValue')} value={value} onChange={setValue} />
      {kind === 'FREE_UNITS' ? <NumberBox label={t('bv.rb.freeEvery')} value={freeEvery} onChange={setFreeEvery} /> : null}
      <DateField label={t('bv.rb.startsOn')} value={starts} onChange={setStarts} />
      <DateField label={t('bv.rb.endsOn')} value={ends} onChange={setEnds} />
      <TextBox label={t('bv.rb.note')} value={note} onChangeText={setNote} multiline autoCapitalize="sentences" />
    </Sheet>
  );
}

function RebateSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Rebate>(`/api/shop/rebates/${id}`);
  const [r, setR] = useState<Rebate | null>(null);
  const d = r ?? q.data;
  const [mode, setMode] = useState<string | null>(null);
  const [smode, setSmode] = useState('CREDIT_NOTE');
  const [amount, setAmount] = useState('');
  const [units, setUnits] = useState('');
  const [ref, setRef] = useState('');
  const sid = useRef(uuid());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canUpdate = shop.can('SUPPLIER_REBATES', 'update');
  async function status(st: string) {
    try { setR(await shop.call<Rebate>(`/api/shop/rebates/${id}/status`, { method: 'POST', body: { status: st } })); onChanged(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  async function settle() {
    setBusy(true); setError(null);
    try {
      setR(await shop.call<Rebate>(`/api/shop/rebates/${id}/settle`, { method: 'POST', body: { id: sid.current, mode: smode, amount: amount === '' ? undefined : num(amount), freeUnits: units === '' ? undefined : num(units), reference: ref || undefined } }));
      toast(t('bv.rb.settledOk')); setMode(null); sid.current = uuid(); onChanged();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible tall title={d?.name ?? '…'} onClose={onClose}
      footer={d && canUpdate && d.status === 'ACTIVE' ? (mode === 'settle' ? <Btn icon="check" title={busy ? t('ws.saving') : t('bv.x.confirm')} loading={busy} disabled={busy} onPress={settle} /> : <Btn title={t('bv.rb.settle')} onPress={() => { setAmount(num(d.remainingAmount) ? String(num(d.remainingAmount)) : ''); setUnits(num(d.remainingUnits) ? String(num(d.remainingUnits)) : ''); setMode('settle'); }} />) : undefined}>
      {!d ? <Skeleton rows={3} height={70} /> : (
        <>
          {q.error ? <ErrorNote message={q.error} onRetry={() => void q.reload()} /> : null}
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Badge tone={TONE[d.status] ?? 'neutral'}>{t(`bv.rb.st.${d.status}`)}</Badge>
            <ThemedText type="small" themeColor="textSecondary">{d.supplierName} · {formatDate(d.startsOn, lang)} → {formatDate(d.endsOn, lang)} · {d.ended ? t('bv.rb.ended') : t('bv.rb.daysLeft', { count: d.daysLeft })}</ThemedText></View>
          <Card style={{ gap: 8 }}><Bar pct={d.progressPct} /><ThemedText type="smallBold">{t('bv.rb.progress', { pct: fmt(d.progressPct) })}</ThemedText>
            {d.thresholdReached ? <Badge tone="success">{t('bv.rb.reached')}</Badge> : <ThemedText type="small" themeColor="textSecondary">{t('bv.rb.missing', { qty: fmt(d.missingToThreshold) })}</ThemedText>}</Card>
          <Row title={t('bv.rb.purchased')} right={<ThemedText type="smallBold">{d.basis === 'QTY' ? fmt(d.purchasedQty) : shop.money(d.purchasedAmount)}</ThemedText>} />
          <Row title={t('bv.rb.earned')} subtitle={num(d.earnedUnits) ? `${fmt(d.earnedUnits)} ${t('bv.rb.freeUnits')}` : undefined} right={<ThemedText type="smallBold">{shop.money(d.earnedAmount)}</ThemedText>} />
          <Row title={t('bv.rb.settled')} right={<ThemedText type="smallBold">{shop.money(d.settledAmount)}</ThemedText>} />
          <Row title={t('bv.rb.remaining')} subtitle={num(d.remainingUnits) ? `${fmt(d.remainingUnits)} ${t('bv.rb.freeUnits')}` : undefined} tone={num(d.remainingAmount) > 0 ? 'warning' : undefined} right={<ThemedText type="smallBold">{shop.money(d.remainingAmount)}</ThemedText>} />
          {mode === 'settle' ? (
            <Card style={{ gap: 10 }}>
              <SelectField required label={t('bv.rb.mode')} value={smode} onChange={setSmode} options={['CREDIT_NOTE', 'CASH', 'DEDUCTED', 'FREE_GOODS'].map((m) => ({ value: m, label: t(`bv.rb.m.${m}`) }))} />
              {smode === 'FREE_GOODS' ? <NumberBox label={t('bv.rb.freeUnits')} value={units} onChange={setUnits} /> : <NumberBox label={t('bv.rb.amount')} value={amount} onChange={setAmount} />}
              <TextBox label={t('bv.rb.reference')} value={ref} onChangeText={setRef} autoCapitalize="characters" />
              <Btn variant="ghost" small title={t('common.cancel')} onPress={() => setMode(null)} />
            </Card>
          ) : null}
          {canUpdate && !mode ? <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {d.status === 'ACTIVE' ? <><Btn small variant="secondary" title={t('bv.rb.edit')} onPress={() => setMode('edit')} /><Btn small variant="secondary" title={t('bv.rb.close')} onPress={() => void status('CLOSED')} /><Btn small variant="ghost" title={t('bv.rb.cancel')} onPress={() => void status('CANCELLED')} /></> : <Btn small variant="secondary" title={t('bv.rb.reactivate')} onPress={() => void status('ACTIVE')} />}</View> : null}
          <SectionTitle title={t('bv.rb.history')} />
          {d.settlements.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('bv.rb.noHistory')}</ThemedText> : d.settlements.map((x) => (
            <Row key={x.id} title={t(`bv.rb.m.${x.mode}`)} subtitle={[formatDate(x.settledOn, lang), x.reference, x.note].filter(Boolean).join(' · ')} right={<ThemedText type="smallBold">{num(x.amount) > 0 ? shop.money(x.amount) : `${fmt(x.freeUnits)} ${t('bv.rb.freeUnits')}`}</ThemedText>} />
          ))}
          {mode === 'edit' ? <RebateForm initial={d} onClose={() => setMode(null)} onSaved={(res) => { setMode(null); setR(res); toast(t('bv.rb.saved')); onChanged(); }} /> : null}
        </>
      )}
    </Sheet>
  );
}

/** Ristournes et promotions des brasseries : cumul d'achats, seuil, gain et reglements. */
export default function Rebates({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [view, setView] = useState('RUNNING');
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = useInfinite<Rebate>('/api/shop/rebates', { status: view === 'ALL' ? undefined : view });
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('bv.rb.subtitle')} onRefresh={() => void list.reload()} refreshing={list.refreshing} onEndReached={list.loadMore}
      right={shop.can('SUPPLIER_REBATES', 'create') ? <IconBtn name="plus" tone="primary" label={t('bv.rb.new')} onPress={() => setForm(true)} /> : undefined}>
      <Chips value={view} onChange={setView} options={['RUNNING', 'CLOSED', 'ALL'].map((s) => ({ value: s, label: t(`bv.rb.tab.${s}`) }))} />
      {list.error ? <ErrorNote message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={68} /> : list.items.length === 0 ? <Empty icon="tag" title={t('bv.rb.empty')} text={t('bv.rb.emptyText')} /> : list.items.map((x) => (
        <Row key={x.id} title={x.name} subtitle={`${x.supplierName} · ${t('bv.rb.progress', { pct: fmt(x.progressPct) })}${x.thresholdReached ? ` · ${t('bv.rb.reached')}` : ''}`} onPress={() => setOpen(x.id)}
          meta={<Bar pct={x.progressPct} />} right={<View style={{ alignItems: 'flex-end' }}><ThemedText type="smallBold">{shop.money(x.remainingAmount)}</ThemedText><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>{t('bv.rb.remaining')}</ThemedText></View>} />
      ))}
      {list.hasMore ? <Btn variant="secondary" small loading={list.loadingMore} title={t('list.more')} onPress={list.loadMore} /> : null}
      {form ? <RebateForm onClose={() => setForm(false)} onSaved={(r) => { setForm(false); toast(t('bv.rb.saved')); setOpen(r.id); void list.reload(); }} /> : null}
      {open ? <RebateSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}
