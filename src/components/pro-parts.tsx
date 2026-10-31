import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { DateField, today } from '@/components/date-field';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Field, Hint, Input, NumberBox, Row, Sheet, Skeleton, Switch, TextBox, useOnCard, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { NetworkError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { num, uuid } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { pickPhoto, appendPhoto } from '@/lib/photo';
import { EXPENSE_CATEGORIES, errMessage, fmtClock, fmtMinutes, PRO_API, statusTone, type CaseRow, type Entry, type Expense, type Member, type Task } from '@/lib/pro';
import { qs, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

/* ------------------------------------------------------------------------------------------------ collaborateurs */

/** Collaborateurs actifs du cabinet (choix du responsable, du porteur d'une tache...). Vide si l'utilisateur n'a pas le droit de les lire. */
export function useMembers(all = false) {
  const shop = useShop();
  const q = useQuery<Member[]>(shop.can('PRO_CASES', 'view') ? `${PRO_API}/members${qs({ all: all || undefined })}` : null);
  return q;
}

/* ------------------------------------------------------------------------------------------------ chronometre */

export type ProTimer = {
  /** Chrono en cours (un seul par collaborateur), tenu par le serveur. */
  entry: Entry | null;
  ready: boolean;
  busy: boolean;
  /** Le serveur n'a pas pu etre interroge : on garde ce qu'on savait, sans pretendre que c'est a jour. */
  offline: boolean;
  /** Millisecondes ecoulees depuis le depart. */
  elapsed: number;
  enabled: boolean;
  canStart: boolean;
  toggle: (caseId: string, caseLabel: string) => Promise<void>;
  stop: (note?: string) => Promise<void>;
  reload: () => Promise<void>;
};

/**
 * Chronometre global : l'etat vit sur le serveur (il survit a la fermeture de l'application et se retrouve sur le site).
 * Demarrer / arreter = un seul appel ; le temps affiche est calcule depuis l'heure de depart donnee par le serveur.
 */
export function useProTimer(onChanged?: () => void): ProTimer {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const enabled = shop.has('PRO_TIMESHEET') && shop.can('PRO_TIMESHEET', 'view');
  const canStart = enabled && shop.can('PRO_TIMESHEET', 'create');
  const [entry, setEntry] = useState<Entry | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const e = await shop.call<Entry | null>(`${PRO_API}/time/timer`);
      setEntry(e ?? null); setOffline(false); setNow(Date.now());
    } catch { setOffline(true); } finally { setReady(true); }
  }, [enabled, shop]);

  // a chaque retour sur l'ecran : le chrono a pu etre arrete ou demarre depuis le site ou un autre appareil
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const running = entry != null;
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const fail = useCallback((e: unknown) => toast(e instanceof NetworkError ? t('pr.m.timerNeedsNet') : errMessage(e, t('common.error')), 'danger'), [toast, t]);

  const stop = useCallback(async (note?: string) => {
    if (!entry || busy) return;
    setBusy(true);
    try {
      const res = await shop.call<Entry>(`${PRO_API}/time/timer/stop`, { method: 'POST', body: { id: entry.id, description: note?.trim() || undefined } });
      setEntry(null); setNow(Date.now());
      toast(t('pr.m.timerStopped', { duration: fmtMinutes(res?.minutes ?? 0) }));
      onChanged?.();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }, [entry, busy, shop, toast, t, fail, onChanged]);

  const toggle = useCallback(async (caseId: string, caseLabel: string) => {
    if (busy || !canStart) return;
    if (entry && entry.caseId === caseId) { await stop(); return; }
    if (entry) {
      const from = entry.caseNumber ?? entry.caseTitle ?? '';
      if (!(await confirmAction(t('pr.m.switchTitle'), t('pr.m.switchText', { from, to: caseLabel }), t('pr.m.switchDo'), t('common.cancel'), false))) return;
    }
    setBusy(true);
    try {
      if (entry) await shop.call(`${PRO_API}/time/timer/stop`, { method: 'POST', body: { id: entry.id } });
      await shop.call(`${PRO_API}/time/timer/start`, { method: 'POST', body: { caseId } });
      await load();
      toast(t('pr.m.timerStarted', { name: caseLabel }));
      onChanged?.();
    } catch (e) { fail(e); await load(); } finally { setBusy(false); }
  }, [busy, canStart, entry, stop, shop, load, toast, t, fail, onChanged]);

  const elapsed = entry?.startedAt ? Math.max(0, now - new Date(entry.startedAt).getTime()) : 0;
  return { entry, ready, busy, offline, elapsed, enabled, canStart, toggle, stop, reload: load };
}

