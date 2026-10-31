import { useRef, useState } from 'react';
import { Linking, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { SelectField } from '@/components/dynamic-fields';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, NumberBox, Row, Screen, SectionTitle, Sheet, Skeleton, TextBox, useToast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime, num, uuid } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Overview = {
  receivables: { owed: number; current: number; d30: number; d60: number; d90: number; d90plus: number; debtors: number; lateDebtors: number };
  promises: { openCount: number; openAmount: number; overdueCount: number; overdueAmount: number };
  toCallToday: { partyId: string; name: string; nextActionOn: string; channel: string }[];
};
type Cust = { partyId: string; name: string; owed: number; invoices: number; oldestDays: number; usagePct?: number; blocked: boolean; risk: string; brokenPromises: number; openPromise?: { amount: number; promisedOn: string } };
type Detail = { name: string; phone?: string; whatsapp?: string; creditLimit?: number; paymentTermsDays?: number; blocked: boolean; owed: number;
  invoices: { id: string; number: string; dueOn: string; balance: number; daysLate: number }[];
  reminders: { id: string; channel: string; outcome: string; note?: string; nextActionOn?: string; createdAt: string }[];
  promises: { id: string; amount: number; promisedOn: string; status: string; note?: string }[] };
const RISK: Record<string, Tone> = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'success' };
const BUCKETS = ['ALL', 'LATE', 'D30', 'D60', 'D90'];
const SORTS = ['RISK', 'OVERDUE', 'BALANCE', 'NAME'];
const CHANNELS = ['CALL', 'WHATSAPP', 'SMS', 'VISIT', 'LETTER', 'EMAIL'];
const OUTCOMES = ['NO_ANSWER', 'PROMISED', 'REFUSED', 'DISPUTE', 'PAID', 'OTHER'];

