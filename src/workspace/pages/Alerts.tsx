import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Screen, Skeleton, Stack, type Tone } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { formatDate, num } from '@/lib/format';
import { useGo } from '@/lib/nav';
import { ListFooter } from '@/components/list-footer';
import { useProgressive } from '@/lib/list';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';
import { AdjustSheet, WriteOffSheet } from './Stock';

const ORDER = ['LOT_EXPIRED', 'LOT_EXPIRING', 'NEGATIVE_STOCK', 'OUT_OF_STOCK', 'LOW_STOCK'];
const ICON: Record<string, string> = { LOT_EXPIRED: 'calendar-xmark', LOT_EXPIRING: 'hourglass', NEGATIVE_STOCK: 'triangle-exclamation', OUT_OF_STOCK: 'box', LOW_STOCK: 'triangle-exclamation' };
type Alert = { type: string; severity: string; productId: string; productName: string; lotId?: string; lotNumber?: string; expiryDate?: string; daysLeft?: number; quantity: number; unit: string; threshold?: number };
type Data = { counts: Record<string, number>; items: Alert[] };

export default function Alerts({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const go = useGo();
  const [type, setType] = useState('');
  const [adjust, setAdjust] = useState<Alert | null>(null);
  const [off, setOff] = useState<Alert | null>(null);
  const q = useQuery<Data>(`/api/shop/alerts${type ? `?type=${type}` : ''}`);
  const alerts = useMemo(() => q.data?.items ?? [], [q.data]);
  const progressive = useProgressive(alerts, 15);   // jusqu'a 200 alertes par type : 15 cartes a la fois, la suite au defilement
  const kinds = q.data ? ORDER.filter((k) => k in q.data!.counts) : [];
  const total = q.data ? kinds.reduce((a, k) => a + q.data!.counts[k], 0) : 0;

  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('mob.alertsHint')} onRefresh={q.reload} onEndReached={progressive.loadMore} right={total > 0 ? <PdfButton small path="/api/shop/pdf/alerts" params={{ type }} name="alertes-stock.pdf" /> : undefined}>
      {q.error && !q.data ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
      {!q.data && !q.error ? <Skeleton rows={4} height={80} /> : null}
      {q.data ? (
        <Stack gap={10}>
          <Chips value={type} onChange={setType} options={[{ value: '', label: `${t('ws.all')} (${total})` }, ...kinds.map((k) => ({ value: k, label: `${t(`ws.a.${k}`)} (${q.data!.counts[k]})` }))]} />
          {alerts.length === 0 ? <Empty icon="check-double" title={t('ws.allClear')} text={t('ws.allClearText')} /> : progressive.visible.map((a, i) => {
            const tone: Tone = a.severity === 'DANGER' ? 'danger' : 'warning';
            return (
              <Card key={`${a.type}-${a.productId}-${a.lotId ?? i}`} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: a.severity === 'DANGER' ? th.dangerBg : th.warningBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={ICON[a.type] ?? 'bell'} size={16} color={a.severity === 'DANGER' ? th.danger : th.warning} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText type="smallBold" numberOfLines={2}>{a.productName}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                      {t(`ws.a.${a.type}`)}{a.lotNumber ? ` · ${shop.v('lot')} ${a.lotNumber}` : ''}
                      {a.expiryDate ? ` · ${formatDate(a.expiryDate, lang)} (${(a.daysLeft ?? 0) < 0 ? t('ws.expiredAgo', { days: -(a.daysLeft ?? 0) }) : t('ws.daysLeft', { days: a.daysLeft ?? 0 })})` : ''}
                      {a.threshold != null ? ` · ${t('ws.min')} ${num(a.threshold)}` : ''}
                    </ThemedText>
                  </View>
                  <Badge tone={tone}>{num(a.quantity)} {a.unit}</Badge>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {a.type === 'LOT_EXPIRED' && shop.has('INVENTORY') && shop.can('INVENTORY', 'update') ? <Btn small variant="danger" icon="ban" title={t('ws.writeOff')} onPress={() => setOff(a)} /> : null}
                  {!a.lotId && go.first('purchases') && shop.can('PURCHASE_ORDERS', 'create') ? <Btn small variant="secondary" icon="truck" title={t('ws.reorder')} onPress={() => go.page('purchases', { order: a.productId })} /> : null}
                  {!a.lotId && shop.can('STOCK', 'update') ? <Btn small variant="secondary" icon="sliders" title={t('ws.adjustStock')} onPress={() => setAdjust(a)} /> : null}
                </View>
              </Card>
            );
          })}
          <ListFooter shown={progressive.visible.length} total={progressive.total} hasMore={progressive.hasMore} onMore={progressive.loadMore} />
        </Stack>
      ) : null}
      {adjust ? <AdjustSheet preset={{ product: { id: adjust.productId, name: adjust.productName, trackLots: false, stock: adjust.quantity } }} onClose={() => setAdjust(null)} onDone={() => { setAdjust(null); void q.reload(); }} /> : null}
      {off ? <WriteOffSheet lot={{ id: off.lotId!, lotNumber: off.lotNumber ?? '', quantity: off.quantity, productName: off.productName, status: 'EXPIRED' }} onClose={() => setOff(null)} onDone={() => { setOff(null); void q.reload(); }} /> : null}
    </Screen>
  );
}
