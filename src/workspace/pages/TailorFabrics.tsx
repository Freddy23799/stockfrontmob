import { useState } from 'react';
import { Image, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Empty, ErrorNote, Hint, Screen, SectionTitle, Sheet, Skeleton, Stack, Switch } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { appendPhoto, pickPhoto } from '@/lib/photo';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/tailor';
export type FabricMatch = { productId: string; name: string; unit: string; salePrice: number; stock: number; color?: string | null; similarity: number; dominant: string[]; image?: { variants: Record<string, { webp: string }> } | null };
type Result = { matches: FabricMatch[]; sampleColors: string[]; indexed: number; pending: number };

/** Photographier l'echantillon d'une cliente : les tissus du stock qui lui ressemblent (couleurs, motif), avec stock et prix au metre. */
function FabricSearchBody({ onPick }: { onPick?: (m: FabricMatch) => void }) {
  const { t } = useT();
  const shop = useShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stockOnly, setStockOnly] = useState(true);
  const [last, setLast] = useState<{ uri: string; name: string; type: string } | null>(null);

  async function run(photo: { uri: string; name: string; type: string }, only: boolean) {
    setBusy(true); setError(null);
    try {
      setLast(photo); setPreview(photo.uri);
      const fd = new FormData();
      await appendPhoto(fd, 'file', photo); fd.append('limit', '12'); fd.append('inStockOnly', String(only));
      setRes(await shop.call<Result>(`${API}/fabrics/search`, { method: 'POST', body: fd }));
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  async function take(source: 'camera' | 'library') { const p = await pickPhoto(source); if (p) await run(p, stockOnly); }
  return (
    <View style={{ gap: 12 }}>
      <Hint icon="camera">{t('tl.fs.help')}</Hint>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Btn icon="camera" title={busy ? t('tl.fs.searching') : t('tl.fs.take')} loading={busy} onPress={() => void take('camera')} />
        <Btn variant="secondary" title={t('tl.fs.library')} onPress={() => void take('library')} />
      </View>
      <Switch label={t('tl.fs.stockOnly')} value={stockOnly} onChange={(v) => { setStockOnly(v); if (last) void run(last, v); }} />
      {error ? <ErrorNote message={error} /> : null}
      {busy && !res ? <Skeleton rows={2} /> : null}
      {preview ? (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Image source={{ uri: preview }} style={{ width: 110, height: 110, borderRadius: 12 }} />
          <View style={{ flex: 1, gap: 4 }}>
            {res?.sampleColors?.length ? <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><ThemedText type="small">{t('tl.fs.colors')}</ThemedText>{res.sampleColors.map((c) => <View key={c} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c, borderWidth: 1, borderColor: '#9ca3af' }} />)}</View> : null}
            <ThemedText type="small" themeColor="textSecondary">{t('tl.fs.tips')}</ThemedText>
          </View>
        </View>
      ) : null}
      {res && res.matches.length === 0 ? <Empty icon="search" title={t('tl.fs.none')} text={t('tl.fs.noneText')} /> : null}
      {res && res.matches.length > 0 ? (
        <>
          <SectionTitle title={t('tl.fs.results', { n: res.matches.length })} />
          <Stack gap={8}>{res.matches.map((m) => {
            const v = m.image ? (m.image.variants.sm ?? Object.values(m.image.variants)[0]) : null;
            return (
              <Card key={m.productId}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {v ? <Image source={{ uri: v.webp }} style={{ width: 84, height: 84, borderRadius: 10 }} /> : null}
                  <View style={{ flex: 1, gap: 2 }}>
                    <ThemedText type="smallBold">{m.name}</ThemedText>
                    <Badge tone={m.similarity >= 80 ? 'success' : m.similarity >= 60 ? 'warning' : 'neutral'}>{t('tl.fs.similar', { n: m.similarity })}</Badge>
                    <ThemedText type="small">{shop.money(m.salePrice)} / {m.unit}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{Number(m.stock) > 0 ? t('tl.fs.stock', { n: Number(m.stock), unit: m.unit }) : t('tl.fs.outOfStock')}</ThemedText>
                  </View>
                </View>
                {onPick ? <Btn small title={t('tl.fs.use')} onPress={() => onPick(m)} /> : null}
              </Card>
            );
          })}</Stack>
          {res.pending > 0 ? <ThemedText type="small" themeColor="textSecondary">{t('tl.fs.pending', { n: res.pending })}</ThemedText> : null}
        </>
      ) : null}
    </View>
  );
}

export function FabricSearchSheet({ onClose, onPick }: { onClose: () => void; onPick: (m: FabricMatch) => void }) {
  const { t } = useT();
  return <Sheet visible tall title={t('tl.fabrics')} onClose={onClose}><FabricSearchBody onPick={onPick} /></Sheet>;
}

export default function TailorFabrics({ item, tab }: PageProps) {
  const shop = useShop();
  return <Screen tabs={tab} title={shop.tr(item.label)}><FabricSearchBody /></Screen>;
}