function CustomerSheet({ partyId, onClose, onChanged }: { partyId: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const offline = useOffline();
  const toast = useToast();
  const q = useQuery<Detail>(`/api/shop/credit/customers/${partyId}`);
  const d = q.data;
  const [form, setForm] = useState(false);
  const id = useRef(uuid());
  const [channel, setChannel] = useState('CALL');
  const [outcome, setOutcome] = useState('OTHER');
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  const [pAmount, setPAmount] = useState('');
  const [pDate, setPDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canWrite = shop.can('CREDIT_FOLLOWUP', 'create');

  async function save() {
    if (!d) return;
    setBusy(true); setError(null);
    try {
      const promise = num(pAmount) > 0 && pDate ? { amount: num(pAmount), promisedOn: pDate } : undefined;
      const body = { id: id.current, partyId, channel, outcome, note: note || undefined, nextActionOn: next || undefined, promise };
      const res = await offline.submit({ id: body.id, shopId: shop.shopId, method: 'POST', path: '/api/shop/credit/reminders', body, kind: 'reminder', label: `${t('bv.cr.labelReminder')} · ${d.name}` });
      toast(res.queued ? t('bv.dp.queued') : t('bv.cr.reminderSaved'));
      setForm(false); id.current = uuid(); setNote(''); setNext(''); setPAmount(''); setPDate(''); setOutcome('OTHER');
      void q.reload(); onChanged();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  async function resolve(pid: string, status: string) {
    try { await shop.call(`/api/shop/credit/promises/${pid}/resolve`, { method: 'POST', body: { status } }); toast(t('bv.dp.done')); void q.reload(); onChanged(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  const phone = (d?.phone ?? '').replace(/[^\d+]/g, '');
  const wa = (d?.whatsapp ?? d?.phone ?? '').replace(/\D/g, '');
  return (
    <Sheet visible tall title={d?.name ?? '…'} onClose={onClose}
      footer={d ? <View style={{ gap: 8 }}>
        {canWrite && !form ? <Btn icon="plus" title={t('bv.cr.remind')} onPress={() => setForm(true)} /> : null}
        {form ? <Btn icon="check" title={busy ? t('ws.saving') : t('bv.cr.saveReminder')} loading={busy} disabled={busy} onPress={save} /> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {phone ? <View style={{ flex: 1 }}><Btn variant="secondary" small icon="phone" title={t('bv.cr.call')} onPress={() => void Linking.openURL(`tel:${phone}`)} /></View> : null}
          {wa ? <View style={{ flex: 1 }}><Btn variant="secondary" small title={t('bv.cr.whatsapp')} onPress={() => void Linking.openURL(`https://wa.me/${wa}`)} /></View> : null}
        </View></View> : undefined}>
      {!d ? <Skeleton rows={3} height={70} /> : (
        <>
          {q.error ? <ErrorNote message={q.error} onRetry={() => void q.reload()} /> : null}
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><ThemedText type="small" style={{ flex: 1 }}>{t('bv.cr.owed')}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 18 }}>{shop.money(d.owed)}</ThemedText></View>
            <ThemedText type="small" themeColor="textSecondary">{d.creditLimit ? t('bv.cr.limit', { amount: shop.money(d.creditLimit) }) : t('bv.cr.noLimit')}{d.paymentTermsDays != null ? ` · ${t('bv.cr.terms', { days: d.paymentTermsDays })}` : ''}</ThemedText>
            {d.blocked ? <Badge tone="danger">{t('bv.cr.blocked')}</Badge> : null}
          </Card>
          {form ? (
            <Card style={{ gap: 10 }}>
              <SelectField required label={t('bv.cr.channel')} value={channel} onChange={setChannel} options={CHANNELS.map((c) => ({ value: c, label: t(`bv.cr.ch.${c}`) }))} />
              <SelectField required label={t('bv.cr.outcome')} value={outcome} onChange={setOutcome} options={OUTCOMES.map((c) => ({ value: c, label: t(`bv.cr.out.${c}`) }))} />
              {outcome === 'PROMISED' ? <><NumberBox label={t('bv.cr.promiseAmount')} value={pAmount} onChange={setPAmount} /><DateField label={t('bv.cr.promiseDate')} value={pDate} onChange={setPDate} /></> : null}
              <DateField label={t('bv.cr.nextAction')} value={next} onChange={setNext} />
              <TextBox label={t('bv.cr.note')} value={note} onChangeText={setNote} multiline autoCapitalize="sentences" />
            </Card>
          ) : null}
          <SectionTitle title={t('bv.cr.invoicesTitle')} />
          {d.invoices.map((i) => <Row key={i.id} title={i.number} subtitle={formatDate(i.dueOn, lang)} right={<View style={{ alignItems: 'flex-end', gap: 4 }}><ThemedText type="smallBold">{shop.money(i.balance)}</ThemedText>{num(i.daysLate) > 0 ? <Badge tone="danger">{t('bv.cr.daysLate', { count: i.daysLate })}</Badge> : null}</View>} />)}
          <SectionTitle title={t('bv.cr.promisesTitle')} />
          {d.promises.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('bv.cr.noPromises')}</ThemedText> : d.promises.map((p) => (
            <Card key={p.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ThemedText type="smallBold" style={{ flex: 1 }}>{shop.money(p.amount)} · {formatDate(p.promisedOn, lang)}</ThemedText><Badge tone={p.status === 'KEPT' ? 'success' : p.status === 'BROKEN' ? 'danger' : 'info'}>{t(`bv.cr.st.${p.status}`)}</Badge></View>
              {canWrite && p.status === 'OPEN' ? <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Btn small variant="secondary" title={t('bv.cr.markKept')} onPress={() => void resolve(p.id, 'KEPT')} /></View><View style={{ flex: 1 }}><Btn small variant="secondary" title={t('bv.cr.markBroken')} onPress={() => void resolve(p.id, 'BROKEN')} /></View></View> : null}
            </Card>
          ))}
          <SectionTitle title={t('bv.cr.remindersTitle')} />
          {d.reminders.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('bv.cr.noReminders')}</ThemedText> : d.reminders.map((r) => (
            <Row key={r.id} title={`${t(`bv.cr.ch.${r.channel}`)} · ${t(`bv.cr.out.${r.outcome}`)}`} subtitle={[formatDateTime(r.createdAt, lang), r.note, r.nextActionOn && `${t('bv.cr.nextAction')} ${formatDate(r.nextActionOn, lang)}`].filter(Boolean).join(' · ')} />
          ))}
        </>
      )}
    </Sheet>
  );
}

/** Crédit clients et relances : ancienneté, plafonds, risque, journal des relances, promesses de paiement. */
export default function Credit({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const ov = useQuery<Overview>('/api/shop/credit/overview');
  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState('ALL');
  const [sort, setSort] = useState('RISK');
  const [open, setOpen] = useState<string | null>(null);
  const list = useInfinite<Cust>('/api/shop/credit/customers', { q: q || undefined, bucket: bucket === 'ALL' ? undefined : bucket, sort });
  const o = ov.data;
  const refresh = () => { void ov.reload(); void list.reload(); };
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('bv.cr.subtitle')} onRefresh={refresh} refreshing={false} onEndReached={list.loadMore}>
      {ov.error ? <ErrorNote message={ov.error} onRetry={() => void ov.reload()} /> : null}
      {!o && !ov.error ? <Skeleton rows={2} height={80} /> : o ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {([[t('bv.cr.owed'), shop.money(o.receivables.owed), t('bv.cr.owedHint', { count: o.receivables.debtors }), false],
              [t('bv.cr.late'), shop.money(num(o.receivables.owed) - num(o.receivables.current)), t('bv.cr.lateHint', { count: o.receivables.lateDebtors }), num(o.receivables.lateDebtors) > 0],
              [t('bv.cr.promisesOpen'), shop.money(o.promises.openAmount), String(o.promises.openCount), false],
              [t('bv.cr.promisesOverdue'), shop.money(o.promises.overdueAmount), String(o.promises.overdueCount), num(o.promises.overdueCount) > 0]] as [string, string, string, boolean][]).map(([l, v, h, bad]) => (
              <Card key={l} tone={bad ? 'danger' : undefined} style={{ flexGrow: 1, flexBasis: 140, gap: 2 }}><ThemedText type="small" themeColor="textSecondary">{l}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 18 }}>{v}</ThemedText><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{h}</ThemedText></Card>
            ))}
          </View>
          <SectionTitle title={t('bv.cr.aging')} />
          {(['current', 'd30', 'd60', 'd90', 'd90plus'] as const).map((k) => <Row key={k} title={t(`bv.cr.b.${k}`)} right={<ThemedText type="smallBold">{shop.money(o.receivables[k])}</ThemedText>} />)}
          <SectionTitle title={t('bv.cr.toCall')} />
          {o.toCallToday.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('bv.cr.nobodyToCall')}</ThemedText> : o.toCallToday.map((c) => (
            <Row key={c.partyId} icon="phone" title={c.name} subtitle={`${formatDate(c.nextActionOn, lang)} · ${t(`bv.cr.ch.${c.channel}`)}`} onPress={() => setOpen(c.partyId)} />
          ))}
        </>
      ) : null}
      <TextBox label={t('bv.cr.search')} value={q} onChangeText={setQ} autoCapitalize="none" />
      <Chips value={bucket} onChange={setBucket} options={BUCKETS.map((b) => ({ value: b, label: t(`bv.cr.f.${b}`) }))} />
      <Chips value={sort} onChange={setSort} options={SORTS.map((b) => ({ value: b, label: t(`bv.cr.sort.${b}`) }))} />
      {list.error ? <ErrorNote message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={68} /> : list.items.length === 0 ? <Empty icon="coins" title={t('bv.cr.empty')} text={t('bv.cr.emptyText')} /> : list.items.map((x) => (
        <Row key={x.partyId} title={x.name} onPress={() => setOpen(x.partyId)}
          subtitle={[t('bv.cr.invoices', { count: x.invoices }), num(x.oldestDays) > 0 && t('bv.cr.daysLate', { count: x.oldestDays }), x.usagePct != null && t('bv.cr.usage', { pct: x.usagePct }), num(x.brokenPromises) > 0 && t('bv.cr.brokenPromises', { count: x.brokenPromises }),
            x.openPromise && t('bv.cr.promiseOn', { amount: shop.money(x.openPromise.amount), date: formatDate(x.openPromise.promisedOn, lang) })].filter(Boolean).join(' · ')}
          right={<View style={{ alignItems: 'flex-end', gap: 4 }}><ThemedText type="smallBold">{shop.money(x.owed)}</ThemedText><Badge tone={RISK[x.risk] ?? 'neutral'}>{t(`bv.cr.risk.${x.risk}`)}</Badge>{x.blocked ? <Badge tone="danger">{t('bv.cr.blocked')}</Badge> : null}</View>} />
      ))}
      {list.hasMore ? <Btn variant="secondary" small loading={list.loadingMore} title={t('list.more')} onPress={list.loadMore} /> : null}
      {open ? <CustomerSheet partyId={open} onClose={() => setOpen(null)} onChanged={refresh} /> : null}
    </Screen>
  );
}
