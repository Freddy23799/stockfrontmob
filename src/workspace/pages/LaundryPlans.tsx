import { useRef, useState } from 'react';
import { FlatList, View } from 'react-native';

import { errText } from '@/components/laundry-order';
import { ListFooter } from '@/components/list-footer';
import { PartyPicker, type Party } from '@/components/party-picker';
import { PaymentPanel } from '@/components/payment-panel';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Fab, Hint, NumberBox, Screen, Sheet, Skeleton, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { formatDate, uuid } from '@/lib/format';
import { API, fmt, num } from '@/lib/laundry';
import { LIST_PROPS } from '@/lib/list';
import { initPay, settle } from '@/lib/payments';
import { useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Plan = { id: string; name: string; description?: string; kind: 'PIECES' | 'KG' | 'AMOUNT'; quota: number; price: number; validityDays: number; serviceIds?: string[]; active: boolean };
type Sub = { id: string; planName: string; kind: Plan['kind']; quota: number; used: number; remaining: number; price: number; partyName: string; endsOn: string; status: string; daysLeft?: number; uses?: { id: string; orderNumber: string; units: number; at: string }[] };
const SUB_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info'> = { ACTIVE: 'success', EXPIRED: 'danger', EXHAUSTED: 'warning', CANCELLED: 'info' };
const KINDS = ['PIECES', 'KG', 'AMOUNT'] as const;

function PlanForm({ initial, services, onClose, onSaved }: { initial: Plan | null; services: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(initial?.id ?? uuid());
  const [f, setF] = useState({ name: initial?.name ?? '', description: initial?.description ?? '', kind: initial?.kind ?? 'PIECES', quota: String(initial?.quota ?? ''), price: String(initial?.price ?? ''), validityDays: String(initial?.validityDays ?? 90), serviceIds: initial?.serviceIds ?? [], active: initial?.active ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (c: Partial<typeof f>) => setF((x) => ({ ...x, ...c }));
  const valid = f.name.trim() && num(f.quota) > 0 && num(f.validityDays) > 0;
  async function save() {
    setBusy(true); setError(null);
    try { await shop.call(initial ? `${API}/plans/${initial.id}` : `${API}/plans`, { method: initial ? 'PUT' : 'POST', body: { id: id.current, name: f.name.trim(), description: f.description.trim() || undefined, kind: f.kind, quota: num(f.quota), price: num(f.price), validityDays: num(f.validityDays), serviceIds: f.serviceIds, active: f.active } }); onSaved(); } catch (e) { setError(errText(e, t('common.error'))); setBusy(false); }
  }
  return (
    <Sheet visible tall title={initial ? t('ld.editPlan') : t('ld.newPlan')} onClose={onClose} footer={<Btn title={t('common.save')} disabled={!valid} loading={busy} onPress={() => void save()} />}>
      {error ? <ErrorNote message={error} /> : null}
      <TextBox label={t('ld.planName')} value={f.name} onChangeText={(v) => set({ name: v })} placeholder={t('ld.planNameEx')} maxLength={80} />
      <TextBox label={t('ld.description')} value={f.description} onChangeText={(v) => set({ description: v })} maxLength={200} />
      <Chips scroll={false} value={f.kind} onChange={(k) => set({ kind: k })} options={KINDS.map((k) => ({ value: k, label: t(`ld.kind.${k}`) }))} />
      <ThemedText type="small" themeColor="textSecondary">{t(`ld.kindHelp.${f.kind}`)}</ThemedText>
      <NumberBox label={t('ld.quota')} value={f.quota} onChange={(v) => set({ quota: v })} />
      <NumberBox label={t('ld.price')} value={f.price} onChange={(v) => set({ price: v })} suffix={shop.currency} />
      <NumberBox label={t('ld.validity')} value={f.validityDays} onChange={(v) => set({ validityDays: v })} />
      <ThemedText type="smallBold">{t('ld.coveredServices')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{t('ld.coveredHelp')}</ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {services.map((s) => { const on = f.serviceIds.includes(s.id); return <Btn key={s.id} small variant={on ? 'primary' : 'secondary'} title={s.name} onPress={() => set({ serviceIds: on ? f.serviceIds.filter((x) => x !== s.id) : [...f.serviceIds, s.id] })} />; })}
      </View>
      <Switch value={f.active} onChange={(v) => set({ active: v })} label={t('ld.planActive')} />
    </Sheet>
  );
}

function SellForm({ plans, onClose, onSaved }: { plans: Plan[]; onClose: () => void; onSaved: (s: Sub) => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(uuid());
  const payIds = useRef<string[]>([]);
  const methods = shop.ws.manifest.paymentMethods ?? ['CASH'];
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  const [party, setParty] = useState<Party | null>(null);
  const [pay, setPay] = useState(() => initPay(methods[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = plans.find((p) => p.id === planId);
  const price = num(plan?.price);
  const sett = settle(pay, price);
  async function save() {
    setBusy(true); setError(null);
    try {
      while (payIds.current.length < sett.payments.length) payIds.current.push(uuid());
      onSaved(await shop.call<Sub>(`${API}/subscriptions`, { method: 'POST', body: { id: id.current, planId, partyId: party?.id, payments: sett.payments.map((p, i) => ({ id: payIds.current[i], method: p.method, amount: Math.min(p.amount, price), reference: p.reference })) } }));
    } catch (e) { setError(errText(e, t('common.error'))); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('ld.sellPlan')} onClose={onClose} footer={<Btn title={t('ld.sellFor', { amount: shop.money(price) })} disabled={!party || !planId || sett.remaining > 0} loading={busy} onPress={() => void save()} />}>
      {error ? <ErrorNote message={error} /> : null}
      <PartyPicker role="CUSTOMER" label={shop.v('customer')} value={party?.id ?? null} selected={party} onChange={(pid, p) => setParty(pid ? p ?? null : null)} />
      <Chips value={planId} onChange={setPlanId} options={plans.map((p) => ({ value: p.id, label: `${p.name} · ${shop.money(p.price)}` }))} />
      {plan ? <ThemedText type="small" themeColor="textSecondary">{t('ld.planSummary', { quota: fmt(plan.quota), unit: plan.kind === 'KG' ? 'kg' : plan.kind === 'PIECES' ? t('ld.pieces') : shop.currency, days: plan.validityDays })}</ThemedText> : null}
      <PaymentPanel pay={pay} setPay={setPay} due={price} methods={methods} res={sett} money={shop.money} currency={shop.currency} />
      {sett.remaining > 0 ? <ThemedText type="small" themeColor="danger">{t('ld.fullPaymentNeeded')}</ThemedText> : null}
    </Sheet>
  );
}

function SubSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Sub>(`${API}/subscriptions/${id}`);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const s = q.data;
  if (!s) return <Sheet visible title="…" onClose={onClose}>{q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <Skeleton rows={3} height={70} />}</Sheet>;
  const unit = s.kind === 'KG' ? 'kg' : s.kind === 'PIECES' ? t('ld.pieces') : shop.currency;
  const manager = shop.owner || shop.can('PRODUCTS', 'update');
  return (
    <Sheet visible tall title={s.planName} onClose={onClose}>
      {error ? <ErrorNote message={error} /> : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{s.partyName}</ThemedText><Badge tone={SUB_TONE[s.status]}>{t(`ld.subS.${s.status}`)}</Badge></View>
      <View style={{ height: 10, borderRadius: 99, backgroundColor: 'rgba(127,127,127,0.2)', overflow: 'hidden' }}><View style={{ height: 10, width: `${Math.min(100, (num(s.used) / Math.max(1, num(s.quota))) * 100)}%`, backgroundColor: '#2563eb' }} /></View>
      <Card>
        {([[t('ld.remainingL'), `${fmt(s.remaining)} ${unit}`], [t('ld.used'), `${fmt(s.used)} / ${fmt(s.quota)} ${unit}`], [t('ld.validUntil'), `${formatDate(s.endsOn, lang)}${s.status === 'ACTIVE' ? ` (${t('ld.daysLeft', { count: s.daysLeft ?? 0 })})` : ''}`], [t('ld.price'), shop.money(s.price)]] as [string, string][]).map((r) => (
          <View key={r[0]} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><ThemedText type="small" themeColor="textSecondary">{r[0]}</ThemedText><ThemedText type="smallBold" style={{ flexShrink: 1, textAlign: 'right' }}>{r[1]}</ThemedText></View>
        ))}
      </Card>
      {s.uses && s.uses.length > 0 ? <><ThemedText type="smallBold">{t('ld.uses')}</ThemedText>{s.uses.map((u) => <ThemedText key={u.id} type="small" themeColor="textSecondary">{u.orderNumber} · {formatDate(u.at, lang)} · {fmt(u.units)} {unit}</ThemedText>)}</> : null}
      {manager && s.status === 'ACTIVE' ? (cancel ? (
        <Card tone="danger">
          <TextBox label={t('ld.cancelReason')} value={reason} onChangeText={setReason} />
          <Btn variant="danger" title={t('ld.cancelSub')} disabled={!reason.trim()} onPress={async () => { if (await confirmAction(t('ld.cancelSub'), t('ld.cancelSubText'), t('ld.cancelSub'), t('common.cancel'))) { try { await shop.call(`${API}/subscriptions/${s.id}/cancel`, { method: 'POST', body: { reason: reason.trim() } }); toast(t('ld.subCancelled')); onChanged(); void q.reload(); setCancel(false); } catch (e) { setError(errText(e, t('common.error'))); } } }} />
        </Card>
      ) : <Btn variant="danger" small title={t('ld.cancelSub')} onPress={() => setCancel(true)} />) : null}
    </Sheet>
  );
}

/** Forfaits et abonnements prepayes : catalogue des forfaits, vente a un client, suivi de la consommation. */
export default function LaundryPlans({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const [view, setView] = useState<'subs' | 'plans'>('subs');
  const [status, setStatus] = useState('ACTIVE');
  const [form, setForm] = useState<Plan | 'new' | null>(null);
  const [sell, setSell] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const catalog = useQuery<{ services: { id: string; name: string; active?: boolean }[] }>(`${API}/catalog`);
  const plansQ = useQuery<Plan[]>(`${API}/plans?all=true`);
  const subs = useInfinite<Sub & { partyName: string }>(`${API}/subscriptions`, { status: status || undefined });
  const reload = () => { void subs.reload(); void plansQ.reload(); };
  const plans = plansQ.data ?? [];
  const activePlans = plans.filter((p) => p.active);
  const canCreate = shop.can('LAUNDRY_PLANS', 'create');
  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('ld.plansSubtitle')}>
      <Chips scroll={false} value={view} onChange={setView} options={[{ value: 'subs', label: t('ld.tab.subs') }, { value: 'plans', label: t('ld.tab.plans') }]} />
      <View style={{ height: 8 }} />
      {view === 'subs' ? (
        <>
          <Chips value={status} onChange={setStatus} options={['ACTIVE', 'EXPIRED', 'EXHAUSTED', 'CANCELLED', ''].map((k) => ({ value: k, label: k ? t(`ld.subS.${k}`) : t('ws.all') }))} />
          <View style={{ height: 8 }} />
          {subs.error ? <ErrorNote message={subs.error} onRetry={subs.reload} /> : null}
          {subs.loading && subs.items.length === 0 ? <Skeleton rows={4} height={72} /> : (
            <FlatList {...LIST_PROPS} data={subs.items} keyExtractor={(s) => s.id} contentContainerStyle={{ gap: 8, paddingBottom: 110 }} onEndReached={subs.loadMore} refreshing={subs.refreshing} onRefresh={reload} showsVerticalScrollIndicator={false}
              ListEmptyComponent={<Empty icon="repeat" title={t('ld.subsEmpty')} text={t('ld.subsEmptyText')} />}
              ListFooterComponent={<ListFooter shown={subs.items.length} total={subs.total} hasMore={subs.hasMore} loading={subs.loadingMore} failed={false} onMore={subs.loadMore} />}
              renderItem={({ item: s }) => (
                <Card onPress={() => setOpen(s.id)}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{s.partyName}</ThemedText><Badge tone={SUB_TONE[s.status]}>{t(`ld.subS.${s.status}`)}</Badge></View>
                  <ThemedText type="small" themeColor="textSecondary">{s.planName} · {t('ld.remainingN', { n: fmt(s.remaining), unit: s.kind === 'KG' ? 'kg' : s.kind === 'PIECES' ? t('ld.pieces') : shop.currency })} · {t('ld.until', { date: formatDate(s.endsOn, lang) })}</ThemedText>
                </Card>
              )} />
          )}
        </>
      ) : plansQ.loading && !plansQ.data ? <Skeleton rows={3} height={72} /> : plans.length === 0 ? <Empty icon="repeat" title={t('ld.plansEmpty')} text={t('ld.plansEmptyText')} /> : (
        <FlatList data={plans} keyExtractor={(p) => p.id} contentContainerStyle={{ gap: 8, paddingBottom: 110 }} showsVerticalScrollIndicator={false}
          renderItem={({ item: p }) => (
            <Card onPress={canCreate && shop.can('LAUNDRY_PLANS', 'update') ? () => setForm(p) : undefined}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{p.name}</ThemedText>{!p.active ? <Badge tone="info">{t('ld.inactive')}</Badge> : null}<ThemedText type="smallBold">{shop.money(p.price)}</ThemedText></View>
              <ThemedText type="small" themeColor="textSecondary">{t(`ld.kind.${p.kind}`)} · {fmt(p.quota)} · {t('ld.validityN', { days: p.validityDays })}{p.description ? ` · ${p.description}` : ''}</ThemedText>
            </Card>
          )} />
      )}
      {canCreate ? <Fab label={view === 'plans' ? t('ld.newPlan') : t('ld.sellPlan')} onPress={() => (view === 'plans' ? setForm('new') : activePlans.length ? setSell(true) : setForm('new'))} /> : null}
      {form ? <PlanForm initial={form === 'new' ? null : form} services={(catalog.data?.services ?? []).filter((s) => s.active !== false)} onClose={() => setForm(null)} onSaved={() => { setForm(null); toast(t('ld.planSaved')); reload(); }} /> : null}
      {sell ? <SellForm plans={activePlans} onClose={() => setSell(false)} onSaved={(s) => { setSell(false); toast(t('ld.planSold')); setView('subs'); setOpen(s.id); reload(); }} /> : null}
      {open ? <SubSheet id={open} onClose={() => setOpen(null)} onChanged={reload} /> : null}
      {view === 'subs' && activePlans.length === 0 && canCreate ? <View style={{ position: 'absolute', left: 16, bottom: 24, right: 90 }}><Hint>{t('ld.plansEmptyText')}</Hint></View> : null}
    </Screen>
  );
}
