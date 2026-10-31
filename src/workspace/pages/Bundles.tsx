import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Card, Empty, ErrorNote, Screen, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import { API, num } from '@/lib/electronics';
import { useProgressive } from '@/lib/list';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { ListFooter } from '@/components/list-footer';
import type { PageProps } from '../registry';

type Bundle = { id: string; name: string; price: number | string; listTotal: number | string; saving: number | string; active: boolean; available: number | string; items: { productId: string; name: string; quantity: number | string }[] };
const NONE: Bundle[] = [];

/** Packs vendus a prix unique (telephone + coque + verre) : consultation et stock disponible. La creation se fait depuis le site. */
export default function Bundles({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const q = useQuery<Bundle[]>(`${API}/bundles`);
  const prog = useProgressive(q.data ?? NONE, 15);
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('el.bundlesSubtitle')} onEndReached={prog.loadMore}>
      {q.error && !q.data ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
      {q.loading && !q.data ? <Skeleton rows={3} height={90} /> : (q.data ?? []).length === 0 ? <Empty icon="box" title={t('el.bundlesEmpty')} text={t('el.bundlesEmptyText')} /> : (
        <View style={{ gap: 8 }}>
          {prog.visible.map((b) => (
            <Card key={b.id}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <ThemedText type="smallBold" style={{ flex: 1 }}>{b.name}</ThemedText>
                {!b.active ? <Badge tone="warning">{t('el.inactive')}</Badge> : null}
                <ThemedText type="smallBold">{shop.money(b.price)}</ThemedText>
              </View>
              {b.items.map((i) => <ThemedText key={i.productId} type="small" themeColor="textSecondary">{num(i.quantity)} × {i.name}</ThemedText>)}
              <ThemedText type="small">{t('el.bundleListTotal')} : {shop.money(b.listTotal)}{num(b.saving) > 0 ? ` · ${t('el.bundleSaving')} : ${shop.money(b.saving)}` : ''} · {t('el.bundleAvailable')} : {num(b.available)}</ThemedText>
            </Card>
          ))}
          <ListFooter shown={prog.visible.length} total={prog.total} hasMore={prog.hasMore} onMore={prog.loadMore} loading={false} failed={false} />
        </View>
      )}
    </Screen>
  );
}
