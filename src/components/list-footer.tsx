import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Btn } from '@/components/ui';
import { useT } from '@/i18n';

/**
 * Pied d'une liste qui se charge par morceaux : compteur « 15 sur 120 affichés » et bouton « Voir la suite » de secours
 * (la suite arrive deja toute seule quand on approche du bas : voir Screen.onEndReached).
 */
export function ListFooter({ shown, total, hasMore, loading, failed, onMore }: { shown: number; total: number; hasMore: boolean; loading?: boolean; failed?: boolean; onMore: () => void }) {
  const { t } = useT();
  if (total === 0) return null;
  return (
    <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
      {failed ? <ThemedText type="small" themeColor="danger">{t('list.failed')}</ThemedText> : null}
      {hasMore ? <Btn small variant="ghost" title={loading ? t('list.loadingMore') : failed ? t('list.retry') : t('list.more')} onPress={onMore} loading={loading} /> : null}
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{hasMore ? t('list.shown', { count: shown, total }) : shown > 20 ? t('list.end') : ''}</ThemedText>
    </View>
  );
}
