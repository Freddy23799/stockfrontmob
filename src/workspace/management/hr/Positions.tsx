import { useRef, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Empty, ErrorNote, Hint, NumberBox, Row, Sheet, Skeleton, Stack, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { uuid } from '@/lib/format';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

type Item = { id: string; name: string; description?: string; rank?: number; active: boolean; staffCount: number };

function ItemSheet({ kind, item, onClose, onSaved }: { kind: 'positions' | 'grades'; item: Item | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const id = useRef(item?.id ?? uuid());
  const [f, setF] = useState({ name: item?.name ?? '', description: item?.description ?? '', rank: String(item?.rank ?? 0), active: item?.active ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/shop/hr/${kind}`;
  async function submit() {
    setBusy(true); setError(null);
    try { await shop.call(item ? `${base}/${item.id}` : base, { method: item ? 'PUT' : 'POST', body: { id: id.current, name: f.name, description: f.description, active: f.active, ...(kind === 'grades' ? { rank: Number(f.rank) } : {}) } }); toast(t('ws.saved')); onSaved(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  async function remove() {
    if (!(await confirmAction(t('ws.deleteTitle', { name: item!.name }), t('hr.deleteItemText'), t('ws.delete'), t('common.cancel')))) return;
    try { await shop.call(`${base}/${item!.id}`, { method: 'DELETE' }); toast(t('ws.deleted')); onSaved(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  return (
    <Sheet visible title={item ? item.name : t(kind === 'grades' ? 'hr.newGrade' : 'hr.newPosition')} onClose={onClose}
      footer={<View style={{ gap: 8 }}><Btn icon="check" title={t('common.save')} loading={busy} disabled={busy || !f.name.trim()} onPress={submit} />{item && shop.can('HR', 'delete') ? <Btn variant="danger" icon="trash" title={t('ws.delete')} onPress={remove} /> : null}</View>}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <TextBox label={`${t('ws.name')} *`} value={f.name} onChangeText={(v) => setF((s) => ({ ...s, name: v }))} maxLength={120} autoFocus autoCapitalize="sentences" />
      {kind === 'grades' ? <NumberBox label={t('hr.rank')} value={f.rank} onChange={(v) => setF((s) => ({ ...s, rank: v }))} hint={t('hr.rankHint')} /> : null}
      <TextBox label={t('ws.note')} value={f.description} onChangeText={(v) => setF((s) => ({ ...s, description: v }))} multiline autoCapitalize="sentences" />
      {item ? <Switch value={f.active} onChange={(v) => setF((s) => ({ ...s, active: v }))} label={t('hr.activeItem')} /> : null}
    </Sheet>
  );
}

function Block({ kind }: { kind: 'positions' | 'grades' }) {
  const { t } = useT();
  const shop = useShop();
  const q = useQuery<Item[]>(`/api/shop/hr/${kind}?all=true`);
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  return (
    <Stack gap={8}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ThemedText type="smallBold" style={{ flex: 1, fontSize: 16 }}>{t(kind === 'grades' ? 'hr.grades' : 'hr.positions')}</ThemedText>
        {shop.can('HR', 'create') ? <Btn small icon="plus" title={t('hr.add')} onPress={() => setEditing('new')} /> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">{t(kind === 'grades' ? 'hr.gradesHint' : 'hr.positionsHint')}</ThemedText>
      {q.error && !q.data ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
      {!q.data && !q.error ? <Skeleton rows={2} height={60} /> : null}
      {q.data && q.data.length === 0 ? <Empty icon="sliders" title={t('hr.noItems')} /> : null}
      {(q.data ?? []).map((r) => (
        <Row key={r.id} icon={kind === 'grades' ? 'ranking-star' : 'briefcase'} tone={r.active ? 'primary' : 'neutral'} title={r.name} subtitle={r.description}
          right={<View style={{ alignItems: 'flex-end', gap: 4 }}>{kind === 'grades' ? <Badge tone="info">{t('hr.rankShort', { n: r.rank ?? 0 })}</Badge> : null}<Badge tone={r.staffCount > 0 ? 'success' : 'warning'}>{t('hr.peopleCount', { count: r.staffCount })}</Badge></View>}
          onPress={() => setEditing(r)} />
      ))}
      {editing ? <ItemSheet kind={kind} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void q.reload(); }} /> : null}
    </Stack>
  );
}

export default function Positions() {
  return <Stack gap={20}><Block kind="positions" /><Block kind="grades" /></Stack>;
}
