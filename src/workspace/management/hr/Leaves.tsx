import { useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';

import { DateField, today } from '@/components/date-field';
import { SelectField } from '@/components/dynamic-fields';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, NumberBox, Sheet, Skeleton, TextBox, useToast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDate, uuid } from '@/lib/format';
import { ListFooter } from '@/components/list-footer';
import { qs, useInfinite, useQuery, type Page } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { LIST_PROPS } from '@/lib/list';

const TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'UNPAID', 'ABSENCE', 'OTHER'];
const TONE: Record<string, Tone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'info' };
type Person = { id: string; firstName: string; lastName: string };
type Leave = { id: string; staffName: string; type: string; startDate: string; endDate: string; days: number; reason?: string; decisionNote?: string; status: string };

/** Demande de conge (ou absence). `staffId` fixe quand on la cree depuis la fiche d'une personne. */
export function LeaveSheet({ staffId: fixed, onClose, onSaved }: { staffId?: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(uuid());
  const people = useQuery<Page<Person>>(fixed ? null : `/api/shop/hr/staff${qs({ size: 100 })}`);
  const [f, setF] = useState({ staffId: fixed ?? '', type: 'ANNUAL', startDate: today(), endDate: today(), days: '', reason: '' });
  const balance = useQuery<{ remaining: number; entitlement: number; year: number }>(f.staffId ? `/api/shop/hr/staff/${f.staffId}/leave-balance` : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const span = Math.max(1, Math.round((new Date(f.endDate).getTime() - new Date(f.startDate).getTime()) / 86400000) + 1);
  async function submit() {
    setBusy(true); setError(null);
    try { await shop.call('/api/shop/hr/leaves', { method: 'POST', body: { id: id.current, staffId: f.staffId, type: f.type, startDate: f.startDate, endDate: f.endDate, days: f.days === '' ? undefined : Number(f.days), reason: f.reason } }); onSaved(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('leave.new')} onClose={onClose} footer={<Btn icon="paper-plane" title={t('leave.submit')} loading={busy} disabled={busy || !f.staffId} onPress={submit} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {!fixed ? <SelectField required label={`${t('leave.person')} *`} value={f.staffId} onChange={set('staffId')} options={(people.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))} /> : null}
      <SelectField required label={t('leave.type')} value={f.type} onChange={set('type')} options={TYPES.map((x) => ({ value: x, label: t(`leave.type.${x}`) }))} />
      <DateField label={t('leave.from')} value={f.startDate} onChange={(v) => setF((s) => ({ ...s, startDate: v, endDate: s.endDate < v ? v : s.endDate }))} />
      <DateField label={t('leave.to')} value={f.endDate} onChange={set('endDate')} min={f.startDate} />
      <NumberBox label={t('leave.days')} value={f.days} onChange={set('days')} placeholder={String(span)} hint={t('leave.daysHint', { count: span })} />
      {f.type === 'ANNUAL' && balance.data ? <Hint icon="circle-info">{t('leave.balanceLine', { remaining: balance.data.remaining, entitlement: balance.data.entitlement, year: balance.data.year })}</Hint> : null}
      <TextBox label={t('leave.reason')} value={f.reason} onChangeText={set('reason')} maxLength={300} multiline autoCapitalize="sentences" />
    </Sheet>
  );
}

export default function Leaves({ register }: { register?: (fn: (() => void) | null) => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(false);
  const [decide, setDecide] = useState<{ leave: Leave; approve: boolean } | null>(null);
  const list = useInfinite<Leave>('/api/shop/hr/leaves', { status });
  useEffect(() => { register?.(list.loadMore); return () => register?.(null); });

  async function cancel(l: Leave) {
    if (!(await confirmAction(t('leave.cancelTitle'), '', t('leave.cancel'), t('common.cancel')))) return;
    try { await shop.call(`/api/shop/hr/leaves/${l.id}/cancel`, { method: 'POST' }); void list.reload(); } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); }
  }
  return (
    <View style={{ flex: 1, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ThemedText type="smallBold" style={{ flex: 1 }}>{t('hr.tab.leaves')} ({list.total})</ThemedText>
        {shop.can('HR_LEAVE', 'create') ? <Btn small icon="plus" title={t('leave.new')} onPress={() => setForm(true)} /> : null}
      </View>
      <Chips value={status} onChange={setStatus} options={[{ value: '', label: t('ws.all') }, ...['PENDING', 'APPROVED', 'REJECTED'].map((s) => ({ value: s, label: t(`leave.status.${s}`) }))]} />
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={3} height={90} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(l) => l.id} scrollEnabled={false} contentContainerStyle={{ gap: 8 }}
          ListEmptyComponent={<Empty icon="clock" title={t('leave.empty')} text={t('leave.emptyText')} />}
          renderItem={({ item: l }) => (
            <Card style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ThemedText type="smallBold" style={{ flex: 1 }}>{l.staffName}</ThemedText>
                <Badge tone={TONE[l.status]}>{t(`leave.status.${l.status}`)}</Badge>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{t(`leave.type.${l.type}`)} · {formatDate(l.startDate, lang)} → {formatDate(l.endDate, lang)} · {t('leave.daysCount', { count: Number(l.days) })}</ThemedText>
              {l.reason ? <ThemedText type="small" themeColor="textSecondary">{l.reason}</ThemedText> : null}
              {l.decisionNote ? <ThemedText type="small" themeColor="textSecondary">{l.decisionNote}</ThemedText> : null}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {l.status === 'PENDING' && shop.can('HR_LEAVE', 'update') ? (<><Btn small icon="check" title={t('leave.approve')} onPress={() => setDecide({ leave: l, approve: true })} /><Btn small variant="secondary" title={t('leave.reject')} onPress={() => setDecide({ leave: l, approve: false })} /></>) : null}
                {['PENDING', 'APPROVED'].includes(l.status) && shop.can('HR_LEAVE', 'delete') ? <IconBtn size={38} name="rotate-left" label={t('leave.cancel')} onPress={() => cancel(l)} /> : null}
              </View>
            </Card>
          )} />
      )}
      <ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} />
      {form ? <LeaveSheet onClose={() => setForm(false)} onSaved={() => { setForm(false); toast(t('leave.sent')); void list.reload(); }} /> : null}
      {decide ? <DecisionSheet {...decide} onClose={() => setDecide(null)} onDone={() => { setDecide(null); toast(t('ws.saved')); void list.reload(); }} /> : null}
    </View>
  );
}

function DecisionSheet({ leave, approve, onClose, onDone }: { leave: Leave; approve: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    try { await shop.call(`/api/shop/hr/leaves/${leave.id}/decision`, { method: 'POST', body: { approve, note } }); onDone(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible title={t(approve ? 'leave.approveTitle' : 'leave.rejectTitle', { name: leave.staffName })} onClose={onClose} footer={<Btn variant={approve ? 'primary' : 'danger'} icon={approve ? 'check' : 'xmark'} title={t(approve ? 'leave.approve' : 'leave.reject')} loading={busy} onPress={go} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <TextBox label={t('leave.note')} value={note} onChangeText={setNote} maxLength={200} autoCapitalize="sentences" />
    </Sheet>
  );
}
