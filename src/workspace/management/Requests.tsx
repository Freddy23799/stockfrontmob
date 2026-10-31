import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { SelectField } from '@/components/dynamic-fields';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Empty, ErrorNote, Hint, Screen, SectionTitle, Skeleton, Stack, TextBox, useToast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError, NetworkError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { FeatureRequest } from '@/lib/org';
import { ListFooter } from '@/components/list-footer';
import { useProgressive } from '@/lib/list';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

type CatalogFeature = { code: string; name: string; core: boolean };

const TONE: Record<FeatureRequest['status'], Tone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' };

/** Espace du sous-admin : demander une fonctionnalite au proprietaire (qui decide) et suivre les reponses. */
export default function Requests() {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const mine = useQuery<FeatureRequest[]>(shop.siteAdmin ? '/api/shop/feature-requests' : null);
  const catalog = useQuery<{ features: CatalogFeature[] }>(shop.siteAdmin ? `/api/public/onboarding?lang=${lang}` : null);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const history = useMemo(() => mine.data ?? [], [mine.data]);
  const progressive = useProgressive(history, 10);
  const pending = useMemo(() => new Set((mine.data ?? []).filter((r) => r.status === 'PENDING').map((r) => r.featureCode)), [mine.data]);
  const options = (catalog.data?.features ?? []).filter((f) => !f.core && !shop.has(f.code) && !pending.has(f.code));

  if (!shop.siteAdmin || !shop.delegated('REQUEST_FEATURES')) return <Screen title={t('req.screen')}><Empty icon="lock" title={t('ws.noAccess')} text={t('req.noRight')} /></Screen>;
  if (mine.error && !mine.data) return <Screen title={t('req.screen')}><ErrorNote message={mine.error === 'network' ? t('common.network') : mine.error} onRetry={mine.reload} /></Screen>;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await shop.call('/api/shop/feature-requests', { method: 'POST', body: { featureCode: code, note: note.trim() || null } });
      setCode('');
      setNote('');
      toast(t('req.sent'));
      await mine.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof NetworkError ? t('common.network') : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t('req.screen')} subtitle={t('req.subtitle')} onRefresh={async () => { await mine.reload(); await catalog.reload(); }} onEndReached={progressive.loadMore}>
      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('req.new')}</ThemedText>
        {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
        {catalog.data && options.length === 0 ? <Hint icon="circle-info">{t('req.nothing')}</Hint> : (
          <>
            <SelectField label={t('req.feature')} value={code} onChange={setCode} options={options.map((f) => ({ value: f.code, label: f.name }))} />
            <TextBox label={t('req.note')} value={note} onChangeText={setNote} maxLength={500} multiline numberOfLines={3} autoCapitalize="sentences" />
            <Btn icon="paper-plane" title={t('req.send')} loading={busy} disabled={busy || !code || shop.offline} onPress={submit} />
          </>
        )}
      </Card>

      <Stack gap={8}>
        <SectionTitle title={t('req.title')} />
        {!mine.data ? <Skeleton rows={2} height={72} /> : mine.data.length === 0 ? <Empty icon="inbox" title={t('req.none')} /> : progressive.visible.map((r) => (
          <Card key={r.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ThemedText type="smallBold" style={{ flex: 1 }}>{r.featureName}</ThemedText>
              <Badge tone={TONE[r.status]}>{t(`req.${r.status}`)}</Badge>
            </View>
            <ThemedText type="small" themeColor="textSecondary">{formatDateTime(r.createdAt, lang)}</ThemedText>
            {r.note ? <ThemedText type="small">{r.note}</ThemedText> : null}
            {r.decisionNote ? <ThemedText type="small" themeColor="textSecondary">{r.decisionNote}</ThemedText> : null}
          </Card>
        ))}
        <ListFooter shown={progressive.visible.length} total={progressive.total} hasMore={progressive.hasMore} onMore={progressive.loadMore} />
      </Stack>
    </Screen>
  );
}
