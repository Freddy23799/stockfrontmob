import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, Input, Screen, SectionTitle, Skeleton, Stack, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError, apiBlob } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { downloadPdf, saveBlob } from '@/lib/pdf';
import { ListFooter } from '@/components/list-footer';
import { useProgressive } from '@/lib/list';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

type Item = {
  id: string; filename: string; kind: string; sizeBytes: number; createdAt: string; lastDownloadedAt: string; downloadCount: number;
  replayPath: string; replayQuery?: string | null; shopId?: string | null; shopName?: string | null; stored: boolean;
};

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`);

/**
 * Mes telechargements : les 50 derniers PDF de l'utilisateur (rapports, recus, releves...). Chaque ligne se retelecharge a l'identique,
 * ou se met a jour avec les donnees actuelles. Le serveur l'alimente seul ; la liste reste lisible hors ligne.
 */
export default function Downloads() {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const toast = useToast();
  const q = useQuery<{ items: Item[]; max: number }>('/api/shop/downloads');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const label = (k: string) => { const key = `dl.kind.${k}`; const text = t(key); return text === key ? t('dl.kind.document') : text; };
  const kinds = useMemo(() => [...new Set(items.map((i) => i.kind))], [items]);
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((i) => (!kind || i.kind === kind) && (!needle || `${i.filename} ${label(i.kind)} ${i.shopName ?? ''}`.toLowerCase().includes(needle)));
  }, [items, search, kind, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // jamais plus de 12 cartes construites d'un coup : la suite arrive au defilement
  const progressive = useProgressive(shown, 12);
  const groups = useMemo(() => {
    const out: { key: string; at: string; items: Item[] }[] = [];
    progressive.visible.forEach((item) => {
      const key = new Date(item.createdAt).toDateString();
      if (out.at(-1)?.key !== key) out.push({ key, at: item.createdAt, items: [] });
      out.at(-1)!.items.push(item);
    });
    return out;
  }, [progressive.visible]);

  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return t('dl.today');
    if (d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return t('dl.yesterday');
    return new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  };
  const time = (iso: string) => new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const when = (iso: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  async function run(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try { await action(); await q.reload(); } catch (e) { setError(e instanceof ApiError ? e.message : t('dl.failed')); } finally { setBusy(null); }
  }
  const again = (i: Item) => run(i.id, async () => saveBlob(await apiBlob(`/api/shop/downloads/${i.id}/file`, { shop: shop.shopId }), i.filename));
  const refresh = (i: Item) => run(i.id, () => downloadPdf(i.replayPath + (i.replayQuery ? `?${i.replayQuery}` : ''),
    { shop: i.replayPath.startsWith('/api/shop/') ? shop.shopId : i.shopId ?? '', name: i.filename }));
  const remove = async (i: Item) => {
    if (!(await confirmAction(t('dl.deleteTitle'), t('dl.deleteText'), t('dl.delete'), t('common.cancel')))) return;
    await run(i.id, async () => { await shop.call(`/api/shop/downloads/${i.id}`, { method: 'DELETE' }); toast(t('dl.deleted')); });
  };
  const clear = async () => {
    if (!(await confirmAction(t('dl.clearTitle'), t('dl.clearText', { count: items.length }), t('dl.clear'), t('common.cancel')))) return;
    await run('all', async () => { await shop.call('/api/shop/downloads', { method: 'DELETE' }); toast(t('dl.cleared')); });
  };

  if (q.error && !q.data) return <Screen title={t('dl.nav')}><ErrorNote message={q.error === 'network' ? t('common.network') : q.error} onRetry={q.reload} /></Screen>;
  const max = q.data?.max ?? 50;
  const offline = shop.offline;

  return (
    <Screen title={t('dl.nav')} subtitle={q.data ? t('dl.count', { count: items.length, max }) : undefined} onRefresh={q.reload} onEndReached={progressive.loadMore}
      right={items.length > 0 ? <IconBtn name="trash" label={t('dl.clear')} tone="danger" onPress={clear} /> : undefined}>
      {q.stale || offline ? <Hint icon="cloud" tone="warning">{t('mob.showingSaved')}</Hint> : null}
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {!q.data ? <Skeleton rows={4} height={110} /> : null}
      {q.data && items.length === 0 ? <Empty icon="download" title={t('dl.empty')} text={t('dl.emptyText')} /> : null}
      {items.length > 0 ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">{t('dl.subtitle', { max })}</ThemedText>
          <Input value={search} onChangeText={setSearch} placeholder={t('dl.search')} autoCapitalize="none" returnKeyType="search" />
          {kinds.length > 1 ? <Chips value={kind} onChange={setKind} options={[{ value: '', label: t('dl.allTypes') }, ...kinds.map((k) => ({ value: k, label: label(k) }))]} /> : null}
          {groups.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('dl.noMatch')}</ThemedText> : groups.map((g) => (
            <Stack key={g.key} gap={8}>
              <SectionTitle title={dayLabel(g.at)} />
              {g.items.map((i) => (
                <Card key={i.id} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: th.backgroundSelected }}>
                      <Icon name="file-pdf" size={17} color={th.primary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <ThemedText type="smallBold" numberOfLines={2}>{label(i.kind)}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ fontSize: 12 }}>{i.filename}</ThemedText>
                    </View>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                    {[t('dl.downloadedAt', { time: time(i.createdAt) }), size(i.sizeBytes), i.shopName ?? t('dl.allShops')].join(' · ')}
                  </ThemedText>
                  {i.downloadCount > 1 ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{t('dl.times', { count: i.downloadCount })} · {t('dl.lastAt', { when: when(i.lastDownloadedAt) })}</ThemedText> : null}
                  {!i.stored ? <Badge tone="warning">{t('dl.notKept')}</Badge> : null}
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    {i.stored ? <Btn small icon="download" title={t('dl.againShort')} loading={busy === i.id} disabled={busy != null || offline} onPress={() => again(i)} style={{ flex: 1 }} /> : null}
                    <Btn small variant="secondary" icon="arrows-rotate" title={t('dl.refresh')} disabled={busy != null || offline} onPress={() => refresh(i)} style={{ flex: 1 }} />
                    <IconBtn name="trash" label={t('dl.delete')} tone="danger" size={40} onPress={() => remove(i)} />
                  </View>
                </Card>
              ))}
            </Stack>
          ))}
          <ListFooter shown={progressive.visible.length} total={progressive.total} hasMore={progressive.hasMore} onMore={progressive.loadMore} />
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>{t('dl.private')}</ThemedText>
        </>
      ) : null}
    </Screen>
  );
}
