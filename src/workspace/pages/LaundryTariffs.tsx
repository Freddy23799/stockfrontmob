import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { errText } from '@/components/laundry-order';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Fab, Input, NumberBox, Screen, Sheet, Skeleton, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { API, num } from '@/lib/laundry';
import { useProgressive } from '@/lib/list';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { ListFooter } from '@/components/list-footer';
import { uuid } from '@/lib/format';
import type { PageProps } from '../registry';

type G = { id: string; name: string; family?: string; sortOrder?: number; active?: boolean };
type S = { id: string; name: string; basePrice: number | string; pricingMode: string; active?: boolean };
type Tariffs = { services: S[]; garmentTypes: G[]; cells: { serviceId: string; garmentTypeId: string; price: number }[] };
const FAMILIES = ['TOPS', 'BOTTOMS', 'SUITS', 'DRESSES', 'OUTERWEAR', 'HOME', 'OTHER'];

function GarmentForm({ initial, families, onClose, onSaved }: { initial: G | null; families: string[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [f, setF] = useState({ name: initial?.name ?? '', family: initial?.family ?? families[0] ?? '', sortOrder: String(initial?.sortOrder ?? 0), active: initial?.active ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try { await shop.call(initial ? `${API}/garment-types/${initial.id}` : `${API}/garment-types`, { method: initial ? 'PUT' : 'POST', body: { id: initial?.id ?? uuid(), name: f.name.trim(), family: f.family, sortOrder: num(f.sortOrder), active: f.active } }); onSaved(); } catch (e) { setError(errText(e, t('common.error'))); setBusy(false); }
  }
  return (
    <Sheet visible title={initial ? t('ld.editGarment') : t('ld.newGarment')} onClose={onClose} footer={<Btn title={t('common.save')} disabled={!f.name.trim()} loading={busy} onPress={() => void save()} />}>
      {error ? <ErrorNote message={error} /> : null}
      <TextBox label={t('ld.garmentName')} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} maxLength={80} />
      <ThemedText type="smallBold">{t('ld.family')}</ThemedText>
      <Chips value={f.family} onChange={(v) => setF({ ...f, family: v })} options={families.map((x) => ({ value: x, label: t(`ld.family.${x}`) === `ld.family.${x}` ? x : t(`ld.family.${x}`) }))} />
      <NumberBox label={t('ld.sortOrder')} value={f.sortOrder} onChange={(v) => setF({ ...f, sortOrder: v })} />
      <Switch value={f.active} onChange={(v) => setF({ ...f, active: v })} label={t('ld.garmentActive')} hint={initial ? t('ld.garmentDeleteHelp') : undefined} />
    </Sheet>
  );
}

/** Grille tarifaire : un vetement = une carte avec le prix pour chaque prestation (case vide = prix de base) ; types de vetements. */
export default function LaundryTariffs({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Tariffs>(`${API}/tariffs`);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [garment, setGarment] = useState<G | 'new' | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const data = q.data;
  const canEdit = shop.can('LAUNDRY_ORDERS', 'update');
  const cells = useMemo(() => { const m: Record<string, string> = {}; (data?.cells ?? []).forEach((c) => { m[`${c.serviceId}|${c.garmentTypeId}`] = String(c.price); }); return m; }, [data]);
  const services = (data?.services ?? []).filter((s) => s.active !== false);
  const garments = useMemo(() => (data?.garmentTypes ?? []).filter((g) => !filter || g.name.toLowerCase().includes(filter.toLowerCase())), [data, filter]);
  const prog = useProgressive(garments, 12);
  const families = useMemo(() => { const s = [...new Set((data?.garmentTypes ?? []).map((g) => g.family).filter(Boolean) as string[])]; return s.length ? s : FAMILIES; }, [data]);
  const value = (k: string) => (k in edits ? edits[k] : cells[k] ?? '');
  const changed = Object.keys(edits).filter((k) => edits[k] !== (cells[k] ?? ''));

  async function save() {
    setBusy(true); setError(null);
    try {
      await shop.call(`${API}/tariffs`, { method: 'PUT', body: { cells: changed.map((k) => { const [serviceId, garmentTypeId] = k.split('|'); return { serviceId, garmentTypeId, price: edits[k] === '' ? null : num(edits[k]) }; }) } });
      toast(t('ld.tariffsSaved')); setEdits({}); await q.reload();
    } catch (e) { setError(errText(e, t('common.error'))); } finally { setBusy(false); }
  }
  async function setup() {
    setSettingUp(true);
    try { await shop.call(`${API}/setup`, { method: 'POST' }); await q.reload(); } catch (e) { setError(errText(e, t('common.error'))); } finally { setSettingUp(false); }
  }
  const title = shop.tr(item.label);
  if (q.loading && !data) return <Screen tabs={tab} title={title}><Skeleton rows={4} height={110} /></Screen>;
  if (q.error && !data) return <Screen tabs={tab} title={title}><ErrorNote message={q.error} onRetry={q.reload} /></Screen>;
  if (!data || (services.length === 0 && data.garmentTypes.length === 0)) {
    return <Screen tabs={tab} title={title}><Empty icon="tag" title={t('ld.setupTitle')} text={t('ld.setupText')} action={<Btn title={t('ld.setupGo')} loading={settingUp} onPress={() => void setup()} />} /></Screen>;
  }
  return (
    <Screen tabs={tab} title={title} subtitle={t('ld.tariffsSubtitle')} onEndReached={prog.loadMore} keyboard
      footer={canEdit && changed.length > 0 ? <View style={{ gap: 8 }}><Btn title={`${t('common.save')} · ${t('ld.changedCells', { count: changed.length })}`} loading={busy} onPress={() => void save()} /><Btn variant="ghost" small title={t('ld.discard')} onPress={() => setEdits({})} /></View> : undefined}>
      <View style={{ gap: 10 }}>
        <Input value={filter} onChangeText={setFilter} placeholder={t('ld.searchGarment')} autoCapitalize="none" />
        {error ? <ErrorNote message={error} /> : null}
        {prog.visible.map((g) => (
          <Card key={g.id} onPress={canEdit ? () => setGarment(g) : undefined}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{g.name}</ThemedText>{g.active === false ? <Badge tone="info">{t('ld.inactive')}</Badge> : null}</View>
            {services.map((s) => {
              const k = `${s.id}|${g.id}`;
              return (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}><ThemedText type="small">{s.name}</ThemedText><ThemedText type="small" themeColor="textSecondary">{t('ld.basePrice')} {shop.money(s.basePrice)}{s.pricingMode === 'PER_KG' ? ' / kg' : ''}</ThemedText></View>
                  <View style={{ width: 110 }}><Input editable={canEdit} keyboardType="decimal-pad" value={value(k)} placeholder={String(num(s.basePrice) || '')} accessibilityLabel={`${g.name} ${s.name}`} onChangeText={(v) => setEdits((x) => ({ ...x, [k]: v.replace(',', '.').replace(/[^0-9.]/g, '') }))} /></View>
                </View>
              );
            })}
          </Card>
        ))}
        <ListFooter shown={prog.visible.length} total={prog.total} hasMore={prog.hasMore} onMore={prog.loadMore} />
        <ThemedText type="small" themeColor="textSecondary">{t('ld.gridHelp')}</ThemedText>
      </View>
      {canEdit ? <Fab label={t('ld.newGarment')} onPress={() => setGarment('new')} /> : null}
      {garment ? <GarmentForm initial={garment === 'new' ? null : garment} families={families} onClose={() => setGarment(null)} onSaved={() => { setGarment(null); toast(t('ld.garmentSaved')); void q.reload(); }} /> : null}
    </Screen>
  );
}