/** Bandeau du chrono en cours : toujours visible en tete des ecrans de travail, arret en un geste. */
export function TimerBar({ timer, onOpenCase }: { timer: ProTimer; onOpenCase?: (caseId: string) => void }) {
  const { t } = useT();
  const th = useTheme();
  const [note, setNote] = useState('');
  const e = timer.entry;
  if (!timer.enabled) return null;
  if (!e) {
    return timer.offline ? <Hint tone="warning" icon="cloud-arrow-up">{t('pr.m.timerOffline')}</Hint> : null;
  }
  return (
    <Card tone="info">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable disabled={!onOpenCase} onPress={() => onOpenCase?.(e.caseId)} accessibilityRole="button" style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="stopwatch" size={13} color={th.primary} />
            <ThemedText type="small" style={{ color: th.primary }}>{t('pr.m.timerRunning')}</ThemedText>
          </View>
          <ThemedText type="subtitle" style={{ fontVariant: ['tabular-nums'] }}>{fmtClock(timer.elapsed)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{[e.caseNumber, e.caseTitle].filter(Boolean).join(' · ')}{e.partyName ? ` · ${e.partyName}` : ''}</ThemedText>
        </Pressable>
        {timer.canStart ? <Btn icon="stop" title={t('pr.m.stop')} loading={timer.busy} onPress={() => { void timer.stop(note).then(() => setNote('')); }} /> : null}
      </View>
      {timer.canStart ? <TextBox label={t('pr.m.timerNote')} value={note} onChangeText={setNote} maxLength={500} returnKeyType="done" /> : null}
      {timer.offline ? <ThemedText type="small" themeColor="warning">{t('pr.m.timerOffline')}</ThemedText> : null}
    </Card>
  );
}

/** Bouton lancer / arreter place A COTE d'une ligne cliquable (jamais dedans). */
export function TimerBtn({ timer, caseId, caseLabel, size = 48 }: { timer: ProTimer; caseId: string; caseLabel: string; size?: number }) {
  const { t } = useT();
  const th = useTheme();
  if (!timer.canStart) return null;
  const on = timer.entry?.caseId === caseId;
  return (
    <Pressable onPress={() => void timer.toggle(caseId, caseLabel)} disabled={timer.busy} accessibilityRole="button" accessibilityLabel={on ? t('pr.m.stop') : t('pr.m.start')} accessibilityState={{ busy: timer.busy }}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2.4, backgroundColor: on ? th.dangerBg : th.primary, alignItems: 'center', justifyContent: 'center' }, (pressed || timer.busy) && { opacity: 0.6 }]}>
      <Icon name={on ? 'stop' : 'play'} size={size * 0.34} color={on ? th.danger : th.primaryText} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------------------------------------ choix d'un dossier */

