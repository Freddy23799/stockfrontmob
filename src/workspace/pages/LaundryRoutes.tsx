import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Linking, View } from 'react-native';

import { errText } from '@/components/laundry-order';
import { ListFooter } from '@/components/list-footer';
import { PartyPicker, type Party } from '@/components/party-picker';
import { PaymentPanel } from '@/components/payment-panel';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Fab, Hint, Screen, Sheet, Skeleton, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { formatDate, uuid } from '@/lib/format';
import { API, num, ROUTE_TONE, STOP_TONE, today } from '@/lib/laundry';
import { LIST_PROPS } from '@/lib/list';
import { useGo } from '@/lib/nav';
import { initPay, resetPay, settle } from '@/lib/payments';
import { useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Stop = { id: string; routeId?: string; sequence?: number; kind: 'PICKUP' | 'DELIVERY'; partyId?: string; contactName: string; phone: string; address: string; scheduledDate: string; windowFrom?: string; windowTo?: string; orderNumber?: string; orderBalance?: number; itemsHint?: string; note?: string; status: string; failureReason?: string; resultOrderNumber?: string };
type Route = { id: string; number: string; date: string; driverName: string; vehicle?: string; status: string; notes?: string; stopsCount: number; doneCount: number; failedCount: number; toCollect: number; stops: Stop[] };

function StopForm({ initial, onClose, onSaved }: { initial: Stop | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(initial?.id ?? uuid());
  const [f, setF] = useState({ kind: initial?.kind ?? 'PICKUP', contactName: initial?.contactName ?? '', phone: initial?.phone ?? '', address: initial?.address ?? '', scheduledDate: initial?.scheduledDate ?? today(), windowFrom: initial?.windowFrom ?? '', windowTo: initial?.windowTo ?? '', itemsHint: initial?.itemsHint ?? '', note: initial?.note ?? '' });
  const [party, setParty] = useState<Party | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (c: Partial<typeof f>) => setF((x) => ({ ...x, ...c }));
  const valid = f.contactName.trim() && f.phone.trim() && f.address.trim() && /^\d{4}-\d{2}-\d{2}$/.test(f.scheduledDate);
  async function save() {
    setBusy(true); setError(null);
    try {
      await shop.call(initial ? `${API}/stops/${initial.id}` : `${API}/stops`, { method: initial ? 'PUT' : 'POST', body: { id: id.current, ...f, partyId: party?.id ?? initial?.partyId, windowFrom: f.windowFrom || undefined, windowTo: f.windowTo || undefined, itemsHint: f.itemsHint || undefined, note: f.note || undefined } });
      onSaved();
    } catch (e) { setError(errText(e, t('common.error'))); setBusy(false); }
  }
  return (
    <Sheet visible tall title={initial ? t('ld.editStop') : t('ld.newStop')} onClose={onClose} footer={<Btn title={t('common.save')} disabled={!valid} loading={busy} onPress={() => void save()} />}>
      {error ? <ErrorNote message={error} /> : null}
      <Chips scroll={false} value={f.kind} onChange={(k) => set({ kind: k })} options={(['PICKUP', 'DELIVERY'] as const).map((k) => ({ value: k, label: t(`ld.stop.${k}`), icon: k === 'PICKUP' ? 'inbox' : 'truck' }))} />
      <PartyPicker role="CUSTOMER" label={shop.v('customer')} value={party?.id ?? initial?.partyId ?? null} selected={party} onChange={(pid, p) => { setParty(pid ? p ?? null : null); if (p) set({ contactName: f.contactName || p.name, phone: f.phone || p.phone || '' }); }} />
      <TextBox label={t('ld.customerName')} value={f.contactName} onChangeText={(v) => set({ contactName: v })} maxLength={120} />
      <TextBox label={t('ld.customerPhone')} value={f.phone} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" maxLength={30} />
      <TextBox label={t('ld.address')} value={f.address} onChangeText={(v) => set({ address: v })} multiline />
      <TextBox label={`${t('ld.date')} (AAAA-MM-JJ)`} value={f.scheduledDate} onChangeText={(v) => set({ scheduledDate: v })} placeholder="2026-10-26" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><TextBox label={t('ld.windowFrom')} value={f.windowFrom} onChangeText={(v) => set({ windowFrom: v })} placeholder="09:00" /></View>
        <View style={{ flex: 1 }}><TextBox label={t('ld.windowTo')} value={f.windowTo} onChangeText={(v) => set({ windowTo: v })} placeholder="12:00" /></View>
      </View>
      <TextBox label={t('ld.itemsHint')} value={f.itemsHint} onChangeText={(v) => set({ itemsHint: v })} placeholder={t('ld.itemsHintEx')} maxLength={200} />
      <TextBox label={t('ld.note')} value={f.note} onChangeText={(v) => set({ note: v })} maxLength={200} />
    </Sheet>
  );
}

function RouteForm({ onClose, onSaved }: { onClose: () => void; onSaved: (r: Route) => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(uuid());
  const [date, setDate] = useState(today());
  const [driver, setDriver] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [stopIds, setStopIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useQuery<{ items: Stop[] }>(`${API}/stops?status=PENDING&unassigned=true&size=100`);
  async function save() {
    setBusy(true); setError(null);
    try { onSaved(await shop.call<Route>(`${API}/routes`, { method: 'POST', body: { id: id.current, date, driverName: driver.trim(), vehicle: vehicle.trim() || undefined, stopIds } })); } catch (e) { setError(errText(e, t('common.error'))); setBusy(false); }
  }
  const toggle = (sid: string) => setStopIds((l) => (l.includes(sid) ? l.filter((x) => x !== sid) : [...l, sid]));
  const move = (sid: string, d: number) => setStopIds((l) => { const i = l.indexOf(sid); const j = i + d; if (i < 0 || j < 0 || j >= l.length) return l; const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  return (
    <Sheet visible tall title={t('ld.newRoute')} onClose={onClose} footer={<Btn title={t('ld.createRoute')} disabled={!driver.trim()} loading={busy} onPress={() => void save()} />}>
      {error ? <ErrorNote message={error} /> : null}
      <TextBox label={`${t('ld.date')} (AAAA-MM-JJ)`} value={date} onChangeText={setDate} />
      <TextBox label={t('ld.driver')} value={driver} onChangeText={setDriver} maxLength={80} />
      <TextBox label={t('ld.vehicle')} value={vehicle} onChangeText={setVehicle} maxLength={40} />
      <ThemedText type="smallBold">{t('ld.pendingStops')}</ThemedText>
      {pending.loading && !pending.data ? <Skeleton rows={2} height={60} /> : (pending.data?.items ?? []).length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('ld.noPendingStops')}</ThemedText> : (pending.data?.items ?? []).map((s) => {
        const on = stopIds.includes(s.id);
        return (
          <Card key={s.id} onPress={() => toggle(s.id)} tone={on ? 'info' : undefined}>
            <ThemedText type="smallBold">{on ? `${stopIds.indexOf(s.id) + 1}. ` : ''}{s.contactName} · {t(`ld.stop.${s.kind}`)} · {formatDate(s.scheduledDate, 'fr')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{s.address}</ThemedText>
            {on ? <View style={{ flexDirection: 'row', gap: 8 }}><Btn small variant="secondary" icon="arrow-up" title={t('ld.up')} onPress={() => move(s.id, -1)} /><Btn small variant="secondary" icon="arrow-down" title={t('ld.down')} onPress={() => move(s.id, 1)} /></View> : null}
          </Card>
        );
      })}
    </Sheet>
  );
}

function StopCard({ s, route, onChanged }: { s: Stop; route: Route; onChanged: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const go = useGo();
  const toast = useToast();
  const methods = shop.ws.manifest.paymentMethods ?? ['CASH'];
  const [mode, setMode] = useState<null | 'done' | 'failed'>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [again, setAgain] = useState('');
  const [pin, setPin] = useState('');
  const [lost, setLost] = useState(false);
  const [proof, setProof] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [pay, setPay] = useState(() => initPay(methods[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useRef<string[]>([]);
  const doneId = useRef(uuid());
  const due = num(s.orderBalance);
  const sett = settle(pay, due);
  const live = route.status === 'IN_PROGRESS' && s.status === 'PENDING';
  const canUpdate = shop.can('LAUNDRY_ROUTES', 'update');
  async function post(path: string, body: unknown, msg: string) {
    setBusy(true); setError(null);
    try { await shop.call(`${API}/stops/${s.id}/${path}`, { method: 'POST', body }); toast(msg); setMode(null); onChanged(); } catch (e) { setError(errText(e, t('common.error'))); } finally { setBusy(false); }
  }
  function finishDelivery() {
    while (ids.current.length < sett.payments.length) ids.current.push(uuid());
    void post('done', { note: note || undefined, receivedBy: receivedBy || undefined, pickupId: doneId.current, code: lost ? undefined : pin || undefined, ticketLost: lost || undefined, idProof: lost ? proof : undefined,
      payments: sett.payments.map((p, i) => ({ id: ids.current[i], method: p.method, amount: p.amount, reference: p.reference })) }, t('ld.stopDone'));
    setPay((p) => resetPay(p));
  }
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Badge tone="primary">{String(s.sequence ?? '')}</Badge>
        <ThemedText type="smallBold" style={{ flex: 1 }}>{s.contactName}</ThemedText>
        <Badge tone={s.kind === 'PICKUP' ? 'info' : 'warning'}>{t(`ld.stop.${s.kind}`)}</Badge>
        <Badge tone={STOP_TONE[s.status]}>{t(`ld.stopS.${s.status}`)}</Badge>
      </View>
      <ThemedText type="small" themeColor="textSecondary">{s.address}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{[s.phone, s.windowFrom && `${s.windowFrom}${s.windowTo ? `–${s.windowTo}` : ''}`, s.orderNumber && `${t('ld.ticket')} ${s.orderNumber}`, s.itemsHint].filter(Boolean).join(' · ')}</ThemedText>
      {s.kind === 'DELIVERY' && due > 0 ? <ThemedText type="small" themeColor="danger">{t('ld.toCollect', { amount: shop.money(due) })}</ThemedText> : null}
      {s.failureReason ? <ThemedText type="small" themeColor="danger">{s.failureReason}</ThemedText> : null}
      {s.resultOrderNumber ? <ThemedText type="small" themeColor="textSecondary">{t('ld.createdTicket', { number: s.resultOrderNumber })}</ThemedText> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {s.phone ? <Btn small variant="secondary" icon="phone" title={t('ld.call')} onPress={() => void Linking.openURL(`tel:${s.phone}`)} /> : null}
        {live && canUpdate && !mode ? (
          <>
            {s.kind === 'PICKUP' && shop.can('LAUNDRY_ORDERS', 'create') ? <Btn small icon="plus" title={t('ld.createTicketFromStop')} onPress={() => go.page('laundry-counter', { stop: JSON.stringify(s) })} /> : null}
            <Btn small variant="secondary" icon="check" title={t('ld.markDone')} onPress={() => setMode('done')} />
            <Btn small variant="danger" title={t('ld.markFailed')} onPress={() => setMode('failed')} />
          </>
        ) : null}
      </View>
      {error ? <ErrorNote message={error} /> : null}
      {mode === 'done' ? (
        <View style={{ gap: 8 }}>
          {s.kind === 'DELIVERY' ? (
            <>
              <TextBox label={t('ld.pickupCode')} value={pin} onChangeText={setPin} keyboardType="number-pad" editable={!lost} />
              <TextBox label={t('ld.receivedBy')} value={receivedBy} onChangeText={setReceivedBy} />
              <Switch value={lost} onChange={setLost} label={t('ld.ticketLost')} />
              {lost ? <TextBox label={t('ld.idProof')} value={proof} onChangeText={setProof} /> : null}
              {due > 0 ? <PaymentPanel pay={pay} setPay={setPay} due={due} methods={methods} res={sett} money={shop.money} currency={shop.currency} /> : null}
            </>
          ) : null}
          <TextBox label={t('ld.note')} value={note} onChangeText={setNote} />
          <Btn title={t('ld.markDone')} loading={busy} disabled={s.kind === 'DELIVERY' && due > 0 && sett.remaining > 0} onPress={() => (s.kind === 'DELIVERY' ? finishDelivery() : void post('done', { note: note || undefined, receivedBy: receivedBy || undefined }, t('ld.stopDone')))} />
          <Btn variant="ghost" small title={t('common.cancel')} onPress={() => setMode(null)} />
        </View>
      ) : null}
      {mode === 'failed' ? (
        <View style={{ gap: 8 }}>
          <TextBox label={t('ld.failReason')} value={reason} onChangeText={setReason} />
          <TextBox label={`${t('ld.reschedule')} (AAAA-MM-JJ)`} value={again} onChangeText={setAgain} hint={t('ld.rescheduleHelp')} />
          <Btn variant="danger" title={t('ld.markFailed')} loading={busy} disabled={!reason.trim()} onPress={() => void post('failed', { reason: reason.trim(), rescheduleDate: again || undefined }, t('ld.stopFailed'))} />
          <Btn variant="ghost" small title={t('common.cancel')} onPress={() => setMode(null)} />
        </View>
      ) : null}
    </Card>
  );
}

function RouteSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Route>(`${API}/routes/${id}`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const r = q.data;
  const reload = () => { void q.reload(); onChanged(); };
  async function act(path: string, msg: string) {
    setBusy(true); setError(null);
    try { await shop.call(`${API}/routes/${id}/${path}`, { method: 'POST' }); toast(msg); reload(); } catch (e) { setError(errText(e, t('common.error'))); } finally { setBusy(false); }
  }
  if (!r) return <Sheet visible tall title="…" onClose={onClose}>{q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <Skeleton rows={3} height={90} />}</Sheet>;
  const canUpdate = shop.can('LAUNDRY_ROUTES', 'update');
  return (
    <Sheet visible tall title={`${t('ld.route')} ${r.number}`} onClose={onClose}
      footer={<View style={{ gap: 8 }}>
        {canUpdate && r.status === 'PLANNED' ? <Btn icon="play" title={t('ld.start')} disabled={busy || r.stops.length === 0} onPress={() => void act('start', t('ld.routeStarted'))} /> : null}
        <PdfButton small path={`/api/shop/pdf/laundry/routes/${r.id}`} name={`tournee-${r.number}.pdf`} label={t('ld.routeSheet')} />
      </View>}>
      {error ? <ErrorNote message={error} /> : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <ThemedText type="smallBold" style={{ flex: 1 }}>{r.driverName}{r.vehicle ? ` · ${r.vehicle}` : ''}</ThemedText>
        <Badge tone={ROUTE_TONE[r.status]}>{t(`ld.routeS.${r.status}`)}</Badge>
      </View>
      <ThemedText type="small" themeColor="textSecondary">{formatDate(r.date, 'fr')} · {r.doneCount}/{r.stopsCount} {t('ld.stops')}{num(r.failedCount) > 0 ? ` · ${r.failedCount} ✗` : ''}{num(r.toCollect) > 0 ? ` · ${t('ld.toCollectTotal')} ${shop.money(r.toCollect)}` : ''}</ThemedText>
      {r.status === 'PLANNED' ? <Hint>{t('ld.startHint')}</Hint> : null}
      {r.stops.map((s) => <StopCard key={s.id} s={s} route={r} onChanged={reload} />)}
      {canUpdate && ['PLANNED', 'IN_PROGRESS'].includes(r.status) ? <Btn variant="danger" small title={t('ld.cancelRoute')} disabled={busy} onPress={async () => { if (await confirmAction(t('ld.cancelRoute'), t('ld.cancelRouteText'), t('ld.cancelRoute'), t('common.cancel'))) void act('cancel', t('ld.routeCancelled')); }} /> : null}
    </Sheet>
  );
}

/** Collecte et livraison a domicile : demandes, tournees du jour, arrets (fait / echec avec replanification). */
export default function LaundryRoutes({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  useLocalSearchParams();
  const [view, setView] = useState<'routes' | 'requests'>('routes');
  const [stopForm, setStopForm] = useState<Stop | 'new' | null>(null);
  const [routeForm, setRouteForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const routes = useInfinite<Route>(`${API}/routes`, {});
  const stops = useInfinite<Stop>(`${API}/stops`, { status: 'PENDING', unassigned: true });
  const canCreate = shop.can('LAUNDRY_ROUTES', 'create');
  const cur = view === 'routes' ? routes : stops;
  const reload = () => { void routes.reload(); void stops.reload(); };
  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('ld.routesSubtitle')}>
      <Chips scroll={false} value={view} onChange={setView} options={[{ value: 'routes', label: t('ld.tab.routes') }, { value: 'requests', label: `${t('ld.tab.requests')}${stops.total > 0 ? ` (${stops.total})` : ''}` }]} />
      <View style={{ height: 8 }} />
      {cur.error ? <ErrorNote message={cur.error} onRetry={cur.reload} /> : null}
      {cur.loading && cur.items.length === 0 ? <Skeleton rows={4} height={76} /> : view === 'routes' ? (
        <FlatList {...LIST_PROPS} data={routes.items} keyExtractor={(r) => r.id} contentContainerStyle={{ gap: 8, paddingBottom: 120 }} onEndReached={routes.loadMore} refreshing={routes.refreshing} onRefresh={routes.reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="truck" title={t('ld.routesEmpty')} text={t('ld.routesEmptyText')} />}
          ListFooterComponent={<ListFooter shown={routes.items.length} total={routes.total} hasMore={routes.hasMore} loading={routes.loadingMore} failed={false} onMore={routes.loadMore} />}
          renderItem={({ item: r }) => (
            <Card onPress={() => setOpen(r.id)}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{r.number}</ThemedText><Badge tone={ROUTE_TONE[r.status]}>{t(`ld.routeS.${r.status}`)}</Badge></View>
              <ThemedText type="small" themeColor="textSecondary">{[formatDate(r.date, lang), r.driverName, r.vehicle, `${r.doneCount}/${r.stopsCount} ${t('ld.stops')}`].filter(Boolean).join(' · ')}</ThemedText>
              {num(r.toCollect) > 0 ? <ThemedText type="small" themeColor="danger">{t('ld.toCollect', { amount: shop.money(r.toCollect) })}</ThemedText> : null}
            </Card>
          )} />
      ) : (
        <FlatList {...LIST_PROPS} data={stops.items} keyExtractor={(s) => s.id} contentContainerStyle={{ gap: 8, paddingBottom: 120 }} onEndReached={stops.loadMore} refreshing={stops.refreshing} onRefresh={stops.reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="inbox" title={t('ld.requestsEmpty')} text={t('ld.requestsEmptyText')} />}
          ListFooterComponent={<ListFooter shown={stops.items.length} total={stops.total} hasMore={stops.hasMore} loading={stops.loadingMore} failed={false} onMore={stops.loadMore} />}
          renderItem={({ item: s }) => (
            <Card onPress={canCreate ? () => setStopForm(s) : undefined}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{s.contactName}</ThemedText><Badge tone={s.kind === 'PICKUP' ? 'info' : 'warning'}>{t(`ld.stop.${s.kind}`)}</Badge></View>
              <ThemedText type="small" themeColor="textSecondary">{[formatDate(s.scheduledDate, lang), s.windowFrom && `${s.windowFrom}${s.windowTo ? `–${s.windowTo}` : ''}`, s.address].filter(Boolean).join(' · ')}</ThemedText>
            </Card>
          )} />
      )}
      {canCreate ? <Fab label={view === 'routes' ? t('ld.newRoute') : t('ld.newStop')} onPress={() => (view === 'routes' ? setRouteForm(true) : setStopForm('new'))} /> : null}
      {canCreate && view === 'routes' ? <View style={{ position: 'absolute', left: 16, bottom: 24 }}><Btn small variant="secondary" icon="plus" title={t('ld.newStop')} onPress={() => setStopForm('new')} /></View> : null}
      {stopForm ? <StopForm initial={stopForm === 'new' ? null : stopForm} onClose={() => setStopForm(null)} onSaved={() => { setStopForm(null); toast(t('ld.stopSaved')); reload(); }} /> : null}
      {routeForm ? <RouteForm onClose={() => setRouteForm(false)} onSaved={(r) => { setRouteForm(false); toast(t('ld.routeSaved')); setView('routes'); setOpen(r.id); reload(); }} /> : null}
      {open ? <RouteSheet id={open} onClose={() => setOpen(null)} onChanged={reload} /> : null}
    </Screen>
  );
}
