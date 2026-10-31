import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { PartyPicker } from '@/components/party-picker';
import { PdfButton } from '@/components/pdf-button';
import { ProductPicker } from '@/components/product-picker';
import { SalonCheckout, type SalonAppt } from '@/components/salon-checkout';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, Row, Screen, Sheet, Skeleton, Stack, TextBox, useToast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDateTime, num, uuid, type Product } from '@/lib/format';
import { useGo } from '@/lib/nav';
import { useOffline } from '@/lib/offline';
import { qs, useQuery } from '@/lib/query';
import { applyAppts, NEXT_STATUS, patchAppt, useSalonOverlay } from '@/lib/salon-local';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/salon';
const TONE: Record<string, Tone> = { BOOKED: 'info', CONFIRMED: 'info', ARRIVED: 'warning', IN_SERVICE: 'warning', DONE: 'success', NO_SHOW: 'danger', CANCELLED: 'danger' };
type Svc = { id: string; productId: string; name: string; durationMin: number; unitPrice: number | string; stylistId?: string | null; stylistName?: string | null; packageId?: string | null };
type Appt = SalonAppt & { number: string; status: string; startsAt: string; endsAt: string; phone?: string | null; stylistColor?: string | null; resourceName?: string | null; note?: string | null; clientAlert: boolean; saleDocumentId?: string | null; services: Svc[] };
type Stylist = { id: string; name: string; color: string; active: boolean; bookable: boolean };
type Resource = { id: string; name: string; active: boolean };
type Reminder = { id: string; startsAt: string; customerName?: string | null; phone?: string | null; stylistName?: string | null; services: string[]; remindedAt?: string | null; remindedVia?: string | null; message: string; whatsappUrl?: string | null; telUrl?: string | null };
type Slot = { stylistId: string; stylistName: string; starts: string[] };
type Today = { upcoming: number; waiting: number; in_service: number; done: number; no_show: number };

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
const duration = (p?: Product | null) => num((p?.attributes as { durationMin?: unknown } | undefined)?.durationMin) || 30;

