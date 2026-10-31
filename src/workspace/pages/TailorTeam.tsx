import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Empty, ErrorNote, Screen, Sheet, Skeleton, Stack, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { qs, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/tailor';
const COLORS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#475569'];
type Worker = { id: string; name: string; phone?: string | null; specialty?: string | null; color: string; active: boolean; openOrders: number; lateOrders: number };

function WorkerSheet({ worker, onClose, onSaved }: { worker: Worker | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [f, setF] = useState({ name: worker?.name ?? '', phone: worker?.phone ?? '', specialty: worker?.specialty ?? '', color: worker?.color ?? COLORS[0], active: worker?.active ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try { await shop.call(worker ? `${API}/workers/${worker.id}` : `${API}/workers`, { method: worker ? 'PUT' : 'POST', body: f }); onSaved(); }
    catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible title={worker?.name ?? t('tl.newTailor')} onClose={onClose} footer={<Btn title={t('common.save')} loading={busy} disabled={!f.name.trim()} onPress={() => void save()} />}>
      <View style={{ gap: 12 }}>
        {error ? <ErrorNote message={error} /> : null}
        <TextBox label={t('tl.name')} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} maxLength={120} />
        <TextBox label={t('tl.phone')} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" maxLength={40} />
        <TextBox label={t('tl.specialty')} value={f.specialty} onChangeText={(v) => setF({ ...f, specialty: v })} placeholder={t('tl.specialtyHint')} maxLength={80} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {COLORS.map((c) => <Btn key={c} small variant={f.color === c ? 'primary' : 'secondary'} title={f.color === c ? '✓' : ' '} onPress={() => setF({ ...f, color: c })} style={{ backgroundColor: c, minWidth: 44 }} />)}
        </View>
        {worker ? <Switch label={t('tl.active')} value={f.active} onChange={(v) => setF({ ...f, active: v })} /> : null}
      </View>
    </Sheet>
  );
}

/** Couturiers : charge de chacun et retards. */
export default function TailorTeam({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Worker[]>(`${API}/workers${qs({ all: true })}`);
  const [edit, setEdit] = useState<Worker | null | undefined>(undefined);
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={q.reload} right={shop.can('TAILOR_ORDERS', 'create') ? <Btn small icon="plus" title={t('tl.newTailor')} onPress={() => setEdit(null)} /> : undefined}>
      {q.error && !q.data ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
      {!q.data ? <Skeleton rows={3} /> : q.data.length === 0 ? <Empty icon="user-tag" title={t('tl.noTailor')} text={t('tl.noTailorText')} /> : (
        <Stack gap={8}>{q.data.map((w) => (
          <Card key={w.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: w.color }} />
              <ThemedText type="smallBold" style={{ flex: 1 }}>{w.name}</ThemedText>
              {!w.active ? <Badge tone="danger">{t('tl.inactive')}</Badge> : null}
              {w.lateOrders > 0 ? <Badge tone="danger">{t('tl.lateN', { n: w.lateOrders })}</Badge> : null}
              <Badge>{t('tl.openN', { n: w.openOrders })}</Badge>
            </View>
            {w.specialty ? <ThemedText type="small" themeColor="textSecondary">{w.specialty}</ThemedText> : null}
            {shop.can('TAILOR_ORDERS', 'update') ? <View style={{ flexDirection: 'row', marginTop: 8 }}><Btn small variant="secondary" title={t('ws.edit')} onPress={() => setEdit(w)} /></View> : null}
          </Card>
        ))}</Stack>
      )}
      {edit !== undefined ? <WorkerSheet worker={edit} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); toast(t('tl.saved')); void q.reload(); }} /> : null}
    </Screen>
  );
}
