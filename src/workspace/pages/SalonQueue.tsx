import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { PartyPicker } from '@/components/party-picker';
import { ProductPicker } from '@/components/product-picker';
import { SalonCheckout, type SalonAppt } from '@/components/salon-checkout';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, Screen, Sheet, Skeleton, Stack, TextBox, useToast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { num, uuid, type Product } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { useQuery } from '@/lib/query';
import { applyTickets, patchTicket, useSalonOverlay } from '@/lib/salon-local';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/salon';
type Ticket = { id: string; label: string; status: string; partyId?: string | null; customerName?: string | null; phone?: string | null; stylistId?: string | null; stylistName?: string | null; productId?: string | null;
  serviceName?: string | null; servicePrice?: number | string | null; estMinutes: number; waitMinutes: number; appointmentId?: string | null; local?: boolean };
type Queue = { waiting: number; served: number; stylistsOnDuty: number; avgServiceMinutes: number; tickets: Ticket[] };
type Stylist = { id: string; name: string; active: boolean; bookable: boolean };
type Resource = { id: string; name: string; active: boolean };
const TONE: Record<string, Tone> = { WAITING: 'info', CALLED: 'warning', IN_SERVICE: 'success' };

/** File d'attente sans rendez-vous : numero, attente estimee, appel, prestation, encaissement ; tout part dans la file hors ligne. */
export default function SalonQueue({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const outbox = useOffline();
  const q = useQuery<Queue>(`${API}/queue`);
  const stylistsQ = useQuery<Stylist[]>(`${API}/stylists`);
  const resourcesQ = useQuery<Resource[]>(`${API}/resources`);
  const stylists = useMemo(() => (stylistsQ.data ?? []).filter((s) => s.active && s.bookable), [stylistsQ.data]);
  const live = useMemo(() => new Set(outbox.items.filter((i) => i.kind === 'salon').map((i) => i.group ?? '')), [outbox.items]);
  const overlay = useSalonOverlay(shop.shopId, live);
  const tickets = useMemo(() => applyTickets(q.data?.tickets ?? null, overlay), [q.data, overlay]);
  const [join, setJoin] = useState(false);
  const [start, setStart] = useState<Ticket | null>(null);
  const [checkout, setCheckout] = useState<SalonAppt | null>(null);
  const canWrite = shop.can('WALK_IN_QUEUE', 'update');

  async function act(tk: Ticket, action: 'call' | 'leave') {
    try {
      const hasPending = outbox.items.some((i) => i.state === 'pending' && i.group === tk.id);
      const res = await outbox.submit({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `${API}/queue/${tk.id}/${action}`, body: {}, kind: 'salon', label: `${t('sl.queue')} · ${tk.label} ${tk.customerName ?? ''}`, group: tk.id, forceQueue: hasPending });
      if (res.queued) { patchTicket(shop.shopId, tk.id, { status: action === 'call' ? 'CALLED' : 'LEFT' }); toast(t('sl.queued')); } else void q.reload();
    } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); }
  }
  async function pay(tk: Ticket) {
    let appt: SalonAppt | null = null;
    try { appt = await shop.call<SalonAppt>(`${API}/appointments/${tk.appointmentId}`); } catch { appt = null; }
    setCheckout({ ...(appt ?? { id: tk.appointmentId as string, customerName: tk.customerName, partyId: tk.partyId, stylistId: tk.stylistId, stylistName: tk.stylistName, services: [{ name: tk.serviceName ?? '', unitPrice: tk.servicePrice ?? 0, packageId: null }] }), ticketId: tk.id, group: tk.id });
  }

  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={q.reload}>
      {!outbox.online ? <Hint tone="warning" icon="wifi">{t('sl.offlineBanner')}</Hint> : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {shop.can('WALK_IN_QUEUE', 'create') ? <Btn small icon="plus" title={t('sl.joinQueue')} onPress={() => setJoin(true)} /> : null}
        {q.data ? <><Badge tone="info">{t('sl.waitingNow')} {tickets.filter((x) => ['WAITING', 'CALLED'].includes(x.status)).length}</Badge><Badge tone="success">{t('sl.servedToday')} {q.data.served}</Badge><Badge tone="neutral">{t('sl.onDuty')} {q.data.stylistsOnDuty}</Badge></> : null}
      </View>
      {q.error && !q.data ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
      {!q.data ? <Skeleton rows={3} height={110} /> : tickets.length === 0 ? <Empty icon="users" title={t('sl.queueEmpty')} text={t('sl.queueEmptyText')} /> : (
        <Stack gap={10}>
          {tickets.map((tk) => (
            <Card key={tk.id} tone={TONE[tk.status]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <ThemedText type="subtitle">{tk.label}</ThemedText><Badge tone={TONE[tk.status]}>{t(`sl.tk.${tk.status}`)}</Badge>
              </View>
              <ThemedText type="smallBold">{tk.customerName ?? t('sl.walkIn')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{[tk.serviceName, tk.stylistName && `${t('sl.preferredStylist')} : ${tk.stylistName}`].filter(Boolean).join(' · ')}</ThemedText>
              {tk.status !== 'IN_SERVICE' ? <ThemedText type="small">{tk.waitMinutes === 0 ? t('sl.nextUp') : t('sl.waitAbout', { minutes: tk.waitMinutes })}</ThemedText> : null}
              {canWrite ? (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {tk.status === 'WAITING' ? <Btn small variant="secondary" icon="bell" title={t('sl.call')} onPress={() => void act(tk, 'call')} /> : null}
                  {['WAITING', 'CALLED'].includes(tk.status) ? <Btn small title={t('sl.start')} onPress={() => setStart(tk)} /> : null}
                  {['WAITING', 'CALLED'].includes(tk.status) ? <Btn small variant="danger" title={t('sl.left')} onPress={() => void act(tk, 'leave')} /> : null}
                  {tk.status === 'IN_SERVICE' && tk.appointmentId ? <Btn small icon="coins" title={t('sl.checkout')} onPress={() => void pay(tk)} /> : null}
                </View>
              ) : null}
            </Card>
          ))}
        </Stack>
      )}
      {join ? <Join stylists={stylists} onClose={() => setJoin(false)} onDone={(queued) => { setJoin(false); toast(queued ? t('sl.queued') : t('sl.ticketGiven', { label: '' })); void q.reload(); }} /> : null}
      {start ? <Start ticket={start} stylists={stylists} resources={resourcesQ.data ?? []} onClose={() => setStart(null)} onDone={(queued) => { setStart(null); toast(queued ? t('sl.queued') : t('sl.started')); void q.reload(); }} /> : null}
      {checkout ? <SalonCheckout appt={checkout} stylists={stylists} onClose={() => setCheckout(null)} onDone={(r) => { setCheckout(null); toast(r.queued ? t('sl.queued') : t('sl.paidToast', { amount: shop.money(num(r.sale.total)) })); void q.reload(); }} /> : null}
    </Screen>
  );
}

function Join({ stylists, onClose, onDone }: { stylists: Stylist[]; onClose: () => void; onDone: (queued: boolean) => void }) {
  const { t } = useT();
  const shop = useShop();
  const outbox = useOffline();
  const [partyId, setPartyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [stylistId, setStylistId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = { id: uuid(), partyId: partyId || undefined, customerName: partyId ? undefined : name.trim() || undefined, phone: partyId ? undefined : phone.trim() || undefined, stylistId: stylistId || undefined, productId: product?.id };
      const res = await outbox.submit({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `${API}/queue`, body, kind: 'salon', label: `${t('sl.queue')} · ${body.customerName ?? t('sl.walkIn')}`, group: body.id });
      if (res.queued) {
        const st = stylists.find((x) => x.id === stylistId);
        patchTicket(shop.shopId, body.id, { local: true, label: '··', status: 'WAITING', customerName: body.customerName ?? null, partyId: body.partyId ?? null, stylistId: stylistId || null, stylistName: st?.name ?? null, productId: product?.id ?? null,
          serviceName: product?.name ?? null, servicePrice: product?.salePrice ?? null, estMinutes: num((product?.attributes as { durationMin?: unknown } | undefined)?.durationMin) || 20, waitMinutes: 0 });
      }
      onDone(res.queued);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible title={t('sl.joinQueue')} onClose={onClose} footer={<Btn title={busy ? t('ws.saving') : t('sl.giveTicket')} loading={busy} onPress={() => void submit()} />}>
      <View style={{ gap: 12 }}>
        {error ? <Hint tone="danger">{error}</Hint> : null}
        {shop.can('CUSTOMERS', 'view') ? <PartyPicker role="CUSTOMER" label={shop.v('customer')} value={partyId} onChange={(id) => setPartyId(id)} /> : null}
        {!partyId ? <><TextBox label={t('sl.clientName')} value={name} onChangeText={setName} maxLength={120} /><TextBox label={t('sl.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={30} /></> : null}
        <ProductPicker label={t('sl.service')} value={product} onChange={setProduct} />
        {stylists.length > 0 ? <><ThemedText type="small">{t('sl.preferredStylist')}</ThemedText><Chips value={stylistId} onChange={setStylistId} options={[{ value: '', label: t('sl.noPref') }, ...stylists.map((s) => ({ value: s.id, label: s.name }))]} /></> : null}
      </View>
    </Sheet>
  );
}

function Start({ ticket, stylists, resources, onClose, onDone }: { ticket: Ticket; stylists: Stylist[]; resources: Resource[]; onClose: () => void; onDone: (queued: boolean) => void }) {
  const { t } = useT();
  const shop = useShop();
  const outbox = useOffline();
  const [stylistId, setStylistId] = useState(ticket.stylistId ?? '');
  const [resourceId, setResourceId] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setError(null);
    try {
      const apptId = uuid();
      const body = { stylistId: stylistId || undefined, resourceId: resourceId || undefined, productId: ticket.productId ? undefined : product?.id, appointmentId: apptId };
      const hasPending = outbox.items.some((i) => i.state === 'pending' && i.group === ticket.id);
      const res = await outbox.submit({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `${API}/queue/${ticket.id}/start`, body, queuedBody: { ...body, at: new Date().toISOString() }, kind: 'salon', label: `${t('sl.queue')} · ${ticket.label}`, group: ticket.id, forceQueue: hasPending });
      if (res.queued) {
        const st = stylists.find((x) => x.id === stylistId);
        patchTicket(shop.shopId, ticket.id, { status: 'IN_SERVICE', appointmentId: apptId, stylistId: stylistId || ticket.stylistId, stylistName: st?.name ?? ticket.stylistName, productId: ticket.productId ?? product?.id, serviceName: ticket.serviceName ?? product?.name, servicePrice: ticket.servicePrice ?? product?.salePrice ?? null });
      }
      onDone(res.queued);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible title={`${ticket.label} · ${ticket.customerName ?? t('sl.walkIn')}`} onClose={onClose} footer={<Btn title={t('sl.start')} loading={busy} disabled={!ticket.productId && !product} onPress={() => void submit()} />}>
      <View style={{ gap: 12 }}>
        {error ? <Hint tone="danger">{error}</Hint> : null}
        {ticket.serviceName ? <ThemedText type="smallBold">{ticket.serviceName} · {ticket.estMinutes} min</ThemedText> : <ProductPicker label={t('sl.service')} value={product} onChange={setProduct} />}
        <ThemedText type="small">{t('sl.stylist')}</ThemedText>
        <Chips value={stylistId} onChange={setStylistId} options={[{ value: '', label: t('sl.noPref') }, ...stylists.map((s) => ({ value: s.id, label: s.name }))]} />
        {resources.length > 0 ? <><ThemedText type="small">{t('sl.resource')}</ThemedText><Chips value={resourceId} onChange={setResourceId} options={[{ value: '', label: t('sl.anyResource') }, ...resources.filter((r) => r.active).map((r) => ({ value: r.id, label: r.name }))]} /></> : null}
      </View>
    </Sheet>
  );
}