function Book({ day, stylists, resources, onClose, onBooked }: { day: string; stylists: Stylist[]; resources: Resource[]; onClose: () => void; onBooked: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const { online } = useOffline();
  const [partyId, setPartyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [services, setServices] = useState<Product[]>([]);
  const [picker, setPicker] = useState<Product | null>(null);
  const [stylistId, setStylistId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [date, setDate] = useState(day);
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const minutes = services.reduce((a, p) => a + duration(p) + num((p.attributes as { bufferMin?: unknown } | undefined)?.bufferMin), 0);
  const total = services.reduce((a, p) => a + num(p.salePrice), 0);

  async function findSlots() {
    if (!minutes) return;
    try { setSlots(await shop.call<Slot[]>(`${API}/slots${qs({ date, duration: minutes, stylistId, resourceId })}`)); } catch { setSlots(null); }
  }
  async function submit(force = false) {
    setBusy(true); setError(null); setCode(null);
    try {
      const [h, m] = time.split(':').map(Number);
      const start = new Date(`${date}T00:00:00`); start.setHours(h, m, 0, 0);
      await shop.call(`${API}/appointments`, { method: 'POST', body: { id: uuid(), partyId: partyId || undefined, customerName: partyId ? undefined : name.trim() || undefined, phone: partyId ? undefined : phone.trim() || undefined,
        stylistId: stylistId || undefined, resourceId: resourceId || undefined, startsAt: start.toISOString(), force: force || undefined, services: services.map((p) => ({ productId: p.id })) } });
      onBooked();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setCode(e instanceof ApiError ? (e as ApiError & { code?: string }).code ?? null : null); } finally { setBusy(false); }
  }
  const valid = services.length > 0 && /^\d{1,2}:\d{2}$/.test(time) && date;
  return (
    <Sheet visible title={t('sl.newAppointment')} onClose={onClose} tall footer={<Btn icon="check" title={busy ? t('ws.saving') : `${t('sl.book')} · ${shop.money(total)}`} loading={busy} disabled={!valid || !online} onPress={() => void submit(false)} />}>
      <View style={{ gap: 12 }}>
        {!online ? <Hint tone="warning" icon="wifi">{t('sl.needsOnline')}</Hint> : null}
        {error ? <Hint tone="danger">{error}</Hint> : null}
        {error && shop.owner && (code === 'OUTSIDE_HOURS' || code === 'STYLIST_OFF') ? <Btn small variant="secondary" title={t('sl.force')} onPress={() => void submit(true)} /> : null}
        {shop.can('CUSTOMERS', 'view') ? <PartyPicker role="CUSTOMER" label={shop.v('customer')} value={partyId} onChange={(id) => setPartyId(id)} /> : null}
        {!partyId ? <><TextBox label={t('sl.clientName')} value={name} onChangeText={setName} maxLength={120} /><TextBox label={t('sl.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={30} /></> : null}
        <ProductPicker label={t('sl.services')} value={picker} onChange={(p) => { if (p) { setServices((a) => [...a, p]); setSlots(null); } setPicker(null); }} />
        {services.map((p, i) => <Row key={i} title={p.name} subtitle={`${duration(p)} min`} meta={shop.money(num(p.salePrice))} right={<Btn small variant="ghost" title="−" onPress={() => { setServices((a) => a.filter((_, j) => j !== i)); setSlots(null); }} />} />)}
        <ThemedText type="small">{t('sl.stylist')}</ThemedText>
        <Chips value={stylistId} onChange={(v) => { setStylistId(v); setSlots(null); }} options={[{ value: '', label: t('sl.noPref') }, ...stylists.map((s) => ({ value: s.id, label: s.name }))]} />
        {resources.length > 0 ? <><ThemedText type="small">{t('sl.resource')}</ThemedText><Chips value={resourceId} onChange={(v) => { setResourceId(v); setSlots(null); }} options={[{ value: '', label: t('sl.anyResource') }, ...resources.filter((r) => r.active).map((r) => ({ value: r.id, label: r.name }))]} /></> : null}
        <DateField label={t('sl.date')} value={date} onChange={(v) => { setDate(v); setSlots(null); }} />
        <TextBox label={t('sl.time')} value={time} onChangeText={setTime} placeholder="14:30" keyboardType="numbers-and-punctuation" maxLength={5} />
        {minutes > 0 ? <Btn small variant="secondary" icon="clock" title={t('sl.freeSlots')} onPress={() => void findSlots()} /> : null}
        {slots?.map((st) => (
          <View key={st.stylistId} style={{ gap: 6 }}>
            <ThemedText type="smallBold">{st.stylistName}</ThemedText>
            {st.starts.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('sl.noSlot')}</ThemedText> : <Chips scroll={false} value={stylistId === st.stylistId ? time : ''} onChange={(h) => { setTime(h); setStylistId(st.stylistId); }} options={st.starts.slice(0, 24).map((h) => ({ value: h, label: h }))} />}
          </View>
        ))}
      </View>
    </Sheet>
  );
}

function Reminders({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const [hours, setHours] = useState('48');
  const q = useQuery<Reminder[]>(`${API}/reminders${qs({ hours })}`);
  async function mark(r: Reminder, via: string, url?: string | null) {
    if (url) void Linking.openURL(url).catch(() => undefined);
    try { await shop.call(`${API}/appointments/${r.id}/reminded`, { method: 'POST', body: { via } }); await q.reload(); onChanged(); } catch { /* hors ligne : le prochain essai marquera */ }
  }
  return (
    <Sheet visible title={t('sl.remindersTitle')} onClose={onClose} tall>
      <View style={{ gap: 12 }}>
        <ThemedText type="small" themeColor="textSecondary">{t('sl.remindersHint')}</ThemedText>
        <Chips scroll={false} value={hours} onChange={setHours} options={['24', '48', '72', '168'].map((h) => ({ value: h, label: `${h} ${t('sl.hoursUnit')}` }))} />
        {q.error && !q.data ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
        {!q.data ? <Skeleton rows={3} /> : q.data.length === 0 ? <ThemedText themeColor="textSecondary">{t('sl.remindersEmpty')}</ThemedText> : q.data.map((r) => (
          <Card key={r.id}>
            <ThemedText type="smallBold">{formatDateTime(r.startsAt, lang)} · {r.customerName ?? t('sl.walkIn')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{r.services.join(', ')}{r.stylistName ? ` · ${r.stylistName}` : ''}</ThemedText>
            {r.remindedAt ? <Badge tone="success">{t('sl.remindedVia', { via: t(`sl.via.${r.remindedVia ?? 'OTHER'}`) })}</Badge> : null}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {r.whatsappUrl ? <Btn small icon="whatsapp" title={t('sl.whatsapp')} onPress={() => void mark(r, 'WHATSAPP', r.whatsappUrl)} /> : null}
              {r.telUrl ? <Btn small variant="secondary" icon="phone" title={t('sl.call.phone')} onPress={() => void mark(r, 'PHONE', r.telUrl)} /> : null}
              {!r.remindedAt ? <Btn small variant="ghost" title={t('sl.markReminded')} onPress={() => void mark(r, 'OTHER')} /> : null}
              {!r.whatsappUrl && !r.telUrl ? <ThemedText type="small" themeColor="textSecondary">{t('sl.noContact')}</ThemedText> : null}
            </View>
          </Card>
        ))}
      </View>
    </Sheet>
  );
}

/** Agenda du salon : rendez-vous du jour par heure, arrivee / demarrage / encaissement en un geste, rappels, hors ligne. */
export default function SalonAgenda({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const go = useGo();
  const outbox = useOffline();
  const [day, setDay] = useState(() => isoDay(new Date()));
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<Appt | null>(null);
  const [book, setBook] = useState(false);
  const [remind, setRemind] = useState(false);
  const [checkout, setCheckout] = useState<Appt | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = new Date(`${day}T00:00:00`);
  const to = new Date(from.getTime() + 86400000);
  const agenda = useQuery<Appt[]>(`${API}/agenda${qs({ from: from.toISOString(), to: to.toISOString(), stylistId: filter })}`);
  const stylistsQ = useQuery<Stylist[]>(`${API}/stylists`);
  const resourcesQ = useQuery<Resource[]>(`${API}/resources`);
  const todayQ = useQuery<Today>(`${API}/today`);
  const remindersQ = useQuery<Reminder[]>(`${API}/reminders?hours=48`);
  const stylists = useMemo(() => (stylistsQ.data ?? []).filter((s) => s.active && s.bookable), [stylistsQ.data]);
  const live = useMemo(() => new Set(outbox.items.filter((i) => i.kind === 'salon').map((i) => i.group ?? '')), [outbox.items]);
  const overlay = useSalonOverlay(shop.shopId, live);
  const appts = useMemo(() => applyAppts(agenda.data, overlay).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [agenda.data, overlay]);
  const canWrite = shop.can('APPOINTMENTS', 'update');
  const toRemind = (remindersQ.data ?? []).filter((r) => !r.remindedAt).length;
  const reload = async () => { await Promise.all([agenda.reload(), todayQ.reload(), remindersQ.reload()]); };

  function shift(n: number) { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); setDay(isoDay(d)); }

  async function act(a: Appt, action: string, body?: unknown) {
    const queueable = Object.keys(NEXT_STATUS).includes(action);
    const hasPending = outbox.items.some((i) => i.state === 'pending' && i.group === a.id);
    if (!queueable && (!outbox.online || hasPending)) { toast(t('sl.needsOnline'), 'danger'); return; }
    setBusy(true);
    try {
      const res = await outbox.submit<Appt>({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `${API}/appointments/${a.id}/${action}`, body: body ?? {}, kind: 'salon', label: `${t('sl.agenda')} · ${a.customerName ?? a.number}`, group: a.id, forceQueue: hasPending });
      if (res.queued) { patchAppt(shop.shopId, a.id, { status: NEXT_STATUS[action] }); setOpen({ ...a, status: NEXT_STATUS[action] }); toast(t('sl.queued')); } else { setOpen(res.data); toast(t('sl.updated')); }
      setCancelling(null);
      void reload();
    } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); } finally { setBusy(false); }
  }

  const primary = open ? ({ BOOKED: ['arrive', 'sl.arrived'], CONFIRMED: ['arrive', 'sl.arrived'], ARRIVED: ['start', 'sl.start'] } as Record<string, string[]>)[open.status] : undefined;
  const live2 = open && ['BOOKED', 'CONFIRMED', 'ARRIVED', 'IN_SERVICE'].includes(open.status);

  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={reload}
      right={<View style={{ flexDirection: 'row', gap: 8 }}><PdfButton path={`/api/shop/pdf/salon/agenda`} params={{ date: day }} name={`agenda-${day}.pdf`} label="PDF" small /></View>}>
      {!outbox.online ? <Hint tone="warning" icon="wifi">{t('sl.offlineBanner')}</Hint> : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Btn small variant="secondary" icon="chevron-left" title="" onPress={() => shift(-1)} />
        <View style={{ flex: 1 }}><ThemedText type="smallBold" style={{ textAlign: 'center' }}>{new Date(`${day}T12:00:00`).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}</ThemedText></View>
        <Btn small variant="secondary" icon="chevron-right" title="" onPress={() => shift(1)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {shop.can('APPOINTMENTS', 'create') ? <Btn small icon="plus" title={t('sl.newAppointment')} onPress={() => setBook(true)} /> : null}
        <Btn small variant="secondary" icon="bell" title={`${t('sl.reminders')}${toRemind > 0 ? ` (${toRemind})` : ''}`} onPress={() => setRemind(true)} />
        <Btn small variant="ghost" title={t('sl.today')} onPress={() => setDay(isoDay(new Date()))} disabled={day === isoDay(new Date())} />
      </View>
      {stylists.length > 1 ? <Chips value={filter} onChange={setFilter} options={[{ value: '', label: t('sl.allStylists') }, ...stylists.map((s) => ({ value: s.id, label: s.name }))]} /> : null}
      {todayQ.data ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone="info">{t('sl.upcoming')} {todayQ.data.upcoming}</Badge><Badge tone="warning">{t('sl.waiting')} {todayQ.data.waiting}</Badge>
          <Badge tone="warning">{t('sl.inService')} {todayQ.data.in_service}</Badge><Badge tone="success">{t('sl.done')} {todayQ.data.done}</Badge>
          {todayQ.data.no_show > 0 ? <Badge tone="danger">{t('sl.noShows')} {todayQ.data.no_show}</Badge> : null}
        </View>
      ) : null}
      {agenda.error && !agenda.data ? <ErrorNote message={agenda.error} onRetry={agenda.reload} /> : null}
      {!agenda.data ? <Skeleton rows={4} height={72} /> : appts.length === 0 ? <Empty icon="calendar" title={t('sl.emptyDay')} /> : (
        <Stack gap={8}>
          {appts.map((a) => (
            <Card key={a.id} tone={TONE[a.status]} onPress={() => setOpen(a)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={1}>{hhmm(a.startsAt)}–{hhmm(a.endsAt)} · {a.customerName ?? t('sl.walkIn')}{a.clientAlert ? ' ⚠' : ''}</ThemedText>
                <Badge tone={TONE[a.status]}>{t(`sl.st.${a.status}`)}</Badge>
              </View>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{a.services.map((s) => s.name).join(', ')}{a.stylistName ? ` · ${a.stylistName}` : ''}</ThemedText>
            </Card>
          ))}
        </Stack>
      )}

      {open ? (
        <Sheet visible title={`${open.number} · ${open.customerName ?? t('sl.walkIn')}`} onClose={() => { setOpen(null); setCancelling(null); }} tall>
          <View style={{ gap: 10 }}>
            {open.clientAlert ? <Hint tone="warning" icon="triangle-exclamation" title={t('sl.alertTitle')}>{t('sl.openFile')}</Hint> : null}
            <ThemedText>{formatDateTime(open.startsAt, lang)} → {hhmm(open.endsAt)}</ThemedText>
            <Badge tone={TONE[open.status]}>{t(`sl.st.${open.status}`)}</Badge>
            <ThemedText type="small" themeColor="textSecondary">{open.stylistName ?? t('sl.noPref')}{open.resourceName ? ` · ${open.resourceName}` : ''}{open.phone ? ` · ${open.phone}` : ''}</ThemedText>
            {open.services.map((s) => <Row key={s.id} title={s.name} subtitle={`${s.durationMin} min${s.stylistName ? ` · ${s.stylistName}` : ''}`} meta={shop.money(num(s.unitPrice))} />)}
            {open.partyId && shop.has('CLIENT_FILE') ? <Btn small variant="secondary" icon="id-card" title={t('sl.openFile')} onPress={() => { setOpen(null); go.page('salonClients', { party: open.partyId as string }); }} /> : null}
            {canWrite && live2 ? (
              <View style={{ gap: 8 }}>
                {primary ? <Btn title={t(primary[1])} loading={busy} onPress={() => void act(open, primary[0])} /> : null}
                <Btn icon="coins" title={t('sl.checkout')} variant={primary ? 'secondary' : 'primary'} disabled={busy} onPress={() => { setCheckout(open); }} />
                {open.status === 'BOOKED' ? <Btn variant="secondary" title={t('sl.confirm')} disabled={busy} onPress={() => void act(open, 'confirm')} /> : null}
                {['BOOKED', 'CONFIRMED'].includes(open.status) ? <Btn variant="secondary" title={t('sl.noShow')} disabled={busy} onPress={() => void act(open, 'no-show')} /> : null}
                {cancelling === null ? <Btn variant="danger" title={t('sl.cancelDo')} disabled={busy || !outbox.online} onPress={() => setCancelling('')} /> : (
                  <View style={{ gap: 8 }}>
                    <TextBox label={t('sl.cancelReason')} value={cancelling} onChangeText={setCancelling} maxLength={200} />
                    <Btn variant="danger" title={t('sl.cancelDo')} disabled={busy || !cancelling.trim()} onPress={() => void act(open, 'cancel', { reason: cancelling.trim() })} />
                  </View>
                )}
              </View>
            ) : null}
          </View>
        </Sheet>
      ) : null}
      {checkout ? <SalonCheckout appt={checkout} stylists={stylists} onClose={() => setCheckout(null)} onDone={(r) => { setCheckout(null); setOpen(null); toast(r.queued ? t('sl.queued') : t('sl.paidToast', { amount: shop.money(num(r.sale.total)) })); void reload(); }} /> : null}
      {book ? <Book day={day} stylists={stylists} resources={resourcesQ.data ?? []} onClose={() => setBook(false)} onBooked={() => { setBook(false); toast(t('sl.booked')); void reload(); }} /> : null}
      {remind ? <Reminders onClose={() => setRemind(false)} onChanged={() => void remindersQ.reload()} /> : null}
    </Screen>
  );
}
