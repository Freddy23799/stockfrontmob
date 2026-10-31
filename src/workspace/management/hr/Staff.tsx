import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { DateField, today } from '@/components/date-field';
import { DynamicFields, SelectField, cleanAttributes } from '@/components/dynamic-fields';
import { Icon } from '@/components/icon';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, Input, NumberBox, Row, Sheet, Skeleton, Stack, TextBox, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDate, uuid, type Image as Img } from '@/lib/format';
import { appendPhoto, pickPhoto } from '@/lib/photo';
import { ListFooter } from '@/components/list-footer';
import { useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { LIST_PROPS } from '@/lib/list';
import { LeaveSheet } from './Leaves';
import { Credentials, NOT_DELEGABLE, applyRole, type FeatureRow, type Role } from '../team-lib';

const CONTRACTS = ['PERMANENT', 'FIXED_TERM', 'INTERNSHIP', 'CASUAL', 'OTHER'];
type Opt = { id: string; name: string; active: boolean };
type Person = Record<string, any> & { id: string; firstName: string; lastName: string; photo?: Img | null; active: boolean; matricule: string };

/** Photo de la personne ou ses initiales. */
export function Avatar({ person, size = 44 }: { person: { firstName?: string; lastName?: string; photo?: Img | null }; size?: number }) {
  const th = useTheme();
  const v = person.photo ? (person.photo.variants.sm ?? Object.values(person.photo.variants)[0]) : null;
  if (v) return <Image source={{ uri: v.webp }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: th.backgroundSelected }} contentFit="cover" transition={150} />;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: th.backgroundSelected, alignItems: 'center', justifyContent: 'center' }}><ThemedText type="smallBold" themeColor="primary" style={{ fontSize: size * 0.34 }}>{`${person.firstName?.[0] ?? ''}${person.lastName?.[0] ?? ''}`.toUpperCase()}</ThemedText></View>;
}

export default function Staff({ register }: { register?: (fn: (() => void) | null) => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [positionId, setPositionId] = useState('');
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const positions = useQuery<Opt[]>('/api/shop/hr/positions?all=true');
  const grades = useQuery<Opt[]>('/api/shop/hr/grades?all=true');
  const list = useInfinite<Person>('/api/shop/hr/staff', { q: q.trim(), status, positionId });
  useEffect(() => { register?.(list.loadMore); return () => register?.(null); });   // la suite arrive toute seule au defilement
  const th = useTheme();
  async function importAccounts() {
    try { const r = await shop.call<{ imported: number }>('/api/shop/hr/staff/import-accounts', { method: 'POST' }); toast(t('hr.imported', { count: r.imported })); void list.reload(); } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); }
  }
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ThemedText type="smallBold" style={{ flex: 1 }}>{t('hr.tab.staff')} ({list.total})</ThemedText>
        <PdfButton small path="/api/shop/pdf/staff" name="personnel.pdf" label={t('pdf.list')} disabled={list.total === 0} />
        {shop.can('HR', 'create') ? <Btn small icon="user-plus" title={t('hr.newPerson')} onPress={() => setOpen('new')} /> : null}
      </View>
      <View style={{ justifyContent: 'center' }}>
        <Icon name="magnifying-glass" size={15} color={th.textSecondary} style={{ position: 'absolute', left: 15, zIndex: 1 }} />
        <Input value={q} onChangeText={setQ} placeholder={t('hr.search')} style={{ paddingLeft: 40 }} autoCapitalize="none" />
      </View>
      <Chips value={status} onChange={setStatus} options={[{ value: 'active', label: t('hr.inPost') }, { value: 'archived', label: t('hr.archivedTag') }, { value: 'all', label: t('ws.all') }]} />
      {(positions.data?.length ?? 0) > 0 ? <Chips value={positionId} onChange={setPositionId} options={[{ value: '', label: t('hr.allPositions') }, ...positions.data!.map((p) => ({ value: p.id, label: p.name }))]} /> : null}
      {shop.owner && shop.has('EMPLOYEES') ? <Btn small variant="ghost" icon="user-shield" title={t('hr.importAccounts')} onPress={importAccounts} /> : null}
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={68} /> : list.items.length === 0 ? (
        <Empty icon="users" title={q ? t('ws.noResult') : t('hr.empty')} text={q ? undefined : t('hr.emptyText')} action={!q && shop.can('HR', 'create') ? <Btn icon="user-plus" title={t('hr.newPerson')} onPress={() => setOpen('new')} /> : undefined} />
      ) : (
        <FlatList {...LIST_PROPS} scrollEnabled={false} data={list.items} keyExtractor={(s) => s.id} contentContainerStyle={{ gap: 8 }}
          renderItem={({ item: s }) => (
            <Row thumb={<Avatar person={s} />} title={`${s.firstName} ${s.lastName}`} subtitle={`${[s.positionLabel, s.gradeLabel].filter(Boolean).join(' · ') || t('hr.noPosition')} · ${s.matricule}`} onPress={() => setOpen(s.id)}
              right={<View style={{ alignItems: 'flex-end', gap: 4 }}>{s.salary != null ? <ThemedText type="smallBold">{shop.money(s.salary)}</ThemedText> : null}{s.hasAccount ? <Icon name="user-shield" size={13} color={th.primary} /> : s.active ? <Badge tone="info">{t('hr.noAccountShort')}</Badge> : null}</View>} />
          )} />
      )}
      <ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} />
      {open === 'new' ? <StaffForm positions={positions.data ?? []} grades={grades.data ?? []} onClose={() => setOpen(null)} onSaved={(p) => { setOpen(p.id); void list.reload(); }} /> : null}
      {open && open !== 'new' ? <StaffDetail id={open} positions={positions.data ?? []} grades={grades.data ?? []} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </View>
  );
}

