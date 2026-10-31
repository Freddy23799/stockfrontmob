import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Empty, Hint, Screen, Stack } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { useOffline } from '@/lib/offline';

/** Ce qui attend d'etre envoye au serveur : rien n'est perdu, tout est visible, et l'utilisateur garde la main. */
export default function SyncScreen() {
  const { t, lang } = useT();
  const off = useOffline();
  return (
    <Screen title={t('mob.syncTitle')} subtitle={off.online ? t('mob.online') : t('mob.offline')}>
      <Hint icon="circle-info">{t('mob.syncExplain')}</Hint>
      {off.items.length === 0 ? <Empty icon="cloud-arrow-up" title={t('mob.syncEmpty')} text={t('mob.syncEmptyText')} /> : (
        <Stack gap={10}>
          <Btn icon="arrows-rotate" title={off.syncing ? t('mob.syncing') : t('mob.syncNow')} loading={off.syncing} disabled={!off.online} onPress={() => void off.flush()} />
          {off.items.map((i) => (
            <Card key={i.id} tone={i.state === 'failed' ? 'danger' : undefined} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={2}>{i.label}</ThemedText>
                <Badge tone={i.state === 'failed' ? 'danger' : 'warning'}>{i.state === 'failed' ? t('mob.refused') : t('mob.waiting')}</Badge>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{formatDateTime(new Date(i.createdAt).toISOString(), lang)}</ThemedText>
              {i.error ? <ThemedText type="small" themeColor="danger">{i.error}</ThemedText> : null}
              {i.state === 'failed' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn small title={t('common.retry')} variant="secondary" onPress={() => void off.retry(i.id)} />
                  <Btn small title={t('mob.discard')} variant="danger" onPress={() => void off.discard(i.id)} />
                </View>
              ) : null}
            </Card>
          ))}
        </Stack>
      )}
    </Screen>
  );
}
