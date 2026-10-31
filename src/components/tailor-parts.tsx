import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, ErrorNote, Hint, NumberBox, SectionTitle, Sheet, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { uuid } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { useShop } from '@/lib/shop';

const API = '/api/shop/tailor';
export const MEASURE_GROUPS: [string, string[]][] = [
  ['upper', ['height', 'neck', 'shoulders', 'chest', 'underBust', 'waist', 'hips', 'backLength', 'frontLength']],
  ['arms', ['armLength', 'bicep', 'wrist']],
  ['lower', ['inseam', 'outseam', 'thigh', 'knee', 'ankle', 'crotch']],
  ['lengths', ['dressLength', 'skirtLength', 'shoeSize']],
];
export const RELATIONS = ['SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'OTHER'];

export type Client = { id: string; name: string; phone?: string | null; orders: number; openOrders: number; owed: number; spent: number; sheets: number; lastOrderAt?: string | null; urgentOpen?: boolean };
export type Member = { id: string; name: string; relation: string; active: boolean; sheets: number; pieces: number };
export type Current = Record<string, { value: number; unit: string; takenOn: string }>;

/** Choix de la cliente par son telephone (quelques chiffres) ou son nom ; une cliente connue n'est jamais recreee. */
export function ClientFinder({ value, selected, onChange }: { value: string | null; selected?: Client | null; onChange: (id: string | null, c: Client | null) => void }) {
  const { t } = useT();
  const shop = useShop();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Client[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return undefined;
    let live = true;
    const h = setTimeout(() => { shop.call<Client[]>(`${API}/clients/search?q=${encodeURIComponent(q.trim())}`).then((r) => { if (live) setFound(r); }).catch(() => { if (live) setFound([]); }); }, 250);
    return () => { live = false; clearTimeout(h); };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = q.trim().length < 2 ? null : found;
  const pick = (c: Client) => { onChange(c.id, c); setQ(''); setAdding(false); setFound(null); };
  async function create() {
    setError(null);
    try {
      const dup = f.phone.replace(/\D/g, '').length >= 6 ? await shop.call<Client[]>(`${API}/clients/search?q=${encodeURIComponent(f.phone)}`) : [];
      if (dup.length > 0) { pick(dup[0]); return; }
      const p = await shop.call<{ id: string; name: string; phone?: string }>('/api/shop/parties', { method: 'POST', body: { id: uuid(), roles: ['CUSTOMER'], name: f.name.trim(), phone: f.phone.trim() } });
      pick({ id: p.id, name: p.name, phone: p.phone, orders: 0, openOrders: 0, owed: 0, spent: 0, sheets: 0 });
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  if (value && selected && selected.id === value) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ThemedText type="smallBold" style={{ flex: 1 }}>{selected.name}</ThemedText>{selected.phone ? <ThemedText type="small" themeColor="textSecondary">{selected.phone}</ThemedText> : null}
          <Btn small variant="secondary" title={t('ws.change')} onPress={() => onChange(null, null)} />
        </View>
        {selected.orders > 0 ? <ThemedText type="small" themeColor="textSecondary">{t('tl.cl.summary', { orders: selected.orders, open: selected.openOrders })}{selected.owed > 0 ? ` · ${t('tl.owes', { amount: shop.money(selected.owed) })}` : ''}</ThemedText> : null}
      </Card>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <TextBox label={t('tl.cl.find')} value={q} onChangeText={setQ} placeholder={t('tl.cl.findHint')} keyboardType="default" />
      {results && results.length > 0 ? results.map((c) => (
        <Card key={c.id} onPress={() => pick(c)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <ThemedText type="smallBold" style={{ flex: 1 }}>{c.name}</ThemedText>
            {c.openOrders > 0 ? <Badge tone="warning">{t('tl.openN', { n: c.openOrders })}</Badge> : null}{c.owed > 0 ? <Badge tone="danger">{shop.money(c.owed)}</Badge> : null}
          </View>
          <ThemedText type="small" themeColor="textSecondary">{c.phone ?? t('tl.cl.noPhone')} · {c.orders > 0 ? t('tl.cl.ordersN', { n: c.orders }) : t('tl.cl.new')}</ThemedText>
        </Card>
      )) : null}
      {results && results.length === 0 && q.trim().length >= 3 ? <ThemedText themeColor="textSecondary">{t('tl.cl.none')}</ThemedText> : null}
      {!adding ? <Btn small variant="secondary" icon="plus" title={t('tl.cl.add')} onPress={() => { setAdding(true); setF({ name: /\d{3}/.test(q) ? '' : q, phone: /\d{3}/.test(q) ? q : '' }); }} /> : (
        <Card>
          {error ? <ErrorNote message={error} /> : null}
          <TextBox label={t('tl.name')} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} maxLength={200} />
          <TextBox label={t('tl.phone')} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" maxLength={40} />
          <ThemedText type="small" themeColor="textSecondary">{t('tl.cl.phoneHelp')}</ThemedText>
          <View style={{ flexDirection: 'row', gap: 8 }}><Btn small variant="secondary" title={t('common.cancel')} onPress={() => setAdding(false)} /><Btn small title={t('common.save')} disabled={!f.name.trim() || f.phone.trim().length < 6} onPress={() => void create()} /></View>
        </Card>
      )}
    </View>
  );
}

/** Personnes de la famille d'une cliente. */
export function useMembers(partyId: string | null): [Member[], () => Promise<void>] {
  const shop = useShop();
  const [members, setMembers] = useState<Member[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!partyId) return undefined;
    let live = true;
    shop.call<Member[]>(`${API}/clients/${partyId}/members`).then((m) => { if (live) setMembers(m); }).catch(() => { if (live) setMembers([]); });
    return () => { live = false; };
  }, [shop, partyId, tick]);
  const reload = useCallback(async () => { setTick((n) => n + 1); }, []);
  return [partyId ? members : [], reload];
}

/** « Pour qui ? » : la cliente ou une personne de sa famille ; on peut en ajouter une sur place. */
export function MemberBar({ partyId, partyName, memberId, onChange, members, reload, label }: { partyId: string; partyName?: string; memberId: string | null; onChange: (id: string | null) => void; members: Member[]; reload: () => Promise<void>; label?: string }) {
  const { t } = useT();
  const shop = useShop();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', relation: 'CHILD' });
  const [error, setError] = useState<string | null>(null);
  async function add() {
    setError(null);
    try {
      const m = await shop.call<Member>(`${API}/clients/${partyId}/members`, { method: 'POST', body: { id: uuid(), name: f.name.trim(), relation: f.relation } });
      await reload(); onChange(m.id); setAdding(false); setF({ name: '', relation: 'CHILD' });
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  return (
    <View style={{ gap: 8 }}>
      <ThemedText type="small" themeColor="textSecondary">{label ?? t('tl.mb.for')}</ThemedText>
      <Chips options={[{ value: '', label: partyName ?? t('tl.mb.self') }, ...members.filter((m) => m.active).map((m) => ({ value: m.id, label: m.name }))]} value={memberId ?? ''} onChange={(v) => onChange(v || null)} />
      <Btn small variant="secondary" icon="plus" title={t('tl.mb.add')} onPress={() => setAdding(!adding)} />
      {adding ? (
        <Card>
          {error ? <ErrorNote message={error} /> : null}
          <TextBox label={t('tl.name')} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder={t('tl.mb.nameHint')} maxLength={100} />
          <Chips options={RELATIONS.map((r) => ({ value: r, label: t(`tl.mb.rel.${r}`) }))} value={f.relation} onChange={(v) => setF({ ...f, relation: v })} />
          <Btn small title={t('common.save')} disabled={!f.name.trim()} onPress={() => void add()} />
        </Card>
      ) : null}
    </View>
  );
}

export function CurrentMeasures({ values }: { values?: Current | null }) {
  const { t } = useT();
  const entries = Object.entries(values ?? {});
  if (entries.length === 0) return <ThemedText themeColor="textSecondary">{t('tl.noSheet')}</ThemedText>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {entries.map(([k, v]) => <View key={k}><ThemedText type="small" themeColor="textSecondary">{t(`tl.m.${k}`)}</ThemedText><ThemedText type="smallBold">{Number(v.value)} {v.unit}</ThemedText></View>)}
    </View>
  );
}

/** Prise de mesures d'une personne : mesures utiles a la piece d'abord, « pris par », unite, remarques ; hors ligne la fiche part dans la file (rejouable). */
export function SheetForm({ partyId, memberId, memberName, base, highlight = [], onClose, onSaved }: { partyId: string; memberId: string | null; memberName?: string; base?: Current | null; highlight?: string[]; onClose: () => void; onSaved: (queued: boolean) => void }) {
  const { t } = useT();
  const shop = useShop();
  const outbox = useOffline();
  const [unit, setUnit] = useState(Object.values(base ?? {})[0]?.unit ?? 'cm');
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [by, setBy] = useState('');
  const [all, setAll] = useState(highlight.length === 0);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(base ?? {}).map(([k, v]) => [k, String(v.value)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useRef(uuid());
  const filled = Object.values(vals).filter((v) => v !== '' && Number(v) > 0).length;
  const shown = (keys: string[]) => (all ? keys : keys.filter((k) => highlight.includes(k)));
  async function save() {
    setBusy(true); setError(null);
    try {
      const values = Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== '' && Number(v) > 0).map(([k, v]) => [k, Number(v)]));
      const body = { id: id.current, memberId: memberId || undefined, label: label.trim() || undefined, unit, notes: notes.trim() || undefined, takenBy: by.trim() || undefined, values };
      const res = await outbox.submit({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `${API}/clients/${partyId}/measures`, body, kind: 'tailor', label: `${t('tl.newSheet')} · ${memberName ?? ''}`, group: `measures:${partyId}` });
      onSaved(!!res.queued);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible tall title={`${t('tl.newSheet')}${memberName ? ` · ${memberName}` : ''}`} onClose={onClose} footer={<Btn title={busy ? t('ws.saving') : `${t('common.save')} (${t('tl.filled', { n: filled })})`} loading={busy} disabled={filled === 0} onPress={() => void save()} />}>
      <View style={{ gap: 12 }}>
        {error ? <ErrorNote message={error} /> : null}
        {base && Object.keys(base).length > 0 ? <Hint>{t('tl.prefilled2')}</Hint> : null}
        {highlight.length > 0 ? <Hint>{t('tl.neededNow')}</Hint> : null}
        <TextBox label={t('tl.sheetLabel')} value={label} onChangeText={setLabel} placeholder={t('tl.sheetLabelHint')} maxLength={80} />
        <Chips options={[{ value: 'cm', label: 'cm' }, { value: 'in', label: 'in' }]} value={unit} onChange={setUnit} />
        <TextBox label={t('tl.takenBy')} value={by} onChangeText={setBy} placeholder={t('tl.takenByHint')} maxLength={80} />
        {MEASURE_GROUPS.map(([g, keys]) => shown(keys).length > 0 ? (
          <View key={g} style={{ gap: 8 }}>
            <SectionTitle title={t(`tl.mg.${g}`)} />
            {shown(keys).map((k) => <NumberBox key={k} label={`${t(`tl.m.${k}`)}${highlight.includes(k) ? ' *' : ''}`} value={vals[k] ?? ''} onChange={(v) => setVals((a) => ({ ...a, [k]: v }))} suffix={k === 'shoeSize' ? undefined : unit} />)}
          </View>
        ) : null)}
        {!all ? <Btn small variant="secondary" title={t('tl.allMeasures')} onPress={() => setAll(true)} /> : null}
        <TextBox label={t('tl.posture')} value={notes} onChangeText={setNotes} placeholder={t('tl.postureHint')} multiline maxLength={1000} />
        <Btn small variant="secondary" title={t('common.cancel')} onPress={onClose} />
      </View>
    </Sheet>
  );
}

export { useToast };