const EMPTY = { firstName: '', lastName: '', sex: '', birthDate: '', birthPlace: '', nationality: '', maritalStatus: '', childrenCount: '', phone: '', phone2: '', email: '', address: '', neighborhood: '', city: '', idNumber: '', idIssueDate: '', idIssuePlace: '', idExpiryDate: '', emergencyName: '', emergencyPhone: '', emergencyRelation: '', hireDate: today(), contractType: '', socialSecurityNo: '', bankName: '', bankAccount: '', note: '', attributes: {} as Record<string, any>, positionId: '', gradeId: '', salary: '' };

function StaffForm({ person, positions, grades, onClose, onSaved }: { person?: Person; positions: Opt[]; grades: Opt[]; onClose: () => void; onSaved: (p: Person) => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const id = useRef(person?.id ?? uuid());
  const [f, setF] = useState(() => (person ? { ...EMPTY, ...Object.fromEntries(Object.entries(person).map(([k, v]) => [k, v ?? ''])), attributes: person.attributes ?? {} } as typeof EMPTY : EMPTY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const seesSalary = shop.can('HR_PAYROLL', 'view');
  const tb = (k: keyof typeof EMPTY, label: string, props: object = {}) => <TextBox label={label} value={String(f[k] ?? '')} onChangeText={set(k)} {...props} />;

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = { ...f, id: id.current, attributes: cleanAttributes(f.attributes), childrenCount: f.childrenCount === '' ? null : Number(f.childrenCount), salary: f.salary === '' ? null : Number(f.salary), positionId: f.positionId || null, gradeId: f.gradeId || null,
        ...Object.fromEntries(['birthDate', 'idIssueDate', 'idExpiryDate', 'hireDate'].map((k) => [k, (f as any)[k] || null])) };
      const saved = await shop.call<Person>(person ? `/api/shop/hr/staff/${person.id}` : '/api/shop/hr/staff', { method: person ? 'PUT' : 'POST', body });
      toast(t('ws.saved'));
      onSaved(saved);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  const section = (title: string, children: React.ReactNode) => <Card style={{ gap: 12 }}><ThemedText type="smallBold">{title}</ThemedText>{children}</Card>;
  return (
    <Sheet visible tall title={person ? `${person.firstName} ${person.lastName}` : t('hr.newPerson')} onClose={onClose}
      footer={<Btn icon="check" title={t('common.save')} loading={busy} disabled={busy || !f.firstName.trim() || !f.lastName.trim()} onPress={submit} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {!person ? <Hint icon="lightbulb">{t('mob.staffHint')}</Hint> : null}
      {section(t('hr.sec.identity'), (<>
        {tb('firstName', `${t('hr.firstName')} *`, { maxLength: 100, autoCapitalize: 'words' })}
        {tb('lastName', `${t('hr.lastName')} *`, { maxLength: 100, autoCapitalize: 'words' })}
        <SelectField label={t('hr.sex')} value={f.sex} onChange={set('sex')} options={[{ value: 'F', label: t('hr.sex.F') }, { value: 'M', label: t('hr.sex.M') }]} />
        <DateField label={t('hr.birthDate')} value={f.birthDate} onChange={set('birthDate')} max={today()} optional />
        {tb('birthPlace', t('hr.birthPlace'), { autoCapitalize: 'words' })}
        {tb('nationality', t('hr.nationality'), { autoCapitalize: 'words' })}
        {tb('maritalStatus', t('hr.maritalStatus'), { autoCapitalize: 'sentences' })}
        <NumberBox label={t('hr.children')} value={String(f.childrenCount)} onChange={set('childrenCount')} />
      </>))}
      {section(t('hr.sec.contact'), (<>
        {tb('phone', t('ws.phone'), { keyboardType: 'phone-pad' })}
        {tb('phone2', t('hr.phone2'), { keyboardType: 'phone-pad' })}
        {tb('email', t('settings.email'), { keyboardType: 'email-address' })}
        {tb('city', t('settings.city'), { autoCapitalize: 'words' })}
        {tb('neighborhood', t('settings.neighborhood'), { autoCapitalize: 'words' })}
        {tb('address', t('settings.address'), { autoCapitalize: 'sentences' })}
      </>))}
      {section(t('hr.sec.id'), (<>
        {tb('idNumber', t('hr.idNumber'))}
        {tb('idIssuePlace', t('hr.idIssuePlace'), { autoCapitalize: 'words' })}
        <DateField label={t('hr.idIssueDate')} value={f.idIssueDate} onChange={set('idIssueDate')} max={today()} optional />
        <DateField label={t('hr.idExpiryDate')} value={f.idExpiryDate} onChange={set('idExpiryDate')} optional />
      </>))}
      {section(t('hr.sec.emergency'), (<>
        {tb('emergencyName', t('hr.emergencyName'), { autoCapitalize: 'words' })}
        {tb('emergencyPhone', t('hr.emergencyPhone'), { keyboardType: 'phone-pad' })}
        {tb('emergencyRelation', t('hr.emergencyRelation'), { autoCapitalize: 'sentences' })}
      </>))}
      {section(t('hr.sec.job'), (<>
        <DateField label={t('hr.hireDate')} value={f.hireDate} onChange={set('hireDate')} />
        <SelectField label={t('hr.contract')} value={f.contractType} onChange={set('contractType')} options={CONTRACTS.map((c) => ({ value: c, label: t(`hr.contract.${c}`) }))} />
        {!person ? (
          <>
            <SelectField label={t('hr.position')} value={f.positionId} onChange={set('positionId')} options={positions.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))} />
            <SelectField label={t('hr.grade')} value={f.gradeId} onChange={set('gradeId')} options={grades.filter((g) => g.active).map((g) => ({ value: g.id, label: g.name }))} />
            {seesSalary ? <NumberBox label={`${t('hr.salary')} (${shop.currency})`} value={f.salary} onChange={set('salary')} hint={t('hr.salaryHint')} suffix={shop.currency} /> : null}
          </>
        ) : null}
        <DynamicFields defs={shop.ws.manifest.staffFields ?? []} values={f.attributes} onChange={(a) => setF((s) => ({ ...s, attributes: a }))} />
      </>))}
      {section(t('hr.sec.bank'), (<>
        {tb('bankName', t('hr.bankName'), { autoCapitalize: 'words' })}
        {tb('bankAccount', t('hr.bankAccount'))}
        {tb('socialSecurityNo', t('hr.socialSecurity'))}
      </>))}
      <TextBox label={t('ws.note')} value={f.note} onChangeText={set('note')} multiline autoCapitalize="sentences" />
    </Sheet>
  );
}

function StaffDetail({ id, positions, grades, onClose, onChanged }: { id: string; positions: Opt[]; grades: Opt[]; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Person>(`/api/shop/hr/staff/${id}`);
  const pay = useQuery<{ lines: { id: string; reference: string; period_end: string; status: string; paid_total: number; net_pay: number }[]; totalPaid: number }>(shop.can('HR_PAYROLL', 'view') ? `/api/shop/hr/staff/${id}/payroll` : null);
  const bal = useQuery<{ year: number; remaining: number; entitlement: number }>(shop.can('HR_LEAVE', 'view') ? `/api/shop/hr/staff/${id}/leave-balance` : null);
  const [sub, setSub] = useState<'edit' | 'leave' | 'archive' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const p = q.data;
  const changed = async () => { await Promise.all([q.reload(), pay.reload(), bal.reload()]); onChanged(); };
  const msg = (e: unknown) => (e instanceof ApiError ? e.message : t('common.network'));

  async function reactivate() { try { await shop.call(`/api/shop/hr/staff/${id}/reactivate`, { method: 'POST' }); toast(t('hr.reactivated')); await changed(); } catch (e) { setError(msg(e)); } }
  async function changePhoto() {
    try {
      const photo = await pickPhoto('library');
      if (!photo) return;
      const form = new FormData();
      await appendPhoto(form, 'file', photo);
      form.append('mediaId', uuid());
      await shop.call(`/api/shop/hr/staff/${id}/photo`, { method: 'POST', body: form });
      await changed();
    } catch (e) { setError(msg(e)); }
  }
  const row = (label: string, value?: string | null) => (value ? <View key={label} style={{ flexDirection: 'row', gap: 10 }}><ThemedText type="small" themeColor="textSecondary" style={{ width: 110 }}>{label}</ThemedText><ThemedText type="small" style={{ flex: 1 }}>{value}</ThemedText></View> : null);
  const [now] = useState(() => Date.now());
  const idSoon = p?.idExpiryDate && new Date(p.idExpiryDate).getTime() < now + 60 * 86400000;

  return (
    <Sheet visible tall title={p ? `${p.firstName} ${p.lastName}` : '…'} onClose={onClose}
      footer={p ? (
        <View style={{ gap: 8 }}>
          <PdfButton path={`/api/shop/pdf/staff/${p.id}`} name={`fiche-${p.matricule}.pdf`} label={t('pdf.sheet')} />
          {shop.can('HR', 'update') ? <Btn icon="pen" title={t('ws.edit')} onPress={() => setSub('edit')} /> : null}
          {p.active ? shop.can('HR', 'update') ? <Btn variant="danger" icon="pause" title={t('hr.archive')} onPress={() => setSub('archive')} /> : null : shop.can('HR', 'update') ? <Btn variant="secondary" icon="play" title={t('hr.reactivate')} onPress={reactivate} /> : null}
        </View>
      ) : undefined}>
      {!p ? (q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <Skeleton rows={3} height={80} />) : (
        <>
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Pressable onPress={() => shop.can('HR', 'update') && changePhoto()} accessibilityRole="button" accessibilityLabel={t('hr.changePhoto')}><Avatar person={p} size={76} /></Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <ThemedText type="smallBold" style={{ fontSize: 18 }}>{p.firstName} {p.lastName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{[p.current?.positionLabel, p.current?.gradeLabel].filter(Boolean).join(' · ') || '—'}</ThemedText>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}><Badge tone="info">{t('hr.matricule')} {p.matricule}</Badge>{!p.active ? <Badge tone="warning">{t('hr.archivedTag')}</Badge> : null}</View>
            </View>
          </View>
          {!p.active && p.blockedReason ? <Hint icon="circle-info" tone="warning">{t('hr.exitedNote', { date: formatDate(p.exitDate, lang), reason: p.blockedReason })}</Hint> : null}
          {idSoon ? <Hint icon="triangle-exclamation" tone="warning">{t('hr.idExpiringOne', { date: formatDate(p.idExpiryDate, lang) })}</Hint> : null}
          <Card style={{ gap: 8 }}>
            <ThemedText type="smallBold">{t('hr.sec.identity')}</ThemedText>
            {row(t('ws.phone'), [p.phone, p.phone2].filter(Boolean).join(' / '))}
            {row(t('settings.email'), p.email)}
            {row(t('hr.birthDate'), p.birthDate && `${formatDate(p.birthDate, lang)}${p.birthPlace ? ` · ${p.birthPlace}` : ''}`)}
            {row(t('hr.nationality'), p.nationality)}
            {row(t('settings.address'), [p.address, p.neighborhood, p.city].filter(Boolean).join(', '))}
            {row(t('hr.idNumber'), p.idNumber)}
            {row(t('hr.hireDate'), formatDate(p.hireDate, lang))}
            {row(t('hr.contract'), p.contractType && t(`hr.contract.${p.contractType}`))}
            {row(t('hr.emergency'), [p.emergencyName, p.emergencyPhone, p.emergencyRelation].filter(Boolean).join(' · '))}
            {(shop.ws.manifest.staffFields ?? []).map((d) => row(shop.tr(d.label), p.attributes?.[d.key] != null ? String(p.attributes[d.key]) : null))}
            {p.note ? <ThemedText type="small" themeColor="textSecondary">{p.note}</ThemedText> : null}
          </Card>
          <CareerBox person={p} positions={positions} grades={grades} onChanged={changed} />
          {pay.data ? (
            <Card style={{ gap: 8 }}>
              <ThemedText type="smallBold">{t('hr.payHistory')}</ThemedText>
              {pay.data.lines.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('hr.noPay')}</ThemedText> : pay.data.lines.map((l) => (
                <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ThemedText type="small" style={{ flex: 1 }}>{l.reference} · {formatDate(l.period_end, lang, { month: 'short', year: 'numeric' })}</ThemedText>
                  <Badge tone={l.status === 'PAID' ? 'success' : 'warning'}>{shop.money(l.paid_total)} / {shop.money(l.net_pay)}</Badge>
                </View>
              ))}
              {pay.data.lines.length > 0 ? <ThemedText type="small" themeColor="textSecondary">{t('hr.totalPaid')} <ThemedText type="smallBold">{shop.money(pay.data.totalPaid)}</ThemedText></ThemedText> : null}
            </Card>
          ) : null}
          {bal.data ? (
            <Card style={{ gap: 8 }}>
              <ThemedText type="smallBold">{t('hr.leaveBalance')}</ThemedText>
              <View style={{ flexDirection: 'row' }}><ThemedText type="small" style={{ flex: 1 }}>{t('hr.leaveRemaining', { year: bal.data.year })}</ThemedText><ThemedText type="smallBold">{Number(bal.data.remaining)} / {Number(bal.data.entitlement)} {t('leave.daysShort')}</ThemedText></View>
              {shop.can('HR_LEAVE', 'create') && p.active ? <Btn small variant="secondary" icon="plus" title={t('leave.new')} onPress={() => setSub('leave')} /> : null}
            </Card>
          ) : null}
          {shop.has('EMPLOYEES') ? <AccountBox person={p} onChanged={changed} /> : null}
        </>
      )}
      {sub === 'edit' && p ? <StaffForm person={p} positions={positions} grades={grades} onClose={() => setSub(null)} onSaved={() => { setSub(null); void changed(); }} /> : null}
      {sub === 'leave' && p ? <LeaveSheet staffId={p.id} onClose={() => setSub(null)} onSaved={() => { setSub(null); toast(t('leave.sent')); void changed(); }} /> : null}
      {sub === 'archive' && p ? <ArchiveSheet person={p} onClose={() => setSub(null)} onDone={() => { setSub(null); toast(t('hr.archived')); void changed(); }} /> : null}
    </Sheet>
  );
}

function ArchiveSheet({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  async function go() { try { await shop.call(`/api/shop/hr/staff/${person.id}/archive`, { method: 'POST', body: { reason, exitDate: date } }); onDone(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } }
  return (
    <Sheet visible title={t('hr.archiveTitle', { name: `${person.firstName} ${person.lastName}` })} onClose={onClose} footer={<Btn variant="danger" icon="pause" title={t('hr.archive')} onPress={go} />}>
      <Hint icon="triangle-exclamation" tone="warning">{t('hr.archiveText')}</Hint>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <TextBox label={t('hr.exitReason')} value={reason} onChangeText={setReason} maxLength={200} autoCapitalize="sentences" />
      <DateField label={t('hr.exitDate')} value={date} onChange={setDate} />
    </Sheet>
  );
}

function CareerBox({ person, positions, grades, onChanged }: { person: Person; positions: Opt[]; grades: Opt[]; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const cur = person.current;
  const [mode, setMode] = useState<'add' | 'fix' | null>(null);
  const [f, setF] = useState({ amount: '', positionId: '', gradeId: '', startDate: today(), reason: '' });
  const [error, setError] = useState<string | null>(null);
  const base = `/api/shop/hr/staff/${person.id}/career`;
  const canEdit = shop.can('HR_PAYROLL', 'update');
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  function open(m: 'add' | 'fix') { setMode(m); setError(null); setF({ amount: cur?.amount != null ? String(cur.amount) : '', positionId: cur?.positionId ?? '', gradeId: cur?.gradeId ?? '', startDate: today(), reason: '' }); }
  async function save() {
    try {
      const body = { amount: f.amount === '' ? null : Number(f.amount), positionId: f.positionId || null, gradeId: f.gradeId || null, startDate: mode === 'add' ? f.startDate : undefined, reason: f.reason };
      await shop.call(mode === 'add' ? base : `${base}/${cur.id}`, { method: mode === 'add' ? 'POST' : 'PUT', body });
      toast(t('ws.saved')); setMode(null); onChanged();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  return (
    <Card style={{ gap: 10 }}>
      <ThemedText type="smallBold">{t('hr.career')}</ThemedText>
      {person.career.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('hr.noCareer')}</ThemedText> : null}
      {person.career.map((c: any) => (
        <View key={c.id} style={{ borderLeftWidth: 3, borderLeftColor: c.endDate ? 'transparent' : '#16A34A', paddingLeft: 10, gap: 2 }}>
          <ThemedText type="smallBold">{c.positionLabel}{c.gradeLabel ? ` · ${c.gradeLabel}` : ''}{c.amount != null ? ` — ${shop.money(c.amount)} / ${t('hr.perMonth')}` : ''}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{formatDate(c.startDate, lang)} → {c.endDate ? formatDate(c.endDate, lang) : t('hr.today')}{c.reason ? ` · ${c.reason}` : ''}</ThemedText>
        </View>
      ))}
      {canEdit && person.active && !mode ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Btn small variant="secondary" icon="plus" title={t('hr.addPeriod')} onPress={() => open('add')} />
          {cur ? <Btn small variant="ghost" icon="pen" title={t('hr.fixPeriod')} onPress={() => open('fix')} /> : null}
        </View>
      ) : null}
      {mode ? (
        <Stack gap={12}>
          <Hint icon="lightbulb">{t(mode === 'add' ? 'hr.addPeriodHint' : 'hr.fixPeriodHint')}</Hint>
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <NumberBox label={`${t('hr.salary')} (${shop.currency})`} value={f.amount} onChange={set('amount')} suffix={shop.currency} />
          <SelectField label={t('hr.position')} value={f.positionId} onChange={set('positionId')} placeholder={t('hr.keepCurrent')} options={positions.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))} />
          <SelectField label={t('hr.grade')} value={f.gradeId} onChange={set('gradeId')} placeholder={t('hr.keepCurrent')} options={grades.filter((g) => g.active).map((g) => ({ value: g.id, label: g.name }))} />
          {mode === 'add' ? <DateField label={t('hr.startDate')} value={f.startDate} onChange={set('startDate')} /> : null}
          <TextBox label={t('hr.reason')} value={f.reason} onChangeText={set('reason')} maxLength={200} placeholder={t('hr.reasonHint')} autoCapitalize="sentences" />
          <View style={{ flexDirection: 'row', gap: 8 }}><Btn title={t('common.save')} onPress={save} disabled={f.amount === ''} style={{ flex: 1 }} /><Btn variant="secondary" title={t('common.cancel')} onPress={() => setMode(null)} style={{ flex: 1 }} /></View>
        </Stack>
      ) : null}
    </Card>
  );
}

function AccountBox({ person, onChanged }: { person: Person; onChanged: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const roles = (shop.ws.manifest.roles as Role[] | undefined) ?? [];
  const [open, setOpen] = useState<'create' | 'link' | null>(null);
  const [username, setUsername] = useState('');
  const [roleKey, setRoleKey] = useState(roles.find((r) => r.default)?.key ?? '');
  const [creds, setCreds] = useState<{ username: string; password: string; name: string } | null>(null);
  const existing = useQuery<{ id: string; fullName: string; username: string }[]>(open === 'link' ? `/api/merchant/shops/${shop.shopId}/employees` : null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/shop/hr/staff/${person.id}`;
  const msg = (e: unknown) => (e instanceof ApiError ? e.message : t('common.network'));

  async function create() {
    setError(null);
    try {
      const features = (await shop.call<{ features: FeatureRow[] }>(`/api/merchant/shops/${shop.shopId}/features`)).features.filter((x) => x.enabled && !NOT_DELEGABLE.has(x.code));
      const role = roles.find((r) => r.key === roleKey);
      const res = await shop.call<{ employee: { username: string; fullName: string }; temporaryPassword: string }>(`${base}/account`, { method: 'POST', body: { username, roleKey: roleKey || null, permissions: role ? applyRole(role, features) : {} } });
      setCreds({ username: res.employee.username, password: res.temporaryPassword, name: res.employee.fullName });
      setOpen(null);
    } catch (e) { setError(msg(e)); }
  }
  async function link(id: string) { try { await shop.call(`${base}/account/link`, { method: 'POST', body: { employeeId: id } }); toast(t('ws.saved')); setOpen(null); onChanged(); } catch (e) { setError(msg(e)); } }
  async function unlink() {
    if (!(await confirmAction(t('hr.unlinkTitle'), t('hr.unlinkText'), t('hr.unlink'), t('common.cancel'), false))) return;
    try { await shop.call(`${base}/account`, { method: 'DELETE' }); onChanged(); } catch (e) { setError(msg(e)); }
  }
  if (creds) return <Credentials shopCode={(shop.ws.shop as any).shopCode} {...creds} onClose={() => { setCreds(null); onChanged(); }} />;
  return (
    <Card style={{ gap: 10 }}>
      <ThemedText type="smallBold">{t('hr.account')}</ThemedText>
      {person.employeeId ? (
        <>
          <ThemedText type="small">{t('hr.hasAccount', { user: person.accountUsername })}</ThemedText>
          {shop.owner ? <Btn small variant="ghost" title={t('hr.unlink')} onPress={unlink} /> : null}
        </>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">{t('hr.noAccountHint')}</ThemedText>
          {shop.owner && shop.has('EMPLOYEES') && person.active ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Btn small variant="secondary" icon="user-plus" title={t('hr.giveAccess')} onPress={() => setOpen('create')} />
              <Btn small variant="secondary" icon="key" title={t('hr.linkExisting')} onPress={() => setOpen('link')} />
            </View>
          ) : null}
        </>
      )}
      {open ? (
        <Sheet visible title={open === 'create' ? t('hr.giveAccess') : t('hr.linkExisting')} onClose={() => setOpen(null)}
          footer={open === 'create' ? <Btn icon="check" title={t('team.create')} disabled={username.trim().length < 3} onPress={create} /> : undefined}>
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          {open === 'create' ? (
            <>
              <TextBox label={`${t('team.username')} *`} value={username} onChangeText={setUsername} maxLength={30} hint={t('team.usernameHint')} />
              <SelectField label={t('team.role')} value={roleKey} onChange={setRoleKey} options={roles.map((r) => ({ value: r.key, label: shop.tr(r.label) }))} />
              <ThemedText type="small" themeColor="textSecondary">{t('hr.rolesLater')}</ThemedText>
            </>
          ) : !existing.data ? <Skeleton rows={2} height={56} /> : existing.data.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('hr.noExisting')}</ThemedText> : existing.data.map((e) => <Row key={e.id} icon="user" title={e.fullName} subtitle={`@${e.username}`} onPress={() => link(e.id)} />)}
        </Sheet>
      ) : null}
    </Card>
  );
}
