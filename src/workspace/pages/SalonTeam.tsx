import { useState } from 'react';
import { View } from 'react-native';

import { DateField } from '@/components/date-field';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, NumberBox, Row, Screen, SectionTitle, Sheet, Skeleton, Stack, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { qs, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/salon';
const DAYS = [1, 2, 3, 4, 5, 6, 7];
const KINDS = ['CHAIR', 'BASIN', 'CABIN', 'ROOM', 'HAMMAM', 'NAIL_STATION', 'OTHER'];
const COLORS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#475569'];
type Hour = { weekday: number; start: string; end: string };
type Off = { id: string; from: string; to: string; reason?: string | null };
type Stylist = { id: string; name: string; title?: string | null; phone?: string | null; color: string; commissionPercent: number | string; tipSharePercent: number | string; bookable: boolean; active: boolean; hours: Hour[]; offs: Off[] };
type Resource = { id: string; kind: string; name: string; active: boolean; busyNow: boolean };

function StylistSheet({ stylist, onClose, onSaved }: { stylist: Stylist | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [f, setF] = useState({ name: stylist?.name ?? '', title: stylist?.title ?? '', phone: stylist?.phone ?? '', color: stylist?.color ?? COLORS[0], commission: String(stylist?.commissionPercent ?? 0), tip: String(stylist?.tipSharePercent ?? 100), bookable: stylist?.bookable ?? true, active: stylist?.active ?? true });
  const [days, setDays] = useState<Set<number>>(() => new Set(stylist?.hours.length ? stylist.hours.map((h) => h.weekday) : [1, 2, 3, 4, 5, 6]));
  const [start, setStart] = useState(stylist?.hours[0]?.start ?? '09:00');
  const [end, setEnd] = useState(stylist?.hours[0]?.end ?? '18:00');
  const [offs, setOffs] = useState<Off[]>(stylist?.offs ?? []);
  const [off, setOff] = useState({ from: '', to: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const err = (e: unknown) => setError(e instanceof ApiError ? e.message : t('common.network'));

  async function save() {
    setBusy(true); setError(null);
    try {
      const body = { name: f.name, title: f.title, phone: f.phone, color: f.color, commissionPercent: Number(f.commission) || 0, tipSharePercent: Number(f.tip) || 0, bookable: f.bookable, active: f.active,
        hours: [...days].sort().map((d) => ({ weekday: d, start, end })) };
      await shop.call(stylist ? `${API}/stylists/${stylist.id}` : `${API}/stylists`, { method: stylist ? 'PUT' : 'POST', body });
      toast(t('sl.saved')); onSaved();
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  async function addOff() {
    try { const o = await shop.call<Off>(`${API}/stylists/${stylist!.id}/offs`, { method: 'POST', body: { from: off.from, to: off.to || off.from, reason: off.reason } }); setOffs((a) => [...a, o]); setOff({ from: '', to: '', reason: '' }); } catch (e) { err(e); }
  }
  return (
    <Sheet visible title={stylist?.name ?? t('sl.newStylist')} onClose={onClose} tall footer={<Btn title={busy ? t('ws.saving') : t('common.save')} loading={busy} disabled={!f.name.trim()} onPress={() => void save()} />}>
      <View style={{ gap: 12 }}>
        {error ? <ErrorNote message={error} /> : null}
        <TextBox label={t('sl.name')} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} maxLength={120} />
        <TextBox label={t('sl.title')} value={f.title} onChangeText={(v) => setF({ ...f, title: v })} placeholder={t('sl.titleHint')} maxLength={80} />
        <TextBox label={t('sl.phone')} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" maxLength={30} />
        <ThemedText type="small">{t('sl.color')}</ThemedText>
        <Chips scroll={false} value={f.color} onChange={(v) => setF({ ...f, color: v })} options={COLORS.map((c) => ({ value: c, label: '●' }))} />
        {shop.has('STYLIST_COMMISSIONS') ? <><NumberBox label={`${t('sl.commission')} (%)`} value={f.commission} onChange={(v) => setF({ ...f, commission: v })} hint={t('sl.commissionHint')} /><NumberBox label={`${t('sl.tipShare')} (%)`} value={f.tip} onChange={(v) => setF({ ...f, tip: v })} /></> : null}
        <Switch label={t('sl.bookable')} value={f.bookable} onChange={(v) => setF({ ...f, bookable: v })} />
        {stylist ? <Switch label={t('sl.active')} value={f.active} onChange={(v) => setF({ ...f, active: v })} /> : null}
        <SectionTitle title={t('sl.hours')} hint={t('sl.hoursHint')} />
        {DAYS.map((d) => <Switch key={d} label={t(`sl.day${d}`)} value={days.has(d)} onChange={(on) => setDays((s) => { const n = new Set(s); if (on) n.add(d); else n.delete(d); return n; })} />)}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><TextBox label={t('sl.from')} value={start} onChangeText={setStart} placeholder="09:00" maxLength={5} /></View>
          <View style={{ flex: 1 }}><TextBox label={t('sl.to')} value={end} onChangeText={setEnd} placeholder="18:00" maxLength={5} /></View>
        </View>
        {stylist ? (
          <>
            <SectionTitle title={t('sl.absences')} />
            {offs.length === 0 ? <ThemedText themeColor="textSecondary" type="small">{t('sl.noAbsence')}</ThemedText> : offs.map((o) => (
              <Row key={o.id} title={`${o.from} → ${o.to}`} subtitle={o.reason ?? undefined} right={<Btn small variant="ghost" title={t('ws.delete')} onPress={async () => { await shop.call(`${API}/offs/${o.id}`, { method: 'DELETE' }); setOffs((a) => a.filter((x) => x.id !== o.id)); }} />} />
            ))}
            <DateField label={t('sl.from')} value={off.from} onChange={(v) => setOff({ ...off, from: v })} optional />
            <DateField label={t('sl.to')} value={off.to} onChange={(v) => setOff({ ...off, to: v })} optional />
            <TextBox label={t('sl.reason')} value={off.reason} onChangeText={(v) => setOff({ ...off, reason: v })} maxLength={200} />
            <Btn small variant="secondary" icon="plus" title={t('sl.addAbsence')} disabled={!off.from} onPress={() => void addOff()} />
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

function ResourceSheet({ resource, onClose, onSaved }: { resource: Resource | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [f, setF] = useState({ kind: resource?.kind ?? 'CHAIR', name: resource?.name ?? '', active: resource?.active ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try { await shop.call(resource ? `${API}/resources/${resource.id}` : `${API}/resources`, { method: resource ? 'PUT' : 'POST', body: f }); onSaved(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible title={resource?.name ?? t('sl.newResource')} onClose={onClose} footer={<Btn title={t('common.save')} loading={busy} disabled={!f.name.trim()} onPress={() => void save()} />}>
      <View style={{ gap: 12 }}>
        {error ? <ErrorNote message={error} /> : null}
        <Chips value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={KINDS.map((k) => ({ value: k, label: t(`sl.kind.${k}`) }))} />
        <TextBox label={t('sl.name')} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} maxLength={120} placeholder={t('sl.resourceHint')} />
        {resource ? <Switch label={t('sl.active')} value={f.active} onChange={(v) => setF({ ...f, active: v })} /> : null}
      </View>
    </Sheet>
  );
}

/** Praticiens (horaires, commissions, absences) et postes de travail (chaises, cabines, salles). */
export default function SalonTeam({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const stylists = useQuery<Stylist[]>(`${API}/stylists${qs({ all: true })}`);
  const resources = useQuery<Resource[]>(`${API}/resources${qs({ all: true })}`);
  const [edit, setEdit] = useState<{ type: 'stylist' | 'resource'; item: Stylist | Resource | null } | null>(null);
  const canWrite = shop.owner || shop.can('APPOINTMENTS', 'update') || shop.can('WALK_IN_QUEUE', 'update');
  const reload = async () => { await Promise.all([stylists.reload(), resources.reload()]); };
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={reload} right={canWrite ? <Btn small icon="plus" title={t('sl.newStylist')} onPress={() => setEdit({ type: 'stylist', item: null })} /> : undefined}>
      {stylists.error && !stylists.data ? <ErrorNote message={stylists.error} onRetry={stylists.reload} /> : null}
      {!stylists.data ? <Skeleton rows={3} /> : stylists.data.length === 0 ? <Empty icon="users" title={t('sl.noStylist')} text={t('sl.noStylistText')} /> : (
        <Stack gap={8}>
          {stylists.data.map((s) => (
            <Card key={s.id} onPress={canWrite ? () => setEdit({ type: 'stylist', item: s }) : undefined}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color }} />
                <ThemedText type="smallBold" style={{ flex: 1 }}>{s.name}{s.title ? ` · ${s.title}` : ''}</ThemedText>
                {!s.active ? <Badge tone="danger">{t('sl.inactive')}</Badge> : !s.bookable ? <Badge tone="warning">{t('sl.notBookable')}</Badge> : null}
              </View>
              <ThemedText type="small" themeColor="textSecondary">{s.hours.length ? `${[...new Set(s.hours.map((h) => h.weekday))].map((d) => t(`sl.day${d}`).slice(0, 3)).join(' · ')} ${s.hours[0].start}–${s.hours[0].end}` : t('sl.noSchedule')}{shop.has('STYLIST_COMMISSIONS') ? ` · ${s.commissionPercent} %` : ''}</ThemedText>
            </Card>
          ))}
        </Stack>
      )}
      <SectionTitle title={t('sl.resources')} hint={t('sl.resourcesHint')} right={canWrite ? <Btn small variant="secondary" icon="plus" title={t('sl.newResource')} onPress={() => setEdit({ type: 'resource', item: null })} /> : undefined} />
      {resources.data && resources.data.length === 0 ? <ThemedText themeColor="textSecondary">{t('sl.noResource')}</ThemedText> : (resources.data ?? []).map((r) => (
        <Row key={r.id} title={r.name} subtitle={t(`sl.kind.${r.kind}`)} meta={!r.active ? <Badge tone="danger">{t('sl.inactive')}</Badge> : r.busyNow ? <Badge tone="warning">{t('sl.busyNow')}</Badge> : undefined} onPress={canWrite ? () => setEdit({ type: 'resource', item: r }) : undefined} />
      ))}
      {edit?.type === 'stylist' ? <StylistSheet stylist={edit.item as Stylist | null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void reload(); }} /> : null}
      {edit?.type === 'resource' ? <ResourceSheet resource={edit.item as Resource | null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void reload(); }} /> : null}
    </Screen>
  );
}
