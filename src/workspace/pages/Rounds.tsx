import { useRef, useState } from 'react';
import { Linking, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { SelectField } from '@/components/dynamic-fields';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, NumberBox, Row, Screen, SectionTitle, Sheet, Skeleton, Switch, TextBox, useToast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDate, num, uuid } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { qs, useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Stop = { id: string; deliveryId: string; stopOrder: number; status: string; recipientName?: string; partyName?: string; partyId?: string; address?: string; phone?: string; saleNumber?: string; saleBalance: number; partyDepositQty?: number; note?: string };
type Round = { id: string; number: string; roundDate: string; name?: string; zone?: string; status: string; vehicleId?: string; vehicleName?: string; plate?: string; driverName?: string; helperName?: string; stopCount: number; deliveredCount: number; failedCount: number; collected: number; toCollect?: number; cashExpected?: number; cashDeclared?: number; cashVariance?: number; collectedCash?: number; notes?: string; returnNotes?: string; stops: Stop[]; emptiesVariance?: Record<string, number> };
type Vehicle = { id: string; name: string; plate?: string; capacityPacks?: number; defaultDriver?: string; active: boolean; openRounds: number };
type Avail = { id: string; number: string; recipientName?: string; partyName?: string; address?: string; saleNumber?: string; saleBalance: number; scheduledDate?: string };
type Loading = { totalPacks: number; capacityPacks?: number; overCapacity: boolean; lines: { productId: string; name: string; unit?: string; packLabel?: string; packFactor?: number; baseQty: number; packs: number }[]; deposits: { itemId: string; itemName: string; qty: number }[] };
type DItem = { itemId: string; itemName: string; qty: number };
const TONE: Record<string, Tone> = { PLANNED: 'neutral', LOADING: 'warning', ON_ROUTE: 'warning', RETURNED: 'success', CLOSED: 'success', CANCELLED: 'neutral' };
const STOP_TONE: Record<string, Tone> = { PENDING: 'neutral', DELIVERED: 'success', FAILED: 'danger' };
const TABS = ['OPEN', 'CLOSED', 'ALL', 'vehicles'];
const METHODS = ['CASH', 'MOBILE_MONEY', 'TRANSFER', 'CARD', 'CHEQUE'];
const fmt = (v: unknown) => num(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
const today = () => new Date().toISOString().slice(0, 10);

function RoundForm({ initial, onClose, onSaved }: { initial?: Round; onClose: () => void; onSaved: (r: Round) => void }) {
  const { t } = useT();
  const shop = useShop();
  const vehicles = useQuery<Vehicle[]>('/api/shop/rounds/vehicles');
  const id = useRef(initial?.id ?? uuid());
  const [date, setDate] = useState(initial?.roundDate ?? today());
  const [name, setName] = useState(initial?.name ?? '');
  const [zone, setZone] = useState(initial?.zone ?? '');
  const [vehicleId, setVehicleId] = useState(initial?.vehicleId ?? '');
  const [driver, setDriver] = useState(initial?.driverName ?? '');
  const [helper, setHelper] = useState(initial?.helperName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try {
      const body = { id: id.current, roundDate: date, name: name || undefined, zone: zone || undefined, vehicleId: vehicleId || undefined, driverName: driver || undefined, helperName: helper || undefined };
      onSaved(await shop.call<Round>(initial ? `/api/shop/rounds/${initial.id}` : '/api/shop/rounds', { method: initial ? 'PUT' : 'POST', body }));
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={initial ? `${t('bv.or.edit')} ${initial.number}` : t('bv.rd.new')} onClose={onClose} footer={<Btn icon="check" title={busy ? t('ws.saving') : t('bv.x.confirm')} loading={busy} disabled={busy} onPress={save} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <DateField label={t('bv.rd.date')} value={date} onChange={setDate} />
      <TextBox label={t('bv.rd.name')} value={name} onChangeText={setName} autoCapitalize="sentences" />
      <TextBox label={t('bv.rd.zone')} value={zone} onChangeText={setZone} autoCapitalize="sentences" />
      <SelectField label={t('bv.rd.vehicle')} value={vehicleId} onChange={(v) => { setVehicleId(v); const veh = vehicles.data?.find((x) => x.id === v); if (veh?.defaultDriver && !driver) setDriver(veh.defaultDriver); }} placeholder={t('bv.rd.noVehicle')}
        options={(vehicles.data ?? []).filter((v) => v.active).map((v) => ({ value: v.id, label: `${v.name}${v.plate ? ` · ${v.plate}` : ''}` }))} />
      <TextBox label={t('bv.rd.driver')} value={driver} onChangeText={setDriver} autoCapitalize="words" />
      <TextBox label={t('bv.rd.helper')} value={helper} onChangeText={setHelper} autoCapitalize="words" />
    </Sheet>
  );
}

function StopSheet({ round, stop, onClose, onDone }: { round: Round; stop: Stop; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const offline = useOffline();
  const toast = useToast();
  const [mode, setMode] = useState<'deliver' | 'fail'>('deliver');
  const [receivedBy, setReceivedBy] = useState(stop.recipientName ?? stop.partyName ?? '');
  const [amount, setAmount] = useState(String(Math.max(0, num(stop.saleBalance))));
  const [method, setMethod] = useState('CASH');
  const [reason, setReason] = useState('');
  const [empties, setEmpties] = useState<Record<string, string>>({});
  const held = useQuery<{ items: { itemId: string; itemName: string; qty: number }[] }>(stop.partyId && shop.has('DEPOSITS') ? `/api/shop/deposits/parties/${stop.partyId}` : null);
  const items = (held.data?.items ?? []).filter((i) => num(i.qty) > 0);
  const payId = useRef(uuid());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    try {
      const body = mode === 'deliver'
        ? { receivedBy: receivedBy.trim(), payments: num(amount) > 0 ? [{ id: payId.current, method, amount: num(amount) }] : undefined, empties: Object.entries(empties).filter(([, v]) => num(v) > 0).map(([itemId, v]) => ({ itemId, qty: num(v) })) }
        : { reason: reason.trim() };
      const res = await offline.submit({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `/api/shop/rounds/${round.id}/stops/${stop.id}/${mode}`, body, kind: 'stop', label: `${t('bv.rd.labelStop')} · ${stop.recipientName ?? stop.partyName ?? ''}` });
      toast(res.queued ? t('bv.rd.queued') : t('bv.rd.stopDone'));
      onDone();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={stop.recipientName ?? stop.partyName ?? ''} onClose={onClose}
      footer={<Btn icon="check" variant={mode === 'fail' ? 'secondary' : 'primary'} title={busy ? t('ws.saving') : t('bv.x.confirm')} loading={busy} disabled={busy || (mode === 'deliver' ? !receivedBy.trim() : !reason.trim())} onPress={go} />}>
      <Chips value={mode} onChange={(v) => setMode(v as 'deliver' | 'fail')} options={[{ value: 'deliver', label: t('bv.rd.deliverStop') }, { value: 'fail', label: t('bv.rd.failStop') }]} />
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {mode === 'deliver' ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">{[stop.address, stop.phone].filter(Boolean).join(' · ')}</ThemedText>
          <TextBox label={t('bv.rd.receivedBy')} value={receivedBy} onChangeText={setReceivedBy} autoCapitalize="words" />
          <SectionTitle title={t('bv.rd.payHere')} hint={`${t('bv.rd.toCollect')} : ${shop.money(stop.saleBalance)}`} />
          <NumberBox label={t('bv.rb.amount')} value={amount} onChange={setAmount} />
          <SelectField required label={t('bv.dp.refundMethod')} value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} />
          {items.length > 0 ? <><SectionTitle title={t('bv.rd.emptiesHere')} />{items.map((i: DItem) => <NumberBox key={i.itemId} label={`${i.itemName} (${t('bv.dp.owes')} ${fmt(i.qty)})`} value={empties[i.itemId] ?? ''} onChange={(v) => setEmpties({ ...empties, [i.itemId]: v })} keyboardType="number-pad" />)}</> : null}
        </>
      ) : <TextBox label={t('bv.rd.failReason')} value={reason} onChangeText={setReason} multiline autoCapitalize="sentences" />}
    </Sheet>
  );
}

function ReturnSheet({ round, onClose, onDone }: { round: Round; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const offline = useOffline();
  const toast = useToast();
  const [cash, setCash] = useState('');
  const [km, setKm] = useState('');
  const [notes, setNotes] = useState('');
  const [failPending, setFailPending] = useState(false);
  const [empties, setEmpties] = useState<Record<string, string>>({});
  const items = useQuery<{ id: string; name: string; active: boolean }[]>(shop.has('DEPOSITS') ? '/api/shop/deposits/items' : null);
  const pending = round.stops.filter((s) => s.status === 'PENDING').length;
  const expected = num(round.collectedCash ?? round.cashExpected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    try {
      const body = { cashDeclared: num(cash), emptiesDeclared: Object.entries(empties).filter(([, v]) => v !== '').map(([itemId, v]) => ({ itemId, qty: num(v) })), returnKm: km === '' ? undefined : num(km), notes: notes || undefined, failPending: failPending || undefined };
      const res = await offline.submit({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `/api/shop/rounds/${round.id}/return`, body, kind: 'round-return', label: `${t('bv.rd.labelReturn')} · ${round.number}` });
      toast(res.queued ? t('bv.rd.queued') : t('bv.rd.stopDone'));
      onDone();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('bv.rd.return')} onClose={onClose} footer={<Btn icon="check" title={busy ? t('ws.saving') : t('bv.rd.confirmReturn')} loading={busy} disabled={cash === '' || busy || (pending > 0 && !failPending)} onPress={go} />}>
      <ThemedText type="small" themeColor="textSecondary">{t('bv.rd.returnHelp')}</ThemedText>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <ThemedText type="smallBold">{t('bv.rd.cashExpected')} : {shop.money(expected)}</ThemedText>
      <NumberBox label={t('bv.rd.cashDeclared')} value={cash} onChange={setCash} />
      {cash !== '' ? <Hint icon={num(cash) === expected ? 'check' : 'triangle-exclamation'} tone={num(cash) === expected ? 'success' : 'danger'}>{t('bv.rd.cashVariance')} : {shop.money(num(cash) - expected)}</Hint> : null}
      {(items.data ?? []).filter((i) => i.active).length > 0 ? <><SectionTitle title={t('bv.rd.emptiesReturned')} />{(items.data ?? []).filter((i) => i.active).map((i) => <NumberBox key={i.id} label={i.name} value={empties[i.id] ?? ''} onChange={(v) => setEmpties({ ...empties, [i.id]: v })} keyboardType="number-pad" />)}</> : null}
      <NumberBox label={t('bv.rd.returnKm')} value={km} onChange={setKm} keyboardType="number-pad" />
      {pending > 0 ? <Switch value={failPending} onChange={setFailPending} label={`${t('bv.rd.failPending')} (${pending})`} /> : null}
      <TextBox label={t('bv.rd.notes')} value={notes} onChangeText={setNotes} multiline autoCapitalize="sentences" />
    </Sheet>
  );
}

function AddSheet({ roundId, onClose, onAdded }: { roundId: string; onClose: () => void; onAdded: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const [q, setQ] = useState('');
  const av = useQuery<Avail[]>(`/api/shop/rounds/available-deliveries${qs({ q: q || undefined })}`, { debounce: 250 });
  const [error, setError] = useState<string | null>(null);
  async function add(d: Avail) {
    try { await shop.call(`/api/shop/rounds/${roundId}/stops`, { method: 'POST', body: { deliveryId: d.id } }); void av.reload(); onAdded(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  return (
    <Sheet visible tall title={t('bv.rd.available')} onClose={onClose}>
      <TextBox label={t('bv.or.search')} value={q} onChangeText={setQ} autoCapitalize="none" />
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {!av.data ? <Skeleton rows={3} height={64} /> : av.data.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('bv.rd.noAvailable')}</ThemedText> : av.data.map((d) => (
        <Row key={d.id} title={d.recipientName ?? d.partyName ?? d.number} subtitle={[d.number, d.address, d.scheduledDate && formatDate(d.scheduledDate, lang), shop.money(d.saleBalance)].filter(Boolean).join(' · ')} right={<IconBtn size={34} name="plus" tone="primary" label={t('bv.rd.add')} onPress={() => void add(d)} />} />
      ))}
    </Sheet>
  );
}

function LoadSheet({ roundId, onClose }: { roundId: string; onClose: () => void }) {
  const { t } = useT();
  const q = useQuery<Loading>(`/api/shop/rounds/${roundId}/loading`);
  const d = q.data;
  return (
    <Sheet visible tall title={t('bv.rd.loadingSheet')} onClose={onClose}>
      {!d ? <Skeleton rows={3} height={56} /> : (
        <>
          <ThemedText type="smallBold">{t('bv.rd.packs', { count: fmt(d.totalPacks) })}{d.capacityPacks != null ? ` · ${t('bv.rd.capacity', { count: fmt(d.capacityPacks) })}` : ''}</ThemedText>
          {d.overCapacity ? <Hint icon="triangle-exclamation" tone="danger">{t('bv.rd.overCapacity')}</Hint> : null}
          {d.lines.map((l) => <Row key={l.productId} title={l.name} right={<ThemedText type="smallBold">{l.packLabel && num(l.packFactor) > 1 ? `${fmt(l.packs)} ${l.packLabel}` : `${fmt(l.baseQty)} ${l.unit ?? ''}`}</ThemedText>} />)}
          {d.deposits.length > 0 ? <><SectionTitle title={t('bv.rd.emptiesToTake')} />{d.deposits.map((x) => <Row key={x.itemId} title={x.itemName} right={<ThemedText type="smallBold">{fmt(x.qty)}</ThemedText>} />)}</> : null}
        </>
      )}
    </Sheet>
  );
}

function RoundSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Round>(`/api/shop/rounds/${id}`);
  const [r, setR] = useState<Round | null>(null);
  const d = r ?? q.data;
  const [panel, setPanel] = useState<string | { stop: Stop } | null>(null);
  const [km, setKm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => { setR(null); void q.reload(); onChanged(); };
  async function act(path: string, body?: unknown, done?: string) {
    setBusy(true); setError(null);
    try { setR(await shop.call<Round>(`/api/shop/rounds/${id}/${path}`, { method: 'POST', body })); if (done) toast(done); onChanged(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  async function move(s: Stop, dir: number) {
    if (!d) return;
    const ids = d.stops.map((x) => x.id); const i = ids.indexOf(s.id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await act('stops/order', { stopIds: ids });
  }
  const canUpdate = shop.can('DELIVERY_ROUNDS', 'update');
  const planning = d?.status === 'PLANNED' || d?.status === 'LOADING';
  const onRoute = d?.status === 'ON_ROUTE';
  return (
    <Sheet visible tall title={d ? `${d.number}${d.name ? ` · ${d.name}` : ''}` : '…'} onClose={onClose}
      footer={d && canUpdate ? <View style={{ gap: 8 }}>
        {d.status === 'PLANNED' ? <Btn variant="secondary" title={t('bv.rd.load')} disabled={busy || d.stops.length === 0} onPress={() => void act('load')} /> : null}
        {planning ? <Btn icon="truck" title={t('bv.rd.depart')} disabled={busy || d.stops.length === 0} onPress={() => void act('depart', { departureKm: km === '' ? undefined : num(km) })} /> : null}
        {onRoute ? <Btn icon="check" title={t('bv.rd.return')} onPress={() => setPanel('return')} /> : null}
        {d.status === 'RETURNED' ? <Btn icon="check" title={t('bv.rd.close')} disabled={busy} onPress={() => void act('close', undefined, t('bv.rd.saved'))} /> : null}
      </View> : undefined}>
      {!d ? <Skeleton rows={3} height={70} /> : (
        <>
          {q.error ? <ErrorNote message={q.error} onRetry={() => void q.reload()} /> : null}
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Badge tone={TONE[d.status] ?? 'neutral'}>{t(`bv.rd.s.${d.status}`)}</Badge>
            <ThemedText type="small" themeColor="textSecondary">{[formatDate(d.roundDate, lang), d.vehicleName, d.plate, d.driverName].filter(Boolean).join(' · ')}</ThemedText></View>
          <Card style={{ gap: 4 }}>
            <ThemedText type="smallBold">{t('bv.rd.stops', { done: num(d.deliveredCount) + num(d.failedCount), count: d.stopCount })}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{t('bv.rd.toCollect')} {shop.money(d.toCollect ?? 0)} · {t('bv.rd.collected', { amount: shop.money(d.collected) })}</ThemedText>
            {d.cashDeclared != null ? <ThemedText type="small" style={{ color: num(d.cashVariance) === 0 ? undefined : '#c0392b' }}>{t('bv.rd.cashVariance')} : {shop.money(d.cashVariance ?? 0)}</ThemedText> : null}
          </Card>
          {d.returnNotes ? <Hint icon="circle-info">{d.returnNotes}</Hint> : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Btn small variant="secondary" title={t('bv.rd.loadingSheet')} onPress={() => setPanel('loading')} />
            <PdfButton small path={`/api/shop/pdf/rounds/${d.id}`} name={`tournee-${d.number}.pdf`} label={t('bv.rd.pdf')} />
            {canUpdate && planning ? <Btn small variant="secondary" icon="plus" title={t('bv.rd.addStops')} onPress={() => setPanel('add')} /> : null}
            {canUpdate && planning ? <Btn small variant="secondary" title={t('bv.or.edit')} onPress={() => setPanel('edit')} /> : null}
            {canUpdate && planning ? <Btn small variant="ghost" title={t('bv.rd.cancel')} onPress={() => void act('cancel')} /> : null}
          </View>
          {canUpdate && planning ? <NumberBox label={t('bv.rd.departKm')} value={km} onChange={setKm} keyboardType="number-pad" /> : null}
          <SectionTitle title={t('bv.rd.stopsTitle')} />
          {d.stops.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('bv.rd.noStops')}</ThemedText> : d.stops.map((s, i) => (
            <Card key={s.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ThemedText type="smallBold" themeColor="textSecondary">{i + 1}</ThemedText>
                <View style={{ flex: 1, gap: 2 }}><ThemedText type="smallBold">{s.recipientName ?? s.partyName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{[s.address, s.saleNumber && `${s.saleNumber} · ${shop.money(s.saleBalance)}`, num(s.partyDepositQty) > 0 && t('bv.rd.depositsHeld', { qty: fmt(s.partyDepositQty) })].filter(Boolean).join(' · ')}</ThemedText></View>
                <Badge tone={STOP_TONE[s.status] ?? 'neutral'}>{t(`bv.rd.st.${s.status}`)}</Badge>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {s.phone ? <Btn small variant="ghost" icon="phone" title={s.phone} onPress={() => void Linking.openURL(`tel:${s.phone}`)} /> : null}
                {s.address ? <Btn small variant="ghost" icon="location-dot" title="GPS" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address ?? '')}`)} /> : null}
                {canUpdate && onRoute && s.status === 'PENDING' ? <Btn small title={t('bv.rd.deliverStop')} onPress={() => setPanel({ stop: s })} /> : null}
                {canUpdate && planning ? <><IconBtn size={34} name="arrow-up" label={t('bv.rd.moveUp')} onPress={() => void move(s, -1)} /><IconBtn size={34} name="arrow-down" label={t('bv.rd.moveDown')} onPress={() => void move(s, 1)} /><IconBtn size={34} name="trash" label={t('bv.rd.remove')} onPress={() => void act(`stops/${s.id}/remove`)} /></> : null}
              </View>
            </Card>
          ))}
          {panel === 'edit' ? <RoundForm initial={d} onClose={() => setPanel(null)} onSaved={(res) => { setPanel(null); setR(res); toast(t('bv.rd.saved')); onChanged(); }} /> : null}
          {panel === 'add' ? <AddSheet roundId={d.id} onClose={() => setPanel(null)} onAdded={refresh} /> : null}
          {panel === 'loading' ? <LoadSheet roundId={d.id} onClose={() => setPanel(null)} /> : null}
          {panel === 'return' ? <ReturnSheet round={d} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} /> : null}
          {typeof panel === 'object' && panel ? <StopSheet round={d} stop={panel.stop} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} /> : null}
        </>
      )}
    </Sheet>
  );
}

function VehicleSheet({ vehicle, onClose, onSaved }: { vehicle: Vehicle | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(vehicle?.id ?? uuid());
  const [name, setName] = useState(vehicle?.name ?? '');
  const [plate, setPlate] = useState(vehicle?.plate ?? '');
  const [cap, setCap] = useState(vehicle?.capacityPacks != null ? String(vehicle.capacityPacks) : '');
  const [driver, setDriver] = useState(vehicle?.defaultDriver ?? '');
  const [active, setActive] = useState(vehicle?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try { await shop.call(vehicle ? `/api/shop/rounds/vehicles/${vehicle.id}` : '/api/shop/rounds/vehicles', { method: vehicle ? 'PUT' : 'POST', body: { id: id.current, name: name.trim(), plate: plate || undefined, capacityPacks: cap === '' ? undefined : num(cap), defaultDriver: driver || undefined, active } }); onSaved(); }
    catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible title={vehicle ? t('bv.rd.vehicleEdit') : t('bv.rd.vehicleNew')} onClose={onClose} footer={<Btn icon="check" title={busy ? t('ws.saving') : t('bv.x.confirm')} loading={busy} disabled={!name.trim() || busy} onPress={save} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <TextBox label={t('bv.rd.vName')} value={name} onChangeText={setName} autoCapitalize="words" />
      <TextBox label={t('bv.rd.plate')} value={plate} onChangeText={setPlate} autoCapitalize="characters" />
      <NumberBox label={t('bv.rd.capacityPacks')} value={cap} onChange={setCap} />
      <TextBox label={t('bv.rd.defaultDriver')} value={driver} onChangeText={setDriver} autoCapitalize="words" />
      <Switch value={active} onChange={setActive} label={t('bv.rd.vActive')} />
    </Sheet>
  );
}

function Vehicles() {
  const { t } = useT();
  const shop = useShop();
  const q = useQuery<Vehicle[]>('/api/shop/rounds/vehicles');
  const [form, setForm] = useState<{ v: Vehicle | null } | null>(null);
  const canCreate = shop.can('DELIVERY_ROUNDS', 'create');
  return (
    <>
      {canCreate ? <Btn small variant="secondary" icon="plus" title={t('bv.rd.vehicleNew')} onPress={() => setForm({ v: null })} /> : null}
      {q.error ? <ErrorNote message={q.error} onRetry={() => void q.reload()} /> : null}
      {!q.data ? <Skeleton rows={3} height={64} /> : q.data.length === 0 ? <Empty icon="truck" title={t('bv.rd.vEmpty')} text={t('bv.rd.vEmptyText')} /> : q.data.map((v) => (
        <Row key={v.id} icon="truck" title={v.name} subtitle={[v.plate, v.capacityPacks != null && t('bv.rd.capacity', { count: fmt(v.capacityPacks) }), v.defaultDriver, num(v.openRounds) > 0 && t('bv.rd.openRounds', { count: v.openRounds })].filter(Boolean).join(' · ')} onPress={canCreate ? () => setForm({ v }) : undefined} right={!v.active ? <Badge>{t('bv.rb.st.CLOSED')}</Badge> : undefined} />
      ))}
      {form ? <VehicleSheet vehicle={form.v} onClose={() => setForm(null)} onSaved={() => { setForm(null); void q.reload(); }} /> : null}
    </>
  );
}

/** Tournees de livraison : planification, chargement, arrets (livre/echec, encaissement, vides, meme hors ligne), retour avec ecarts. */
export default function Rounds({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const [view, setView] = useState('OPEN');
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = useInfinite<Round>('/api/shop/rounds', { status: view === 'ALL' || view === 'vehicles' ? undefined : view }, { enabled: view !== 'vehicles' });
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('bv.rd.subtitle')} onRefresh={() => void list.reload()} refreshing={list.refreshing} onEndReached={list.loadMore}
      right={shop.can('DELIVERY_ROUNDS', 'create') ? <IconBtn name="plus" tone="primary" label={t('bv.rd.new')} onPress={() => setForm(true)} /> : undefined}>
      <Chips value={view} onChange={setView} options={TABS.map((s) => ({ value: s, label: t(`bv.rd.tab.${s}`) }))} />
      {view === 'vehicles' ? <Vehicles /> : (
        <>
          {list.error ? <ErrorNote message={list.error} onRetry={() => void list.reload()} /> : null}
          {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={68} /> : list.items.length === 0 ? <Empty icon="truck" title={t('bv.rd.empty')} text={t('bv.rd.emptyText')} /> : list.items.map((x) => (
            <Row key={x.id} icon="truck" title={`${x.number}${x.name ? ` · ${x.name}` : ''}`} onPress={() => setOpen(x.id)}
              subtitle={[formatDate(x.roundDate, lang), x.vehicleName, x.driverName, t('bv.rd.stops', { done: num(x.deliveredCount) + num(x.failedCount), count: x.stopCount }), num(x.collected) > 0 && t('bv.rd.collected', { amount: shop.money(x.collected) })].filter(Boolean).join(' · ')}
              right={<Badge tone={TONE[x.status] ?? 'neutral'}>{t(`bv.rd.s.${x.status}`)}</Badge>} />
          ))}
          {list.hasMore ? <Btn variant="secondary" small loading={list.loadingMore} title={t('list.more')} onPress={list.loadMore} /> : null}
        </>
      )}
      {form ? <RoundForm onClose={() => setForm(false)} onSaved={(r) => { setForm(false); toast(t('bv.rd.saved')); setOpen(r.id); void list.reload(); }} /> : null}
      {open ? <RoundSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}