/** Choix d'un dossier ouvert : recherche par numero, titre ou client. */
export function CasePicker({ label, value, onChange, disabled }: { label: string; value: { id: string; number?: string; title?: string; partyName?: string | null } | null; onChange: (c: CaseRow) => void; disabled?: boolean }) {
  const { t } = useT();
  const th = useTheme();
  const onCard = useOnCard();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useQuery<{ items: CaseRow[] }>(open ? `${PRO_API}/cases${qs({ status: 'OPEN', q: q.trim(), size: 30, page: 0 })}` : null, { debounce: 250 });
  return (
    <>
      <Field label={label}>
        <Pressable disabled={disabled} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label}
          style={{ backgroundColor: onCard ? th.background : th.backgroundElement, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: disabled ? 0.6 : 1 }}>
          <Icon name="folder-open" size={14} color={th.textSecondary} />
          <ThemedText style={{ flex: 1 }} themeColor={value ? undefined : 'textSecondary'} numberOfLines={1}>{value ? [value.number, value.title].filter(Boolean).join(' · ') : t('pr.m.chooseCase')}</ThemedText>
          {!disabled ? <Icon name="chevron-down" size={12} color={th.textSecondary} /> : null}
        </Pressable>
      </Field>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)} tall>
        <Input value={q} onChangeText={setQ} placeholder={t('pr.m.searchCase')} autoFocus autoCapitalize="none" />
        <View style={{ gap: 8 }}>
          {list.error && !list.data ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
          {!list.data ? <Skeleton rows={3} /> : list.data.items.length === 0 ? <Empty icon="folder-open" title={t('pr.m.noOpenCase')} /> : list.data.items.map((c) => (
            <Row key={c.id} icon="folder-open" title={`${c.number} · ${c.title}`} subtitle={c.partyName ?? undefined} onPress={() => { onChange(c); setOpen(false); setQ(''); }} />
          ))}
        </View>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------ saisie de temps */

const PRESETS: [number, number][] = [[0, 15], [0, 30], [0, 45], [1, 0], [1, 30], [2, 0], [4, 0], [8, 0]];

type SelCase = { id: string; number?: string; title?: string; partyName?: string | null; billingMode?: string };

/** Saisie rapide ou correction d'une ligne de temps. Hors reseau, une nouvelle ligne part dans la file (identifiant choisi ici : jamais en double). */
export function TimeSheet({ entry, preset, members, onClose, onSaved }: { entry?: Entry | null; preset?: SelCase | null; members?: Member[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const outbox = useOffline();
  const toast = useToast();
  const manager = shop.owner || shop.can('PRO_CASES', 'update');
  const [id] = useState(() => entry?.id ?? uuid());
  const [sel, setSel] = useState<SelCase | null>(entry ? { id: entry.caseId, number: entry.caseNumber, title: entry.caseTitle, partyName: entry.partyName } : preset ?? null);
  const [date, setDate] = useState(entry?.workDate ?? today());
  const [h, setH] = useState(entry ? String(Math.floor(entry.minutes / 60)) : '');
  const [m, setM] = useState(entry ? String(entry.minutes % 60) : '');
  const [desc, setDesc] = useState(entry?.description ?? '');
  const [billable, setBillable] = useState(entry?.billable ?? (preset?.billingMode ? preset.billingMode !== 'NONE' : true));
  const [memberId, setMemberId] = useState(entry?.memberId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minutes = Math.round(num(h) * 60 + num(m));
  const locked = entry != null && (entry.status === 'BILLED' || entry.running === true);
  const valid = sel != null && minutes >= 1 && minutes <= 1440;
  const mark = (e: unknown) => setError(e instanceof NetworkError ? t('common.network') : errMessage(e, t('common.error')));

  async function save() {
    if (!sel) return;
    setBusy(true); setError(null);
    const body = { id, caseId: sel.id, memberId: manager && memberId ? memberId : undefined, workDate: date, minutes, description: desc.trim() || undefined, billable };
    try {
      if (entry) {
        await shop.call(`${PRO_API}/time/${entry.id}`, { method: 'PUT', body });
        toast(t('pr.m.saved'));
      } else {
        const res = await outbox.submit({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `${PRO_API}/time`, body, kind: 'pro', label: `${sel.number ?? ''} · ${fmtMinutes(minutes)}`, group: `pro-time:${id}` });
        toast(res.queued ? t('pr.m.queued') : t('pr.m.saved'), res.queued ? 'warning' : 'success');
      }
      onSaved();
    } catch (e) { mark(e); } finally { setBusy(false); }
  }
  async function remove() {
    if (!entry || !(await confirmAction(t('pr.m.deleteTimeTitle'), t('pr.m.deleteTimeText'), t('ws.delete'), t('common.cancel')))) return;
    setBusy(true); setError(null);
    try { await shop.call(`${PRO_API}/time/${entry.id}`, { method: 'DELETE' }); onSaved(); } catch (e) { mark(e); } finally { setBusy(false); }
  }
  async function writeoff(on: boolean) {
    if (!entry) return;
    if (on && !(await confirmAction(t('pr.m.writeoffTitle'), t('pr.m.writeoffText'), t('pr.m.writeoff'), t('common.cancel')))) return;
    setBusy(true); setError(null);
    try { await shop.call(`${PRO_API}/time/${entry.id}/writeoff`, { method: 'POST', body: { writeoff: on } }); onSaved(); } catch (e) { mark(e); } finally { setBusy(false); }
  }
  const canDelete = entry != null && entry.status === 'UNBILLED' && !entry.running && shop.can('PRO_TIMESHEET', 'delete');
  return (
    <Sheet visible tall title={entry ? t('pr.m.editTime') : t('pr.m.newTime')} onClose={onClose}
      footer={locked ? undefined : <Btn icon="check" title={busy ? t('ws.saving') : t('common.save')} loading={busy} disabled={!valid} onPress={() => void save()} />}>
      <View style={{ gap: 12 }}>
        {error ? <ErrorNote message={error} /> : null}
        {entry?.status === 'BILLED' ? <Hint icon="lock">{t('pr.m.timeBilled')}</Hint> : null}
        {entry?.running ? <Hint icon="stopwatch">{t('pr.m.timeRunning')}</Hint> : null}
        <CasePicker label={t('pr.m.case')} value={sel} onChange={(c) => { setSel(c); if (c.billingMode === 'NONE') setBillable(false); }} disabled={locked || (entry != null && entry.status !== 'UNBILLED')} />
        <DateField label={t('pr.m.date')} value={date} onChange={setDate} max={today()} />
        <View style={{ gap: 6 }}>
          <ThemedText type="smallBold">{t('pr.m.duration')}</ThemedText>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><NumberBox label={t('pr.m.hours')} value={h} onChange={setH} editable={!locked} maxLength={2} returnKeyType="next" /></View>
            <View style={{ flex: 1 }}><NumberBox label={t('pr.m.minutes')} value={m} onChange={setM} editable={!locked} maxLength={2} returnKeyType="done" /></View>
          </View>
          {!locked ? (
            <Chips scroll={false} value={`${Math.floor(minutes / 60)}:${minutes % 60}`} onChange={(v) => { const [a, b] = v.split(':'); setH(a === '0' ? '' : a); setM(b === '0' ? '' : b); }}
              options={PRESETS.map(([a, b]) => ({ value: `${a}:${b}`, label: fmtMinutes(a * 60 + b) }))} />
          ) : null}
          {minutes > 1440 ? <ThemedText type="small" themeColor="danger">{t('pr.m.durationMax')}</ThemedText> : minutes > 0 ? <ThemedText type="small" themeColor="textSecondary">= {fmtMinutes(minutes)}</ThemedText> : null}
        </View>
        <TextBox label={t('pr.m.description')} value={desc} onChangeText={setDesc} multiline maxLength={1000} editable={!locked} />
        <Switch label={t('pr.m.billable')} hint={t('pr.m.billableHint')} value={billable} onChange={setBillable} />
        {manager && !entry && (members ?? []).length > 1 ? (
          <View style={{ gap: 6 }}>
            <ThemedText type="smallBold">{t('pr.m.member')}</ThemedText>
            <Chips value={memberId} onChange={setMemberId} options={[{ value: '', label: t('pr.m.me') }, ...(members ?? []).filter((x) => x.active).map((x) => ({ value: x.id, label: x.name }))]} />
          </View>
        ) : null}
        {entry && entry.status !== 'BILLED' && !entry.running && shop.can('PRO_TIMESHEET', 'update') ? (
          <Btn small variant="secondary" icon={entry.status === 'WRITTEN_OFF' ? 'rotate-left' : 'ban'} title={entry.status === 'WRITTEN_OFF' ? t('pr.m.restore') : t('pr.m.writeoff')} onPress={() => void writeoff(entry.status !== 'WRITTEN_OFF')} />
        ) : null}
        {canDelete ? <Btn small variant="danger" icon="trash" title={t('ws.delete')} onPress={() => void remove()} /> : null}
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------------------------------------ frais et justificatifs */

type Photo = { uri: string; name: string; type: string };

/** Le justificatif tel que le serveur l'a range (WebP) ; null s'il n'y en a pas. */
export const receiptUrl = (e: Pick<Expense, 'receipt'>, size: 'sm' | 'md' = 'sm'): string | null => {
  const v = e.receipt?.variants;
  if (!v) return null;
  return (v[size] ?? v.md ?? v.sm ?? Object.values(v)[0])?.webp ?? null;
};

function Receipt({ uri, size = 120, onPress }: { uri: string; size?: number; onPress: () => void }) {
  const { t } = useT();
  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={t('pr.m.receiptView')} style={{ alignSelf: 'flex-start' }}>
      <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 14 }} contentFit="cover" transition={150} />
    </Pressable>
  );
}

/**
 * Frais / debours. Le justificatif se prend a la camera (ou dans la galerie) ; il est reduit sur le telephone avant l'envoi.
 * Un frais cree sans reseau part dans la file ; la photo, elle, ne peut etre envoyee qu'en ligne : l'ecran le dit clairement.
 */
export function ExpenseSheet({ expense, preset, onClose, onSaved }: { expense?: Expense | null; preset?: SelCase | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const outbox = useOffline();
  const toast = useToast();
  const [id] = useState(() => expense?.id ?? uuid());
  const [savedId, setSavedId] = useState<string | null>(null);
  const [sel, setSel] = useState<SelCase | null>(expense ? { id: expense.caseId, number: expense.caseNumber, title: expense.caseTitle } : preset ?? null);
  const [f, setF] = useState({ label: expense?.label ?? '', category: expense?.category ?? 'TRAVEL', amount: expense ? String(num(expense.amount)) : '', date: expense?.incurredOn ?? today(), rebillable: expense?.rebillable ?? true, markup: expense?.markupPct != null ? String(num(expense.markupPct)) : '' });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [receipt, setReceipt] = useState<string | null>(expense ? receiptUrl(expense, 'md') : null);
  const [big, setBig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = expense?.id ?? savedId;
  const locked = expense?.status === 'BILLED';
  const amount = num(f.amount);
  const valid = sel != null && f.label.trim().length > 0 && amount > 0;
  const mark = (e: unknown) => setError(e instanceof NetworkError ? t('common.network') : errMessage(e, t('common.error')));

  async function take(source: 'camera' | 'library') {
    setPicking(true); setError(null);
    try {
      const p = await pickPhoto(source);
      if (p) setPhoto(p);
      else if (source === 'camera') setError(t('pr.m.cameraDenied'));
    } catch { setError(t('pr.m.cameraDenied')); } finally { setPicking(false); }
  }
  async function upload(expenseId: string): Promise<boolean> {
    if (!photo) return true;
    try {
      const fd = new FormData();
      await appendPhoto(fd, 'file', photo); fd.append('mediaId', uuid());
      await shop.call(`${PRO_API}/expenses/${expenseId}/receipt`, { method: 'POST', body: fd });
      return true;
    } catch (e) { mark(e); return false; }
  }
  async function save() {
    if (!sel) return;
    setBusy(true); setError(null);
    const body = { id: existing ?? id, caseId: sel.id, incurredOn: f.date, label: f.label.trim(), category: f.category, amount, rebillable: f.rebillable, markupPct: f.rebillable && f.markup !== '' ? num(f.markup) : undefined };
    try {
      if (existing) {
        await shop.call(`${PRO_API}/expenses/${existing}`, { method: 'PUT', body });
      } else {
        const res = await outbox.submit({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `${PRO_API}/expenses`, body, kind: 'pro', label: `${f.label.trim()} · ${shop.money(amount)}`, group: `pro-exp:${id}` });
        if (res.queued) { toast(photo ? t('pr.m.queuedNoPhoto') : t('pr.m.queued'), 'warning'); onSaved(); return; }
        setSavedId(id);
      }
      if (!(await upload(existing ?? id))) { setSavedId(existing ?? id); toast(t('pr.m.photoFailed'), 'warning'); return; }
      toast(t('pr.m.saved')); onSaved();
    } catch (e) { mark(e); } finally { setBusy(false); }
  }
  async function dropReceipt() {
    if (!existing || !(await confirmAction(t('pr.m.receiptRemoveTitle'), t('pr.m.receiptRemoveText'), t('ws.delete'), t('common.cancel')))) return;
    try { await shop.call(`${PRO_API}/expenses/${existing}/receipt`, { method: 'DELETE' }); setReceipt(null); } catch (e) { mark(e); }
  }
  async function remove() {
    if (!existing || !(await confirmAction(t('pr.m.deleteExpTitle'), t('pr.m.deleteExpText'), t('ws.delete'), t('common.cancel')))) return;
    setBusy(true);
    try { await shop.call(`${PRO_API}/expenses/${existing}`, { method: 'DELETE' }); onSaved(); } catch (e) { mark(e); } finally { setBusy(false); }
  }
  const shown = photo?.uri ?? receipt;
  return (
    <>
      <Sheet visible tall title={expense ? t('pr.m.editExpense') : t('pr.m.newExpense')} onClose={onClose}
        footer={locked ? undefined : <Btn icon="check" title={busy ? t('ws.saving') : t('common.save')} loading={busy} disabled={!valid} onPress={() => void save()} />}>
        <View style={{ gap: 12 }}>
          {error ? <ErrorNote message={error} /> : null}
          {locked ? <Hint icon="lock">{t('pr.m.expBilled')}</Hint> : null}
          <ThemedText type="smallBold">{t('pr.m.receipt')}</ThemedText>
          {shown ? <Receipt uri={shown} onPress={() => setBig(shown)} /> : <ThemedText type="small" themeColor="textSecondary">{t('pr.m.noReceipt')}</ThemedText>}
          {!locked ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Btn icon="camera" title={shown ? t('pr.m.retake') : t('pr.m.takePhoto')} loading={picking} onPress={() => void take('camera')} />
              <Btn variant="secondary" icon="image" title={t('pr.m.fromLibrary')} disabled={picking} onPress={() => void take('library')} />
              {photo ? <Btn variant="ghost" small title={t('ws.remove')} onPress={() => setPhoto(null)} /> : receipt && existing ? <Btn variant="ghost" small icon="trash" title={t('pr.m.removeReceipt')} onPress={() => void dropReceipt()} /> : null}
            </View>
          ) : null}
          {photo ? <ThemedText type="small" themeColor="textSecondary">{t('pr.m.photoPending')}</ThemedText> : null}
          <CasePicker label={t('pr.m.case')} value={sel} onChange={setSel} disabled={locked} />
          <TextBox label={t('pr.m.expLabel')} value={f.label} onChangeText={(v) => setF({ ...f, label: v })} maxLength={200} editable={!locked} returnKeyType="next" />
          <NumberBox label={t('pr.m.amount')} value={f.amount} onChange={(v) => setF({ ...f, amount: v })} suffix={shop.currency} editable={!locked} />
          <DateField label={t('pr.m.date')} value={f.date} onChange={(v) => setF({ ...f, date: v })} max={today()} />
          <View style={{ gap: 6 }}>
            <ThemedText type="smallBold">{t('pr.m.category')}</ThemedText>
            <Chips scroll={false} value={f.category} onChange={(v) => !locked && setF({ ...f, category: v })} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`pr.m.cat.${c}`) }))} />
          </View>
          <Switch label={t('pr.m.rebillable')} hint={t('pr.m.rebillableHint')} value={f.rebillable} onChange={(v) => !locked && setF({ ...f, rebillable: v })} />
          {f.rebillable ? <NumberBox label={t('pr.m.markup')} value={f.markup} onChange={(v) => setF({ ...f, markup: v })} suffix="%" hint={t('pr.m.markupHint')} editable={!locked} /> : null}
          {existing && !locked && shop.can('PRO_EXPENSES', 'delete') ? <Btn small variant="danger" icon="trash" title={t('ws.delete')} onPress={() => void remove()} /> : null}
        </View>
      </Sheet>
      {big ? (
        <Sheet visible tall title={t('pr.m.receipt')} onClose={() => setBig(null)}>
          <Image source={{ uri: big }} style={{ width: '100%', aspectRatio: 0.75, borderRadius: 12 }} contentFit="contain" />
        </Sheet>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------------------------------------ taches */

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH'];
export const priorityTone = (p: string) => (p === 'HIGH' ? 'danger' : p === 'LOW' ? 'neutral' : 'info') as 'danger' | 'neutral' | 'info';

/** Creation ou edition d'une tache / echeance d'un dossier. */
export function TaskSheet({ task, preset, members, onClose, onSaved }: { task?: Task | null; preset?: SelCase | null; members: Member[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [sel, setSel] = useState<SelCase | null>(task ? { id: task.caseId, number: task.caseNumber, title: task.caseTitle } : preset ?? null);
  const [f, setF] = useState({ title: task?.title ?? '', dueOn: task?.dueOn ?? '', priority: task?.priority ?? 'NORMAL', assigneeId: task?.assigneeId ?? '', notes: task?.notes ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mark = (e: unknown) => setError(e instanceof NetworkError ? t('common.network') : errMessage(e, t('common.error')));
  async function save() {
    if (!sel) return;
    setBusy(true); setError(null);
    const body = { title: f.title.trim(), dueOn: f.dueOn || undefined, priority: f.priority, assigneeId: f.assigneeId || undefined, notes: f.notes.trim() || undefined };
    try {
      if (task) await shop.call(`${PRO_API}/tasks/${task.id}`, { method: 'PUT', body });
      else await shop.call(`${PRO_API}/cases/${sel.id}/tasks`, { method: 'POST', body });
      toast(t('pr.m.saved')); onSaved();
    } catch (e) { mark(e); } finally { setBusy(false); }
  }
  async function remove() {
    if (!task || !(await confirmAction(t('pr.m.deleteTaskTitle'), t('pr.m.deleteTaskText'), t('ws.delete'), t('common.cancel')))) return;
    setBusy(true);
    try { await shop.call(`${PRO_API}/tasks/${task.id}`, { method: 'DELETE' }); onSaved(); } catch (e) { mark(e); } finally { setBusy(false); }
  }
  return (
    <Sheet visible tall title={task ? t('pr.m.editTask') : t('pr.m.newTask')} onClose={onClose}
      footer={<Btn icon="check" title={busy ? t('ws.saving') : t('common.save')} loading={busy} disabled={!sel || !f.title.trim()} onPress={() => void save()} />}>
      <View style={{ gap: 12 }}>
        {error ? <ErrorNote message={error} /> : null}
        <CasePicker label={t('pr.m.case')} value={sel} onChange={setSel} disabled={task != null || preset != null} />
        <TextBox label={t('pr.m.taskTitle')} value={f.title} onChangeText={(v) => setF({ ...f, title: v })} maxLength={200} returnKeyType="next" />
        <DateField label={t('pr.m.dueOn')} value={f.dueOn} onChange={(v) => setF({ ...f, dueOn: v })} optional />
        <View style={{ gap: 6 }}>
          <ThemedText type="smallBold">{t('pr.m.priority')}</ThemedText>
          <Chips scroll={false} value={f.priority} onChange={(v) => setF({ ...f, priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: t(`pr.m.prio.${p}`) }))} />
        </View>
        {members.length > 1 ? (
          <View style={{ gap: 6 }}>
            <ThemedText type="smallBold">{t('pr.m.assignee')}</ThemedText>
            <Chips value={f.assigneeId} onChange={(v) => setF({ ...f, assigneeId: v })} options={[{ value: '', label: t('pr.m.unassigned') }, ...members.filter((m) => m.active).map((m) => ({ value: m.id, label: m.name }))]} />
          </View>
        ) : null}
        <TextBox label={t('pr.m.notes')} value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline maxLength={1000} />
        {task && shop.can('PRO_CASES', 'delete') ? <Btn small variant="danger" icon="trash" title={t('ws.delete')} onPress={() => void remove()} /> : null}
      </View>
    </Sheet>
  );
}

/** Case a cocher d'une tache : bouton frere de la ligne (jamais imbrique dans une ligne cliquable). */
export function TaskCheck({ task, onToggle, disabled }: { task: Task; onToggle: (done: boolean) => void; disabled?: boolean }) {
  const { t } = useT();
  const th = useTheme();
  const done = !!task.doneAt;
  return (
    <Pressable onPress={() => onToggle(!done)} disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked: done, disabled }} accessibilityLabel={done ? t('pr.m.reopen') : t('pr.m.markDone')}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: done ? th.success : task.overdue ? th.danger : th.textSecondary, backgroundColor: done ? th.successBg : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {done ? <Icon name="check" size={13} color={th.success} /> : null}
      </View>
    </Pressable>
  );
}

/** Ligne de tache : case a cocher a gauche, zone cliquable (edition) a droite, deux elements voisins. */
export function TaskLine({ task, onToggle, onOpen, canToggle, showCase }: { task: Task; onToggle: (done: boolean) => void; onOpen?: () => void; canToggle: boolean; showCase?: boolean }) {
  const { t, lang } = useT();
  const th = useTheme();
  const due = task.dueOn ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(`${task.dueOn}T12:00:00`)) : null;
  const body = (
    <View style={{ flex: 1, minWidth: 0, paddingVertical: 10, gap: 2 }}>
      <ThemedText type="smallBold" numberOfLines={2} style={task.doneAt ? { textDecorationLine: 'line-through', opacity: 0.6 } : undefined}>{task.title}</ThemedText>
      {showCase && task.caseNumber ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{task.caseNumber} · {task.caseTitle}{task.partyName ? ` · ${task.partyName}` : ''}</ThemedText> : null}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {due ? <Badge tone={task.overdue && !task.doneAt ? 'danger' : 'neutral'}>{due}</Badge> : null}
        {task.priority !== 'NORMAL' ? <Badge tone={priorityTone(task.priority)}>{t(`pr.m.prio.${task.priority}`)}</Badge> : null}
        {task.assigneeName ? <ThemedText type="small" themeColor="textSecondary">{task.assigneeName}</ThemedText> : null}
      </View>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: th.backgroundElement, borderRadius: 18, paddingLeft: 4, paddingRight: 12, minHeight: 64 }}>
      <TaskCheck task={task} onToggle={onToggle} disabled={!canToggle} />
      {onOpen ? <Pressable onPress={onOpen} accessibilityRole="button" style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>{body}<Icon name="chevron-right" size={12} color={th.textSecondary} /></Pressable> : body}
    </View>
  );
}

export { statusTone };
