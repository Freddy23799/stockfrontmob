import { router } from 'expo-router';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Grid, Row } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { useSupportUnread } from '@/lib/support';

/** « A propos » et « Service client » cote a cote (reglages, compte, menu Plus). La pastille compte les reponses non lues. */
export function HelpRows({ shopId }: { shopId: string }) {
  const th = useTheme();
  const { t } = useT();
  const { count } = useSupportUnread(shopId);
  return (
    <Grid min={300} gap={8}>
      <Row icon="circle-info" tone="neutral" title={t('about.title')} subtitle={t('about.rowText')} onPress={() => router.push(`/shop/${shopId}/about` as never)} />
      <Row icon="headset" tone="info" title={t('support.title')} subtitle={count > 0 ? t(count === 1 ? 'support.rowUnread_one' : 'support.rowUnread_other', { count }) : t('support.rowText')}
        right={count > 0 ? <View style={{ minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 12, backgroundColor: th.primary, alignItems: 'center', justifyContent: 'center' }}><ThemedText type="smallBold" style={{ color: th.primaryText, fontSize: 12, lineHeight: 16 }}>{count > 99 ? '99+' : count}</ThemedText></View> : undefined}
        onPress={() => router.push(`/shop/${shopId}/support` as never)} />
    </Grid>
  );
}
