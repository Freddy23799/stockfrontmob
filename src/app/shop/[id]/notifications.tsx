import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Btn, Chips, Empty, ErrorNote, IconBadge, IconBtn, Screen, Skeleton, type Tone } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { ago, pick, useNotifications } from '@/lib/notifications';
import { routeFor } from '@/lib/push';

type Item = { id: string; family: 'SHOP' | 'SYSTEM'; category: string; title: Record<string, string>; body: Record<string, string>; url: string | null; severity: 'INFO' | 'WARNING' | 'DANGER' | 'SUCCESS'; createdAt: string; readAt: string | null };
type Page = { items: Item[]; hasMore: boolean };
type Filter = 'ALL' | 'UNREAD' | 'SHOP' | 'SYSTEM';

const PAGE = 25;
const TONE: Record<Item['severity'], { tone: Tone; icon: string }> = {
  INFO: { tone: 'info', icon: 'circle-info' },
  SUCCESS: { tone: 'success', icon: 'circle-check' },
  WARNING: { tone: 'warning', icon: 'triangle-exclamation' },
  DANGER: { tone: 'danger', icon: 'triangle-exclamation' },
};

/** Page complete des notifications : filtres, marquer comme lu, supprimer, ouvrir la page concernee. */
export default function NotificationsScreen() {
  const { t, lang } = useT();
  const th = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { counts, refresh } = useNotifications();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [items, setItems] = useState<Item[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: String(PAGE) });
      if (filter === 'UNREAD') q.set('unreadOnly', 'true');
      if (filter === 'SHOP' || filter === 'SYSTEM') q.set('family', filter);
      if (before) q.set('before', before);
      const res = await api<Page>(`/api/notifications?${q}`, { shop: id });
      setItems((cur) => (before && cur ? [...cur, ...res.items] : res.items));
      setMore(res.hasMore);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.network'));
    } finally {
      setLoading(false);
    }
  }, [filter, id, t]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);   // hors du corps de l'effet : pas de setState synchrone
    return () => clearTimeout(timer);
  }, [load]);

  async function open(n: Item) {
    if (!n.readAt) {
      setItems((cur) => cur?.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)) ?? cur);
      api(`/api/notifications/${n.id}/read`, { method: 'PATCH', shop: id }).then(refresh).catch(() => undefined);
    }
    const route = routeFor(n.url);
    if (route) router.push(route as never);
  }
  async function remove(n: Item) {
    setItems((cur) => cur?.filter((i) => i.id !== n.id) ?? cur);
    await api(`/api/notifications/${n.id}`, { method: 'DELETE', shop: id }).catch(() => undefined);
    await refresh();
  }
  async function readAll() {
    const family = filter === 'SHOP' || filter === 'SYSTEM' ? `?family=${filter}` : '';
    await api(`/api/notifications/read-all${family}`, { method: 'POST', shop: id }).catch(() => undefined);
    await load();
    await refresh();
  }

  const filters: { value: Filter; label: string }[] = [
    { value: 'ALL', label: t('notif.filter.all') },
    { value: 'UNREAD', label: t('notif.filter.unread') },
    { value: 'SHOP', label: t('notif.tabShop') },
    { value: 'SYSTEM', label: t('notif.tabSystem') },
  ];
  return (
    <Screen title={t('notif.title')} subtitle={counts.total > 0 ? t('notif.rowUnread', { count: counts.total }) : t('notif.rowAllRead')}
      onRefresh={async () => { await load(); await refresh(); }} onEndReached={more && !loading ? () => void load(items?.[items.length - 1]?.createdAt) : undefined}
      right={counts.total > 0 ? <IconBtn name="check-double" label={t('notif.markAll')} onPress={() => void readAll()} /> : undefined}>
      <Chips value={filter} onChange={(v) => { setItems(null); setFilter(v as Filter); }} options={filters} />
      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}
      {items === null && !error ? <Skeleton rows={4} height={72} /> : null}
      {items?.length === 0 ? <Empty icon="bell" title={t(filter === 'UNREAD' ? 'notif.emptyUnread' : 'notif.emptyAll')} /> : null}
      <View style={{ gap: 8 }}>
        {items?.map((n) => (
          <View key={n.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, backgroundColor: th.backgroundElement, paddingRight: 8 }}>
            {/* zone cliquable et croix de suppression sont des freres : jamais un bouton dans un bouton */}
            <Pressable onPress={() => void open(n)} accessibilityRole="button" style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center' }, pressed && { opacity: 0.7 }]}>
              <IconBadge name={TONE[n.severity].icon} tone={TONE[n.severity].tone} />
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText type="smallBold" numberOfLines={2}>{pick(n.title, lang)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>{pick(n.body, lang)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{ago(n.createdAt, lang)}{n.readAt ? '' : ' · ●'}</ThemedText>
              </View>
            </Pressable>
            <IconBtn name="xmark" label={t('notif.delete')} size={34} onPress={() => void remove(n)} />
          </View>
        ))}
      </View>
      {more && !loading && items ? <Btn variant="secondary" title={t('notif.more')} onPress={() => void load(items[items.length - 1]?.createdAt)} /> : null}
    </Screen>
  );
}
