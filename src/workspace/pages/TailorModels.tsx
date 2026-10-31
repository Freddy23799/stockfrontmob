import { useState } from 'react';
import { View } from 'react-native';

import { MEASURE_GROUPS } from '@/components/tailor-parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, NumberBox, Screen, SectionTitle, Sheet, Skeleton, Stack, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { qs, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/tailor';
const KINDS = ['CUSTOM', 'ALTERATION', 'SET'];
type Model = { id: string; name: string; kind: string; measureKeys: string[]; defaultPrice: number; defaultDays: number; fabricMeters?: number | null; active: boolean; parts: { partId: string; name: string; quantity: number }[] };

function ModelSheet({ model, models, onClose, onSaved }: { model: Model | null; models: Model[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [f, setF] = useState({ name: model?.name ?? '', kind: model?.kind ?? 'CUSTOM', price: model ? String(model.defaultPrice) : '', days: String(model?.defaultDays ?? 7), meters: model?.fabricMeters != null ? String(model.fabricMeters) : '', active: model?.active ?? true });
  const [keys, setKeys] = useState<Set<string>>(new Set(model?.measureKeys ?? []));
  const [parts, setParts] = useState<Record<string, number>>(Object.fromEntries((model?.parts ?? []).map((p) => [p.partId, p.quantity])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pieces = models.filter((m) => m.kind !== 'SET' && m.active && m.id !== model?.id);
  async function save() {
    setBusy(true); setError(null);
    try {
      await shop.call(model ? `${API}/models/${model.id}` : `${API}/models`, { method: model ? 'PUT' : 'POST', body: { name: f.name.trim(), kind: f.kind, measureKeys: [...keys], defaultPrice: f.price === '' ? 0 : Number(f.price), defaultDays: Number(f.days), fabricMeters: f.meters === '' ? undefined : Number(f.meters), active: f.active,
        parts: f.kind === 'SET' ? Object.entries(parts).filter(([, q]) => q > 0).map(([partId, quantity]) => ({ partId, quantity })) : undefined } });
      onSaved();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible tall title={model?.name ?? t('tl.md.new')} onClose={onClose} footer={<Btn title={t('common.save')} loading={busy} disabled={!f.name.trim()} onPress={() => void save()} />}>
      <View style={{ gap: 12 }}>
        {error ? <ErrorNote message={error} /> : null}
        <TextBox label={t('tl.name')} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder={t('tl.md.nameHint')} maxLength={120} />
        <Chips options={KINDS.map((k) => ({ value: k, label: t(`tl.md.kind.${k}`) }))} value={f.kind} onChange={(v) => setF({ ...f, kind: v })} />
        {f.kind !== 'SET' ? <NumberBox label={t('tl.md.price')} value={f.price} onChange={(v) => setF({ ...f, price: v })} /> : null}
        <NumberBox label={t('tl.md.days')} value={f.days} onChange={(v) => setF({ ...f, days: v })} />
        {f.kind === 'CUSTOM' ? <NumberBox label={t('tl.md.meters')} value={f.meters} onChange={(v) => setF({ ...f, meters: v })} /> : null}
        {f.kind === 'SET' ? (
          <>
            <SectionTitle title={t('tl.md.parts')} hint={t('tl.md.partsHelp')} />
            {pieces.map((p) => <NumberBox key={p.id} label={p.name} value={String(parts[p.id] ?? 0)} onChange={(v) => setParts((a) => ({ ...a, [p.id]: Number(v) || 0 }))} />)}
          </>
        ) : (
          <>
            <SectionTitle title={t('tl.md.keys')} hint={t('tl.md.keysHelp')} />
            {MEASURE_GROUPS.map(([g, ks]) => (
              <View key={g} style={{ gap: 6 }}>
                <ThemedText type="smallBold">{t(`tl.mg.${g}`)}</ThemedText>
                {ks.map((k) => <Switch key={k} label={t(`tl.m.${k}`)} value={keys.has(k)} onChange={(v) => setKeys((s) => { const n = new Set(s); if (v) n.add(k); else n.delete(k); return n; })} />)}
              </View>
            ))}
          </>
        )}
        {model ? <Switch label={t('tl.active')} value={f.active} onChange={(v) => setF({ ...f, active: v })} /> : null}
      </View>
    </Sheet>
  );
}

/** Modeles de pieces : mesures a prendre, prix, delai, tissu moyen ; les ensembles regroupent plusieurs pieces. */
export default function TailorModels({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Model[]>(`${API}/models${qs({ all: true })}`);
  const [edit, setEdit] = useState<Model | null | undefined>(undefined);
  const can = shop.can('TAILOR_ORDERS', 'create');
  async function seed() { try { await shop.call(`${API}/models/seed`, { method: 'POST', body: {} }); toast(t('tl.md.seeded')); void q.reload(); } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network')); } }
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={q.reload} right={can ? <Btn small icon="plus" title={t('tl.md.new')} onPress={() => setEdit(null)} /> : undefined}>
      <Hint>{t('tl.md.intro')}</Hint>
      {can ? <Btn small variant="secondary" icon="sparkles" title={t('tl.md.seed')} onPress={() => void seed()} /> : null}
      {q.error && !q.data ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
      {!q.data ? <Skeleton rows={3} /> : q.data.length === 0 ? <Empty icon="shirt" title={t('tl.md.none')} text={t('tl.md.noneText')} /> : KINDS.map((k) => {
        const list = q.data!.filter((m) => m.kind === k);
        return list.length === 0 ? null : (
          <View key={k} style={{ gap: 8 }}>
            <SectionTitle title={t(`tl.md.kind.${k}`)} />
            <Stack gap={8}>{list.map((m) => (
              <Card key={m.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{m.name}</ThemedText>{!m.active ? <Badge tone="danger">{t('tl.inactive')}</Badge> : null}{m.defaultPrice > 0 ? <ThemedText type="smallBold">{shop.money(m.defaultPrice)}</ThemedText> : null}</View>
                <ThemedText type="small" themeColor="textSecondary">{k === 'SET' ? m.parts.map((p) => `${p.quantity > 1 ? `${p.quantity}× ` : ''}${p.name}`).join(' + ') : t('tl.md.keysN', { n: m.measureKeys.length })} · {t('tl.md.daysN', { n: m.defaultDays })}</ThemedText>
                {can ? <View style={{ flexDirection: 'row', marginTop: 8 }}><Btn small variant="secondary" title={t('ws.edit')} onPress={() => setEdit(m)} /></View> : null}
              </Card>
            ))}</Stack>
          </View>
        );
      })}
      {edit !== undefined ? <ModelSheet model={edit} models={q.data ?? []} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); toast(t('tl.saved')); void q.reload(); }} /> : null}
    </Screen>
  );
}
